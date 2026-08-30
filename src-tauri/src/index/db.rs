use std::{fs, path::PathBuf};

use rusqlite::{params, Connection, OptionalExtension};

use crate::domain::{
    metadata::{album_key, comparison_key},
    track::IndexedTrack,
};

#[derive(Debug, Clone)]
pub struct IndexDatabase {
    path: PathBuf,
}

impl IndexDatabase {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let parent = path
            .parent()
            .ok_or_else(|| format!("Index path has no parent: {}", path.display()))?;
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Could not create index directory {}: {error}",
                parent.display()
            )
        })?;
        let database = Self { path };
        let mut connection = database.connect()?;
        migrate(&mut connection)?;
        Ok(database)
    }

    pub fn open_for_library(path: PathBuf, library_id: uuid::Uuid) -> Result<Self, String> {
        let database = Self::open(path)?;
        database.hydrate_migrated_album_keys(library_id)?;
        Ok(database)
    }

    #[cfg(test)]
    pub fn path(&self) -> &std::path::Path {
        &self.path
    }

    #[cfg(test)]
    pub fn track_title(&self, rel_path: &str) -> Result<Option<String>, String> {
        let connection = self.connect()?;
        connection
            .query_row(
                "SELECT title FROM tracks WHERE rel_path = ?1",
                [rel_path],
                |row| row.get(0),
            )
            .optional()
            .map_err(sql_error)
    }

    #[cfg(test)]
    pub fn scan_failure_message(&self, rel_path: &str) -> Result<Option<String>, String> {
        let connection = self.connect()?;
        connection
            .query_row(
                "SELECT message FROM scan_failures WHERE rel_path = ?1",
                [rel_path],
                |row| row.get(0),
            )
            .optional()
            .map_err(sql_error)
    }

    pub fn track_count(&self) -> Result<u64, String> {
        let connection = self.connect()?;
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .map_err(sql_error)?;
        u64::try_from(count).map_err(|_| "Local index returned an invalid track count".to_owned())
    }

    pub fn scan_session(&self, marker: i64) -> Result<IndexScanSession, String> {
        let connection = self.connect()?;
        connection
            .execute_batch("BEGIN IMMEDIATE TRANSACTION;")
            .map_err(sql_error)?;
        Ok(IndexScanSession {
            connection: Some(connection),
            marker,
        })
    }

    fn hydrate_migrated_album_keys(&self, library_id: uuid::Uuid) -> Result<(), String> {
        let mut connection = self.connect()?;
        let rows = {
            let mut statement = connection
                .prepare(
                    r#"
                    SELECT rel_path, album_artist, artist, album, year, compilation
                    FROM tracks
                    WHERE album_key = ''
                    "#,
                )
                .map_err(sql_error)?;
            let mapped = statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<i64>>(4)?,
                        row.get::<_, i64>(5)? != 0,
                    ))
                })
                .map_err(sql_error)?;
            mapped.collect::<Result<Vec<_>, _>>().map_err(sql_error)?
        };
        if rows.is_empty() {
            return Ok(());
        }
        let transaction = connection.transaction().map_err(sql_error)?;
        for (rel_path, album_artist, artist, album, year, compilation) in rows {
            let key = album_key(
                library_id,
                &rel_path,
                album_artist.as_deref(),
                artist.as_deref(),
                album.as_deref(),
                year,
                compilation,
            );
            transaction
                .execute(
                    "UPDATE tracks SET album_key = ?1 WHERE rel_path = ?2",
                    params![key.to_string(), rel_path],
                )
                .map_err(sql_error)?;
        }
        transaction.commit().map_err(sql_error)
    }

    pub(crate) fn connect(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.path).map_err(sql_error)?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
            )
            .map_err(sql_error)?;
        Ok(connection)
    }
}

pub struct IndexScanSession {
    connection: Option<Connection>,
    marker: i64,
}

impl IndexScanSession {
    pub fn is_unchanged(
        &self,
        rel_path: &str,
        file_size: i64,
        mtime_ns: i64,
    ) -> Result<bool, String> {
        let track_fingerprint = self
            .connection()
            .query_row(
                "SELECT file_size, mtime_ns FROM tracks WHERE rel_path = ?1",
                [rel_path],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(sql_error)?;
        let failure_fingerprint = self
            .connection()
            .query_row(
                "SELECT file_size, mtime_ns FROM scan_failures WHERE rel_path = ?1",
                [rel_path],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .optional()
            .map_err(sql_error)?;
        Ok(
            matches!(track_fingerprint.or(failure_fingerprint), Some((size, modified)) if size == file_size && modified == mtime_ns),
        )
    }

    pub fn touch_unchanged(&self, rel_path: &str) -> Result<(), String> {
        self.connection()
            .execute(
                "UPDATE tracks SET scanned_at = ?1 WHERE rel_path = ?2",
                params![self.marker, rel_path],
            )
            .map_err(sql_error)?;
        self.connection()
            .execute(
                "UPDATE scan_failures SET scanned_at = ?1 WHERE rel_path = ?2",
                params![self.marker, rel_path],
            )
            .map_err(sql_error)?;
        Ok(())
    }

    pub fn upsert_track(&self, track: &IndexedTrack) -> Result<(), String> {
        let genres_json = serde_json::to_string(&track.genres)
            .map_err(|error| format!("Could not serialize indexed genres: {error}"))?;
        let artists_text = track.artists.join("\n");
        let genres_text = track.genres.join("\n");
        let year_text = track.year.map(|year| year.to_string()).unwrap_or_default();
        self.connection()
            .execute(
                r#"
                INSERT INTO tracks (
                    id, album_key, rel_path, title, artist, artists_text, album_artist, album,
                    year, year_text, track_no, disc_no, genres_json, genres_text, composer,
                    duration_ms, codec, container, sample_rate, bit_depth, channels, bitrate,
                    file_size, mtime_ns, artwork_key, added_at, scanned_at, compilation,
                    title_search, album_artist_search, album_search, composer_search,
                    codec_search, path_search
                ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                    ?9, ?10, ?11, ?12, ?13, ?14, ?15,
                    ?16, ?17, ?18, ?19, ?20, ?21, ?22,
                    ?23, ?24, ?25, ?26, ?27, ?28,
                    ?29, ?30, ?31, ?32, ?33, ?34
                )
                ON CONFLICT(rel_path) DO UPDATE SET
                    id = excluded.id,
                    album_key = excluded.album_key,
                    title = excluded.title,
                    artist = excluded.artist,
                    artists_text = excluded.artists_text,
                    album_artist = excluded.album_artist,
                    album = excluded.album,
                    year = excluded.year,
                    year_text = excluded.year_text,
                    track_no = excluded.track_no,
                    disc_no = excluded.disc_no,
                    genres_json = excluded.genres_json,
                    genres_text = excluded.genres_text,
                    composer = excluded.composer,
                    duration_ms = excluded.duration_ms,
                    codec = excluded.codec,
                    container = excluded.container,
                    sample_rate = excluded.sample_rate,
                    bit_depth = excluded.bit_depth,
                    channels = excluded.channels,
                    bitrate = excluded.bitrate,
                    file_size = excluded.file_size,
                    mtime_ns = excluded.mtime_ns,
                    artwork_key = excluded.artwork_key,
                    scanned_at = excluded.scanned_at,
                    compilation = excluded.compilation,
                    title_search = excluded.title_search,
                    album_artist_search = excluded.album_artist_search,
                    album_search = excluded.album_search,
                    composer_search = excluded.composer_search,
                    codec_search = excluded.codec_search,
                    path_search = excluded.path_search
                "#,
                params![
                    track.id.to_string(),
                    track.album_key.to_string(),
                    track.rel_path,
                    track.title,
                    track.artist,
                    artists_text,
                    track.album_artist,
                    track.album,
                    track.year,
                    year_text,
                    track.track_no,
                    track.disc_no,
                    genres_json,
                    genres_text,
                    track.composer,
                    track.duration_ms,
                    track.codec,
                    track.container,
                    track.sample_rate,
                    track.bit_depth,
                    track.channels,
                    track.bitrate,
                    track.file_size,
                    track.mtime_ns,
                    track.artwork_key,
                    self.marker,
                    self.marker,
                    track.compilation,
                    track.title.as_deref().map(comparison_key),
                    track.album_artist.as_deref().map(comparison_key),
                    track.album.as_deref().map(comparison_key),
                    track.composer.as_deref().map(comparison_key),
                    track.codec.as_deref().map(comparison_key),
                    comparison_key(&track.rel_path),
                ],
            )
            .map_err(sql_error)?;
        self.clear_failure(&track.rel_path)
            .and_then(|_| self.replace_relations(track))
    }

    pub fn record_failure(
        &self,
        rel_path: &str,
        file_size: i64,
        mtime_ns: i64,
        message: &str,
    ) -> Result<(), String> {
        let message = truncate(message, 16 * 1024);
        self.connection()
            .execute(
                r#"
                INSERT INTO scan_failures (rel_path, file_size, mtime_ns, message, scanned_at)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ON CONFLICT(rel_path) DO UPDATE SET
                    file_size = excluded.file_size,
                    mtime_ns = excluded.mtime_ns,
                    message = excluded.message,
                    scanned_at = excluded.scanned_at
                "#,
                params![rel_path, file_size, mtime_ns, message, self.marker],
            )
            .map_err(sql_error)?;
        Ok(())
    }

    pub fn finish(mut self) -> Result<(), String> {
        let connection = self
            .connection
            .take()
            .ok_or_else(|| "Index scan connection is already closed".to_owned())?;
        connection
            .execute("DELETE FROM tracks WHERE scanned_at != ?1", [self.marker])
            .map_err(sql_error)?;
        connection
            .execute(
                "DELETE FROM scan_failures WHERE scanned_at != ?1",
                [self.marker],
            )
            .map_err(sql_error)?;
        connection.execute_batch("COMMIT;").map_err(sql_error)
    }

    pub fn flush_batch(&self) -> Result<(), String> {
        self.connection()
            .execute_batch("COMMIT; BEGIN IMMEDIATE TRANSACTION;")
            .map_err(sql_error)
    }

    fn clear_failure(&self, rel_path: &str) -> Result<(), String> {
        self.connection()
            .execute("DELETE FROM scan_failures WHERE rel_path = ?1", [rel_path])
            .map_err(sql_error)?;
        Ok(())
    }

    fn replace_relations(&self, track: &IndexedTrack) -> Result<(), String> {
        let id = track.id.to_string();
        self.connection()
            .execute("DELETE FROM track_artists WHERE track_id = ?1", [&id])
            .map_err(sql_error)?;
        self.connection()
            .execute("DELETE FROM track_genres WHERE track_id = ?1", [&id])
            .map_err(sql_error)?;

        for (position, artist) in track.artists.iter().enumerate() {
            self.connection()
                .execute(
                    "INSERT INTO track_artists (track_id, artist, normalized_artist, position) VALUES (?1, ?2, ?3, ?4)",
                    params![id, artist, comparison_key(artist), i64::try_from(position).unwrap_or(i64::MAX)],
                )
                .map_err(sql_error)?;
        }
        for (position, genre) in track.genres.iter().enumerate() {
            self.connection()
                .execute(
                    "INSERT INTO track_genres (track_id, genre, normalized_genre, position) VALUES (?1, ?2, ?3, ?4)",
                    params![id, genre, comparison_key(genre), i64::try_from(position).unwrap_or(i64::MAX)],
                )
                .map_err(sql_error)?;
        }
        Ok(())
    }

    fn connection(&self) -> &Connection {
        self.connection
            .as_ref()
            .expect("IndexScanSession methods require an open connection")
    }
}

fn migrate(connection: &mut Connection) -> Result<(), String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(sql_error)?;
    if version > 3 {
        return Err(format!(
            "Local index schema version {version} is newer than Basis supports"
        ));
    }
    if version == 0 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(
                r#"
                CREATE TABLE tracks (
                    id TEXT PRIMARY KEY,
                    rel_path TEXT NOT NULL UNIQUE,
                    title TEXT,
                    artist TEXT,
                    album_artist TEXT,
                    album TEXT,
                    year INTEGER,
                    track_no INTEGER,
                    disc_no INTEGER,
                    genres_json TEXT NOT NULL,
                    composer TEXT,
                    duration_ms INTEGER,
                    codec TEXT,
                    container TEXT,
                    sample_rate INTEGER,
                    bit_depth INTEGER,
                    channels INTEGER,
                    bitrate INTEGER,
                    file_size INTEGER NOT NULL,
                    mtime_ns INTEGER NOT NULL,
                    artwork_key TEXT,
                    added_at INTEGER NOT NULL,
                    scanned_at INTEGER NOT NULL
                );
                CREATE INDEX idx_tracks_album ON tracks(album_artist, album, disc_no, track_no);
                CREATE INDEX idx_tracks_artist ON tracks(artist);
                CREATE INDEX idx_tracks_year ON tracks(year);
                CREATE INDEX idx_tracks_rel_path ON tracks(rel_path);
                CREATE TABLE scan_failures (
                    rel_path TEXT PRIMARY KEY,
                    file_size INTEGER NOT NULL,
                    mtime_ns INTEGER NOT NULL,
                    message TEXT NOT NULL,
                    scanned_at INTEGER NOT NULL
                );
                PRAGMA user_version = 1;
                "#,
            )
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    if version < 2 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS track_artists (
                    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                    artist TEXT NOT NULL,
                    normalized_artist TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    PRIMARY KEY (track_id, position)
                );
                CREATE INDEX IF NOT EXISTS idx_track_artists_normalized ON track_artists(normalized_artist);
                CREATE TABLE IF NOT EXISTS track_genres (
                    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
                    genre TEXT NOT NULL,
                    normalized_genre TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    PRIMARY KEY (track_id, position)
                );
                CREATE INDEX IF NOT EXISTS idx_track_genres_normalized ON track_genres(normalized_genre);
                PRAGMA user_version = 2;
                "#,
            )
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    if version < 3 {
        let transaction = connection.transaction().map_err(sql_error)?;
        transaction
            .execute_batch(
                r#"
                ALTER TABLE tracks ADD COLUMN album_key TEXT NOT NULL DEFAULT '';
                ALTER TABLE tracks ADD COLUMN artists_text TEXT NOT NULL DEFAULT '';
                ALTER TABLE tracks ADD COLUMN genres_text TEXT NOT NULL DEFAULT '';
                ALTER TABLE tracks ADD COLUMN year_text TEXT NOT NULL DEFAULT '';
                ALTER TABLE tracks ADD COLUMN compilation INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE tracks ADD COLUMN title_search TEXT;
                ALTER TABLE tracks ADD COLUMN album_artist_search TEXT;
                ALTER TABLE tracks ADD COLUMN album_search TEXT;
                ALTER TABLE tracks ADD COLUMN composer_search TEXT;
                ALTER TABLE tracks ADD COLUMN codec_search TEXT;
                ALTER TABLE tracks ADD COLUMN path_search TEXT NOT NULL DEFAULT '';
                ALTER TABLE tracks ADD COLUMN last_played INTEGER;
                ALTER TABLE tracks ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE tracks ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;

                UPDATE tracks SET
                    artists_text = COALESCE(artist, ''),
                    genres_text = genres_json,
                    year_text = COALESCE(CAST(year AS TEXT), ''),
                    title_search = LOWER(title),
                    album_artist_search = LOWER(album_artist),
                    album_search = LOWER(album),
                    composer_search = LOWER(composer),
                    codec_search = LOWER(codec),
                    path_search = LOWER(rel_path),
                    mtime_ns = -1;

                CREATE VIRTUAL TABLE tracks_fts USING fts5(
                    title,
                    artists_text,
                    album_artist,
                    album,
                    year_text,
                    genres_text,
                    composer,
                    codec,
                    rel_path,
                    content = 'tracks',
                    content_rowid = 'rowid',
                    tokenize = 'unicode61 remove_diacritics 2'
                );

                CREATE TRIGGER tracks_fts_insert AFTER INSERT ON tracks BEGIN
                    INSERT INTO tracks_fts(
                        rowid, title, artists_text, album_artist, album, year_text,
                        genres_text, composer, codec, rel_path
                    ) VALUES (
                        new.rowid, new.title, new.artists_text, new.album_artist, new.album,
                        new.year_text, new.genres_text, new.composer, new.codec, new.rel_path
                    );
                END;

                CREATE TRIGGER tracks_fts_delete AFTER DELETE ON tracks BEGIN
                    INSERT INTO tracks_fts(
                        tracks_fts, rowid, title, artists_text, album_artist, album,
                        year_text, genres_text, composer, codec, rel_path
                    ) VALUES (
                        'delete', old.rowid, old.title, old.artists_text, old.album_artist,
                        old.album, old.year_text, old.genres_text, old.composer, old.codec,
                        old.rel_path
                    );
                END;

                CREATE TRIGGER tracks_fts_update AFTER UPDATE OF
                    title, artists_text, album_artist, album, year_text,
                    genres_text, composer, codec, rel_path
                ON tracks BEGIN
                    INSERT INTO tracks_fts(
                        tracks_fts, rowid, title, artists_text, album_artist, album,
                        year_text, genres_text, composer, codec, rel_path
                    ) VALUES (
                        'delete', old.rowid, old.title, old.artists_text, old.album_artist,
                        old.album, old.year_text, old.genres_text, old.composer, old.codec,
                        old.rel_path
                    );
                    INSERT INTO tracks_fts(
                        rowid, title, artists_text, album_artist, album, year_text,
                        genres_text, composer, codec, rel_path
                    ) VALUES (
                        new.rowid, new.title, new.artists_text, new.album_artist, new.album,
                        new.year_text, new.genres_text, new.composer, new.codec, new.rel_path
                    );
                END;

                INSERT INTO tracks_fts(tracks_fts) VALUES ('rebuild');
                PRAGMA user_version = 3;
                "#,
            )
            .map_err(sql_error)?;
        transaction.commit().map_err(sql_error)?;
    }
    Ok(())
}

fn sql_error(error: rusqlite::Error) -> String {
    format!("Local index error: {error}")
}

fn truncate(value: &str, max_bytes: usize) -> &str {
    if value.len() <= max_bytes {
        return value;
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

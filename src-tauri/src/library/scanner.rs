use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use ignore::WalkBuilder;
use lofty::{
    file::{AudioFile, TaggedFileExt},
    tag::{Accessor, ItemKey},
};
use uuid::Uuid;

use crate::{
    domain::metadata::album_key,
    domain::track::{IndexedTrack, ScanProgress},
    index::db::IndexDatabase,
    portable::paths::normalize_from_absolute,
};

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav"];
const MAX_EMBEDDED_ARTWORK_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IncrementalIndexOutcome {
    Indexed,
    Removed,
    Unchanged,
    Failed,
}

pub fn scan_library<F>(
    root: &Path,
    library_id: Uuid,
    database: &IndexDatabase,
    artwork_cache_dir: &Path,
    mut publish: F,
) -> Result<ScanProgress, String>
where
    F: FnMut(&ScanProgress),
{
    let marker = epoch_millis(SystemTime::now());
    let session = database.scan_session(marker)?;
    let mut progress = ScanProgress::default();
    publish(&progress);

    let mut walker = WalkBuilder::new(root);
    walker
        .hidden(false)
        .follow_links(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .filter_entry(|entry| entry.file_name() != ".musiclib");

    for entry in walker.build() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                progress.failed = progress.failed.saturating_add(1);
                progress.current_path = Some(format!("Scanner entry error: {error}"));
                publish(&progress);
                continue;
            }
        };
        if !entry
            .file_type()
            .is_some_and(|file_type| file_type.is_file())
        {
            continue;
        }
        if entry.path_is_symlink() || !is_supported_audio_path(entry.path()) {
            continue;
        }

        let rel_path = match normalize_from_absolute(root, entry.path()) {
            Ok(path) => path,
            Err(error) => {
                progress.failed = progress.failed.saturating_add(1);
                progress.current_path = Some(error);
                publish(&progress);
                continue;
            }
        };
        let metadata = match fs::metadata(entry.path()) {
            Ok(metadata) => metadata,
            Err(error) => {
                progress.failed = progress.failed.saturating_add(1);
                progress.current_path = Some(rel_path.clone());
                session.record_failure(
                    &rel_path,
                    0,
                    0,
                    &format!("Could not read file metadata: {error}"),
                )?;
                publish(&progress);
                continue;
            }
        };
        let file_size = i64::try_from(metadata.len()).unwrap_or(i64::MAX);
        let mtime_ns = modified_ns(&metadata);
        progress.discovered = progress.discovered.saturating_add(1);
        progress.current_path = Some(rel_path.clone());

        if session.is_unchanged(&rel_path, file_size, mtime_ns)? {
            session.touch_unchanged(&rel_path)?;
            progress.skipped_unchanged = progress.skipped_unchanged.saturating_add(1);
        } else {
            match read_track(
                entry.path(),
                library_id,
                rel_path.clone(),
                file_size,
                mtime_ns,
                artwork_cache_dir,
            ) {
                Ok(track) => {
                    progress.current_title = track.title.clone();
                    session.upsert_track(&track)?;
                    progress.indexed = progress.indexed.saturating_add(1);
                }
                Err(error) => {
                    progress.current_title = None;
                    session.record_failure(&rel_path, file_size, mtime_ns, &error)?;
                    progress.failed = progress.failed.saturating_add(1);
                }
            }
        }
        if progress.discovered > 0 && progress.discovered % 32 == 0 {
            session.flush_batch()?;
        }
        publish(&progress);
    }

    session.finish()?;
    progress.complete = true;
    progress.current_path = None;
    progress.current_title = None;
    publish(&progress);
    Ok(progress)
}

fn read_track(
    path: &Path,
    library_id: Uuid,
    rel_path: String,
    file_size: i64,
    mtime_ns: i64,
    artwork_cache_dir: &Path,
) -> Result<IndexedTrack, String> {
    let tagged_file = lofty::read_from_path(path)
        .map_err(|error| format!("Could not parse metadata: {error}"))?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());
    let properties = tagged_file.properties();
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let fallback_artist = tag
        .and_then(|tag| tag.artist())
        .map(|value| value.into_owned());
    let mut artists = tag
        .map(|tag| {
            tag.get_strings(ItemKey::TrackArtists)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if artists.is_empty() {
        artists.extend(fallback_artist.iter().cloned());
    }
    let mut genres = tag
        .map(|tag| {
            tag.get_strings(ItemKey::Genre)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if genres.is_empty() {
        genres.extend(
            tag.and_then(|tag| tag.genre())
                .map(|value| value.into_owned()),
        );
    }
    let date_year = tag
        .and_then(|tag| tag.date())
        .map(|date| i64::from(date.year));
    let album_artist = tag
        .and_then(|tag| tag.get_string(ItemKey::AlbumArtist))
        .map(str::to_owned);
    let album = tag
        .and_then(|tag| tag.album())
        .map(|value| value.into_owned());
    let artist = artists.first().cloned().or(fallback_artist);
    let compilation = tag
        .and_then(|tag| tag.get_string(ItemKey::FlagCompilation))
        .is_some_and(is_true_tag_value);
    let album_key = album_key(
        library_id,
        &rel_path,
        album_artist.as_deref(),
        artist.as_deref(),
        album.as_deref(),
        date_year,
        compilation,
    );
    let artwork_key = cache_artwork(tag, &rel_path, file_size, mtime_ns, artwork_cache_dir);

    Ok(IndexedTrack {
        id: Uuid::new_v5(&library_id, rel_path.as_bytes()),
        album_key,
        rel_path,
        title: tag
            .and_then(|tag| tag.title())
            .map(|value| value.into_owned()),
        artist,
        artists,
        album_artist,
        album,
        year: date_year,
        track_no: tag.and_then(|tag| tag.track()).map(i64::from),
        disc_no: tag.and_then(|tag| tag.disk()).map(i64::from),
        genres,
        composer: tag
            .and_then(|tag| tag.get_string(ItemKey::Composer))
            .map(str::to_owned),
        duration_ms: i64::try_from(properties.duration().as_millis()).ok(),
        codec: if extension.is_empty() {
            None
        } else {
            Some(extension.clone())
        },
        container: if extension.is_empty() {
            None
        } else {
            Some(extension)
        },
        sample_rate: properties.sample_rate().map(i64::from),
        bit_depth: properties.bit_depth().map(i64::from),
        channels: properties.channels().map(i64::from),
        bitrate: properties.audio_bitrate().map(i64::from),
        file_size,
        mtime_ns,
        artwork_key,
        compilation,
    })
}

fn is_true_tag_value(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes"
    )
}

fn cache_artwork(
    tag: Option<&lofty::tag::Tag>,
    relative_path: &str,
    file_size: i64,
    mtime_ns: i64,
    cache_dir: &Path,
) -> Option<String> {
    let picture = tag.and_then(|tag| tag.pictures().first())?;
    let bytes = picture.data();
    if bytes.is_empty() || bytes.len() > MAX_EMBEDDED_ARTWORK_BYTES {
        return None;
    }
    super::artwork::cache_embedded_artwork(bytes, relative_path, file_size, mtime_ns, cache_dir)
        .ok()
}

pub(crate) fn is_supported_audio_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            AUDIO_EXTENSIONS
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        })
}

pub fn reindex_audio_path(
    root: &Path,
    library_id: Uuid,
    database: &IndexDatabase,
    artwork_cache_dir: &Path,
    path: &Path,
) -> Result<IncrementalIndexOutcome, String> {
    let rel_path = normalize_from_absolute(root, path)?;
    let session = database.scan_session(epoch_millis(SystemTime::now()))?;
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() && !metadata.file_type().is_symlink() => {
            metadata
        }
        Ok(_) | Err(_) => {
            session.remove_path(&rel_path)?;
            session.commit()?;
            return Ok(IncrementalIndexOutcome::Removed);
        }
    };
    let file_size = i64::try_from(metadata.len()).unwrap_or(i64::MAX);
    let mtime_ns = modified_ns(&metadata);
    if session.is_unchanged(&rel_path, file_size, mtime_ns)? {
        session.commit()?;
        return Ok(IncrementalIndexOutcome::Unchanged);
    }
    match read_track(
        path,
        library_id,
        rel_path.clone(),
        file_size,
        mtime_ns,
        artwork_cache_dir,
    ) {
        Ok(track) => {
            session.upsert_track(&track)?;
            session.commit()?;
            Ok(IncrementalIndexOutcome::Indexed)
        }
        Err(error) => {
            session.remove_path(&rel_path)?;
            session.record_failure(&rel_path, file_size, mtime_ns, &error)?;
            session.commit()?;
            Ok(IncrementalIndexOutcome::Failed)
        }
    }
}

pub fn remove_indexed_path_prefix(
    root: &Path,
    database: &IndexDatabase,
    path: &Path,
) -> Result<(), String> {
    let rel_path = normalize_from_absolute(root, path)?;
    let session = database.scan_session(epoch_millis(SystemTime::now()))?;
    session.remove_path_prefix(&rel_path)?;
    session.commit()
}

pub fn reindex_audio_tree(
    root: &Path,
    library_id: Uuid,
    database: &IndexDatabase,
    artwork_cache_dir: &Path,
    path: &Path,
) -> Result<(), String> {
    remove_indexed_path_prefix(root, database, path)?;
    let mut walker = WalkBuilder::new(path);
    walker
        .hidden(false)
        .follow_links(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .filter_entry(|entry| entry.file_name() != ".musiclib");
    for entry in walker.build() {
        let Ok(entry) = entry else {
            continue;
        };
        if entry.path_is_symlink()
            || !entry
                .file_type()
                .is_some_and(|file_type| file_type.is_file())
            || !is_supported_audio_path(entry.path())
        {
            continue;
        }
        reindex_audio_path(root, library_id, database, artwork_cache_dir, entry.path())?;
    }
    Ok(())
}

fn modified_ns(metadata: &fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .map(epoch_nanos)
        .unwrap_or_default()
}

fn epoch_nanos(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_nanos()).ok())
        .unwrap_or(i64::MAX)
}

fn epoch_millis(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use lofty::{
        config::WriteOptions,
        tag::{ItemKey, Tag, TagExt, TagType},
    };
    use uuid::Uuid;

    use crate::{index::db::IndexDatabase, portable::manifest::ensure_layout};

    use super::{reindex_audio_path, reindex_audio_tree, scan_library, IncrementalIndexOutcome};

    #[test]
    fn scanner_isolates_invalid_files_and_skips_musiclib_and_symlinks() {
        let root = temporary_root("scanner");
        ensure_layout(&root).unwrap();
        fs::write(root.join("broken.mp3"), b"not an mp3").unwrap();
        fs::write(root.join(".musiclib/ignored.flac"), b"not audio").unwrap();
        fs::write(root.join("ignored.txt"), b"not audio").unwrap();
        let target = root.join("linked.mp3");
        create_file_symlink(&root.join("broken.mp3"), &target);

        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();
        let progress = scan_library(
            &root,
            Uuid::new_v4(),
            &database,
            &root.join("artwork-cache"),
            |_| {},
        )
        .unwrap();

        assert_eq!(progress.discovered, 1);
        assert_eq!(progress.failed, 1);
        assert_eq!(database.track_count().unwrap(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unchanged_files_are_not_reparsed_on_the_next_scan() {
        let root = temporary_root("incremental");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("broken.mp3"), b"not an mp3").unwrap();
        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();
        let library_id = Uuid::new_v4();

        let cache = root.join("artwork-cache");
        let first = scan_library(&root, library_id, &database, &cache, |_| {}).unwrap();
        let second = scan_library(&root, library_id, &database, &cache, |_| {}).unwrap();

        assert_eq!(first.failed, 1);
        assert_eq!(second.failed, 0);
        assert_eq!(second.skipped_unchanged, 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn metadata_indexing_is_deterministic_without_a_network_provider() {
        let root = temporary_root("offline-metadata");
        let path = root.join("Caf\u{e9}.wav");
        write_tagged_wav(&path);
        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();

        let progress = scan_library(
            &root,
            Uuid::new_v4(),
            &database,
            &root.join("artwork-cache"),
            |_| {},
        )
        .unwrap();

        assert_eq!(
            progress.indexed,
            1,
            "{progress:?}; {:?}",
            database.scan_failure_message("Caf\u{e9}.wav").unwrap()
        );
        assert_eq!(database.track_count().unwrap(), 1);
        assert_eq!(
            database.track_title("Caf\u{e9}.wav").unwrap(),
            Some("Offline Title".to_owned())
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn generated_target_codec_fixtures_index_without_network() {
        let root = temporary_root("fixture-library");
        copy_directory(
            &Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("fixtures/library-a"),
            &root,
        );
        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();
        let progress = scan_library(
            &root,
            Uuid::new_v4(),
            &database,
            &root.join("artwork-cache"),
            |_| {},
        )
        .unwrap();

        assert_eq!(progress.discovered, 8);
        assert_eq!(progress.indexed, 7, "{progress:?}");
        assert_eq!(progress.failed, 1, "{progress:?}");
        assert_eq!(
            database.track_title("Loose/one.mp3").unwrap(),
            Some("One".to_owned())
        );
        assert_eq!(
            database.track_title("Compilation/three.m4a").unwrap(),
            Some("Three".to_owned())
        );
        assert_eq!(
            database.track_title("Codecs/five-alac.m4a").unwrap(),
            Some("Synthetic ALAC".to_owned())
        );
        assert_eq!(
            database.track_title("Codecs/six-vorbis.ogg").unwrap(),
            Some("Synthetic Vorbis".to_owned())
        );
        assert_eq!(
            database.track_title("Codecs/seven-opus.opus").unwrap(),
            Some("Synthetic Opus".to_owned())
        );
        let rescan = scan_library(
            &root,
            Uuid::new_v4(),
            &database,
            &root.join("artwork-cache"),
            |_| {},
        )
        .unwrap();
        assert_eq!(rescan.skipped_unchanged, 8, "{rescan:?}");
        assert_eq!(rescan.indexed, 0, "{rescan:?}");
        assert_eq!(rescan.failed, 0, "{rescan:?}");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn incremental_index_adds_changes_and_removes_one_audio_path() {
        let root = temporary_root("watch-incremental");
        let path = root.join("live.wav");
        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();
        let library_id = Uuid::new_v4();
        let cache = root.join("artwork-cache");

        write_tagged_wav(&path);
        assert_eq!(
            reindex_audio_path(&root, library_id, &database, &cache, &path).unwrap(),
            IncrementalIndexOutcome::Indexed
        );
        assert_eq!(database.track_count().unwrap(), 1);
        assert_eq!(
            reindex_audio_path(&root, library_id, &database, &cache, &path).unwrap(),
            IncrementalIndexOutcome::Unchanged
        );

        let mut tag = Tag::new(TagType::RiffInfo);
        assert!(tag.insert_text(ItemKey::TrackTitle, "Changed Live Title".to_owned()));
        assert!(tag.insert_text(ItemKey::TrackArtist, "Offline Artist".to_owned()));
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        assert_eq!(
            reindex_audio_path(&root, library_id, &database, &cache, &path).unwrap(),
            IncrementalIndexOutcome::Indexed
        );
        assert_eq!(
            database.track_title("live.wav").unwrap(),
            Some("Changed Live Title".to_owned())
        );

        fs::remove_file(&path).unwrap();
        assert_eq!(
            reindex_audio_path(&root, library_id, &database, &cache, &path).unwrap(),
            IncrementalIndexOutcome::Removed
        );
        assert_eq!(database.track_count().unwrap(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn incremental_directory_replacement_rebuilds_only_that_subtree() {
        let root = temporary_root("watch-directory");
        let album = root.join("Incoming Album");
        fs::create_dir_all(&album).unwrap();
        write_tagged_wav(&album.join("track.wav"));
        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();

        reindex_audio_tree(
            &root,
            Uuid::new_v4(),
            &database,
            &root.join("artwork-cache"),
            &album,
        )
        .unwrap();

        assert_eq!(database.track_count().unwrap(), 1);
        assert_eq!(
            database.track_title("Incoming Album/track.wav").unwrap(),
            Some("Offline Title".to_owned())
        );
        fs::remove_dir_all(root).unwrap();
    }

    fn temporary_root(label: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("basis-{label}-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn write_tagged_wav(path: &Path) {
        let wav = [
            b'R', b'I', b'F', b'F', 38, 0, 0, 0, b'W', b'A', b'V', b'E', b'f', b'm', b't', b' ',
            16, 0, 0, 0, 1, 0, 1, 0, 68, 172, 0, 0, 136, 88, 1, 0, 2, 0, 16, 0, b'd', b'a', b't',
            b'a', 2, 0, 0, 0, 0, 0,
        ];
        fs::write(path, wav).unwrap();
        let mut tag = Tag::new(TagType::RiffInfo);
        assert!(tag.insert_text(ItemKey::TrackTitle, "Offline Title".to_owned()));
        assert!(tag.insert_text(ItemKey::TrackArtist, "Offline Artist".to_owned()));
        tag.save_to_path(path, WriteOptions::default()).unwrap();
    }

    fn copy_directory(source: &Path, destination: &Path) {
        fs::create_dir_all(destination).unwrap();
        for entry in fs::read_dir(source).unwrap() {
            let entry = entry.unwrap();
            let target = destination.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() {
                copy_directory(&entry.path(), &target);
            } else {
                fs::copy(entry.path(), target).unwrap();
            }
        }
    }

    #[cfg(windows)]
    fn create_file_symlink(source: &Path, target: &Path) {
        let _ = std::os::windows::fs::symlink_file(source, target);
    }

    #[cfg(unix)]
    fn create_file_symlink(source: &Path, target: &Path) {
        std::os::unix::fs::symlink(source, target).unwrap();
    }
}

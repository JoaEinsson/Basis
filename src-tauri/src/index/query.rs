use std::collections::BTreeMap;

use rusqlite::{params_from_iter, types::Value, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::domain::{
    metadata::{artist_key, comparison_key},
    query::{
        built_in_views, parse_query, validate_expr, AlbumDetailDto, AlbumDto, ArtistDetailDto,
        ArtistDto, EntityKind, Expr, FolderDto, GenreDto, GlobalSearchResults, NamedSearchResult,
        QueryField, QueryItems, QueryOperator, QueryPage, QueryRequest, QuerySort, QueryValue,
        SearchRequest, SortDirection, TrackDto,
    },
};

use super::db::IndexDatabase;

const DEFAULT_PAGE_SIZE: u32 = 100;
const MAX_PAGE_SIZE: u32 = 500;
const MAX_SEARCH_SECTION_SIZE: u32 = 50;

impl IndexDatabase {
    pub fn tracks_by_ids(&self, ids: &[Uuid]) -> Result<Vec<TrackDto>, String> {
        let connection = self.connect()?;
        let mut statement = connection
            .prepare(&format!("{} WHERE t.id = ?1", track_select()))
            .map_err(sql_error)?;
        let mut tracks = Vec::with_capacity(ids.len());
        for id in ids {
            let track = statement
                .query_row([id.to_string()], map_track)
                .optional()
                .map_err(sql_error)?
                .ok_or_else(|| format!("Track {id} is no longer in the local index"))?;
            tracks.push(track);
        }
        Ok(tracks)
    }

    pub fn execute_query(
        &self,
        library_id: Uuid,
        request: QueryRequest,
    ) -> Result<QueryPage, String> {
        validate_expr(&request.query)?;
        let page_size = normalized_page_size(request.page_size);
        match request.entity {
            EntityKind::Track => self.query_tracks(request, page_size),
            EntityKind::Album => self.query_albums(request, page_size),
            EntityKind::Artist => self.query_artists(library_id, request, page_size),
            EntityKind::Folder => self.query_folders(request, page_size),
            EntityKind::Genre => self.query_genres(request, page_size),
        }
    }

    pub fn album_detail(&self, album_key: Uuid) -> Result<Option<AlbumDetailDto>, String> {
        let connection = self.connect()?;
        let album = query_album_by_key(&connection, album_key)?;
        let Some(album) = album else {
            return Ok(None);
        };
        let mut statement = connection
            .prepare(&format!(
                "{} WHERE t.album_key = ?1 ORDER BY COALESCE(t.disc_no, 0), COALESCE(t.track_no, 0), t.rel_path",
                track_select()
            ))
            .map_err(sql_error)?;
        let tracks = statement
            .query_map([album_key.to_string()], map_track)
            .map_err(sql_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_error)?;
        Ok(Some(AlbumDetailDto { album, tracks }))
    }

    pub fn artist_detail(
        &self,
        library_id: Uuid,
        requested_key: Uuid,
    ) -> Result<Option<ArtistDetailDto>, String> {
        let connection = self.connect()?;
        let Some((normalized_artist, display_name)) =
            find_artist_identity(&connection, library_id, requested_key)?
        else {
            return Ok(None);
        };
        let expression = Expr::Predicate {
            field: QueryField::Artist,
            op: QueryOperator::Eq,
            value: QueryValue::Text(display_name.clone()),
        };
        let artist =
            query_artist_summary(&connection, library_id, &normalized_artist, &display_name)?;
        let albums_page = self.execute_query(
            library_id,
            QueryRequest {
                entity: EntityKind::Album,
                query: expression.clone(),
                sort: vec![QuerySort {
                    field: QueryField::Year,
                    direction: SortDirection::Asc,
                }],
                page: 0,
                page_size: MAX_PAGE_SIZE,
            },
        )?;
        let tracks_page = self.execute_query(
            library_id,
            QueryRequest {
                entity: EntityKind::Track,
                query: expression,
                sort: vec![
                    QuerySort {
                        field: QueryField::Album,
                        direction: SortDirection::Asc,
                    },
                    QuerySort {
                        field: QueryField::Disc,
                        direction: SortDirection::Asc,
                    },
                    QuerySort {
                        field: QueryField::Track,
                        direction: SortDirection::Asc,
                    },
                ],
                page: 0,
                page_size: MAX_PAGE_SIZE,
            },
        )?;
        let QueryItems::Albums(albums) = albums_page.items else {
            return Err("Album query returned an unexpected entity kind".to_owned());
        };
        let QueryItems::Tracks(tracks) = tracks_page.items else {
            return Err("Track query returned an unexpected entity kind".to_owned());
        };
        Ok(Some(ArtistDetailDto {
            artist,
            albums,
            tracks,
        }))
    }

    pub fn global_search(
        &self,
        library_id: Uuid,
        request: SearchRequest,
    ) -> Result<GlobalSearchResults, String> {
        let query = parse_query(&request.input)?;
        let limit = request.limit_per_section.clamp(1, MAX_SEARCH_SECTION_SIZE);
        let candidate_limit = limit.saturating_mul(4).min(MAX_PAGE_SIZE);

        let mut tracks = take_tracks(self.execute_query(
            library_id,
            search_query_request(EntityKind::Track, &query, candidate_limit),
        )?)?;
        let mut albums = take_albums(self.execute_query(
            library_id,
            search_query_request(EntityKind::Album, &query, candidate_limit),
        )?)?;
        let mut artists = take_artists(self.execute_query(
            library_id,
            search_query_request(EntityKind::Artist, &query, candidate_limit),
        )?)?;
        let mut folders = take_folders(self.execute_query(
            library_id,
            search_query_request(EntityKind::Folder, &query, candidate_limit),
        )?)?;
        let mut genres = take_genres(self.execute_query(
            library_id,
            search_query_request(EntityKind::Genre, &query, candidate_limit),
        )?)?;

        rank_tracks(&request.input, &mut tracks);
        rank_albums(&request.input, &mut albums);
        rank_artists(&request.input, &mut artists);
        rank_folders(&request.input, &mut folders);
        rank_genres(&request.input, &mut genres);
        truncate_to(&mut tracks, limit);
        truncate_to(&mut albums, limit);
        truncate_to(&mut artists, limit);
        truncate_to(&mut folders, limit);
        truncate_to(&mut genres, limit);

        let input_key = comparison_key(&request.input);
        let views = if is_simple_text_query(&query) {
            built_in_views()
                .into_iter()
                .filter(|view| comparison_key(&view.name).contains(&input_key))
                .take(usize::try_from(limit).unwrap_or(usize::MAX))
                .map(|view| NamedSearchResult {
                    id: view.id,
                    name: view.name,
                    kind: "view".to_owned(),
                })
                .collect()
        } else {
            Vec::new()
        };

        Ok(GlobalSearchResults {
            query,
            artists,
            albums,
            tracks,
            folders,
            genres,
            playlists: Vec::new(),
            views,
        })
    }

    fn query_tracks(&self, request: QueryRequest, page_size: u32) -> Result<QueryPage, String> {
        validate_sort(EntityKind::Track, &request.sort)?;
        let connection = self.connect()?;
        let compiled = compile_expression(&request.query)?;
        let mut parameters = compiled.parameters;
        let rank_query = if request.sort.is_empty() {
            fts_rank_query(&request.query)
        } else {
            None
        };
        let order = track_order(&request.sort, rank_query.is_some());
        if let Some(rank_query) = rank_query {
            parameters.push(Value::Text(rank_query));
        }
        let (limit, offset) = page_window(request.page, page_size);
        parameters.push(Value::Integer(limit));
        parameters.push(Value::Integer(offset));
        let sql = format!(
            "{} WHERE {} ORDER BY {} LIMIT ? OFFSET ?",
            track_select(),
            compiled.sql,
            order
        );
        let mut statement = connection.prepare(&sql).map_err(sql_error)?;
        let mut tracks = statement
            .query_map(params_from_iter(parameters), map_track)
            .map_err(sql_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_error)?;
        let has_more = tracks.len() > usize::try_from(page_size).unwrap_or(usize::MAX);
        if has_more {
            tracks.pop();
        }
        Ok(QueryPage {
            entity: EntityKind::Track,
            page: request.page,
            page_size,
            has_more,
            items: QueryItems::Tracks(tracks),
        })
    }

    fn query_albums(&self, request: QueryRequest, page_size: u32) -> Result<QueryPage, String> {
        validate_sort(EntityKind::Album, &request.sort)?;
        let connection = self.connect()?;
        let compiled = compile_expression(&request.query)?;
        let mut parameters = compiled.parameters;
        let order = album_order(&request.sort);
        let (limit, offset) = page_window(request.page, page_size);
        parameters.push(Value::Integer(limit));
        parameters.push(Value::Integer(offset));
        let sql = format!(
            r#"
            SELECT
                t.album_key,
                COALESCE(MIN(t.album), 'Unknown Album') AS title,
                CASE
                    WHEN MAX(t.compilation) = 1 THEN 'Various Artists'
                    ELSE COALESCE(MIN(t.album_artist), MIN(t.artist), 'Unknown Artist')
                END AS album_artist,
                MIN(t.year) AS year,
                COUNT(*) AS track_count,
                COALESCE(SUM(t.duration_ms), 0) AS duration_ms,
                MIN(t.artwork_key) AS artwork_key,
                MAX(CASE WHEN t.album IS NULL THEN 1 ELSE 0 END) AS unknown,
                MIN(t.rel_path) AS stable_path
            FROM tracks t
            WHERE {}
            GROUP BY t.album_key
            ORDER BY {}
            LIMIT ? OFFSET ?
            "#,
            compiled.sql, order
        );
        let mut statement = connection.prepare(&sql).map_err(sql_error)?;
        let mut albums = statement
            .query_map(params_from_iter(parameters), map_album)
            .map_err(sql_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_error)?;
        let has_more = albums.len() > usize::try_from(page_size).unwrap_or(usize::MAX);
        if has_more {
            albums.pop();
        }
        Ok(QueryPage {
            entity: EntityKind::Album,
            page: request.page,
            page_size,
            has_more,
            items: QueryItems::Albums(albums),
        })
    }

    fn query_artists(
        &self,
        library_id: Uuid,
        request: QueryRequest,
        page_size: u32,
    ) -> Result<QueryPage, String> {
        validate_sort(EntityKind::Artist, &request.sort)?;
        let connection = self.connect()?;
        let compiled = compile_expression(&request.query)?;
        let mut parameters = compiled.parameters;
        let order = artist_order(&request.sort);
        let (limit, offset) = page_window(request.page, page_size);
        parameters.push(Value::Integer(limit));
        parameters.push(Value::Integer(offset));
        let sql = format!(
            r#"
            WITH matching AS (
                SELECT t.id, t.album_key
                FROM tracks t
                WHERE {}
            )
            SELECT
                ta.normalized_artist,
                MIN(ta.artist) AS name,
                COUNT(DISTINCT ta.track_id) AS track_count,
                COUNT(DISTINCT matching.album_key) AS album_count
            FROM track_artists ta
            JOIN matching ON matching.id = ta.track_id
            GROUP BY ta.normalized_artist
            ORDER BY {}
            LIMIT ? OFFSET ?
            "#,
            compiled.sql, order
        );
        let mut statement = connection.prepare(&sql).map_err(sql_error)?;
        let mut artists = statement
            .query_map(params_from_iter(parameters), |row| {
                let name = row.get::<_, String>(1)?;
                Ok(ArtistDto {
                    artist_key: artist_key(library_id, &name),
                    name,
                    track_count: ui_count(row.get::<_, i64>(2)?),
                    album_count: ui_count(row.get::<_, i64>(3)?),
                })
            })
            .map_err(sql_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_error)?;
        let has_more = artists.len() > usize::try_from(page_size).unwrap_or(usize::MAX);
        if has_more {
            artists.pop();
        }
        Ok(QueryPage {
            entity: EntityKind::Artist,
            page: request.page,
            page_size,
            has_more,
            items: QueryItems::Artists(artists),
        })
    }

    fn query_folders(&self, request: QueryRequest, page_size: u32) -> Result<QueryPage, String> {
        validate_sort(EntityKind::Folder, &request.sort)?;
        let connection = self.connect()?;
        let compiled = compile_expression(&request.query)?;
        let sql = format!("SELECT t.rel_path FROM tracks t WHERE {}", compiled.sql);
        let mut statement = connection.prepare(&sql).map_err(sql_error)?;
        let paths = statement
            .query_map(params_from_iter(compiled.parameters), |row| {
                row.get::<_, String>(0)
            })
            .map_err(sql_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_error)?;
        let mut counts = BTreeMap::<String, u32>::new();
        for path in paths {
            let folder = path.rsplit_once('/').map_or("", |(folder, _)| folder);
            *counts.entry(folder.to_owned()).or_default() = counts
                .get(folder)
                .copied()
                .unwrap_or_default()
                .saturating_add(1);
        }
        let mut folders = counts
            .into_iter()
            .map(|(path, track_count)| FolderDto {
                name: path
                    .rsplit_once('/')
                    .map_or_else(|| path.clone(), |(_, name)| name.to_owned()),
                path,
                track_count,
            })
            .collect::<Vec<_>>();
        sort_folders(&mut folders, &request.sort);
        let (folders, has_more) = paginate_vec(folders, request.page, page_size);
        Ok(QueryPage {
            entity: EntityKind::Folder,
            page: request.page,
            page_size,
            has_more,
            items: QueryItems::Folders(folders),
        })
    }

    fn query_genres(&self, request: QueryRequest, page_size: u32) -> Result<QueryPage, String> {
        validate_sort(EntityKind::Genre, &request.sort)?;
        let connection = self.connect()?;
        let compiled = compile_expression(&request.query)?;
        let mut parameters = compiled.parameters;
        let (limit, offset) = page_window(request.page, page_size);
        parameters.push(Value::Integer(limit));
        parameters.push(Value::Integer(offset));
        let direction = request
            .sort
            .first()
            .map(|sort| sql_direction(sort.direction))
            .unwrap_or("ASC");
        let sql = format!(
            r#"
            WITH matching AS (
                SELECT t.id FROM tracks t WHERE {}
            )
            SELECT MIN(tg.genre), COUNT(DISTINCT tg.track_id), tg.normalized_genre
            FROM track_genres tg
            JOIN matching ON matching.id = tg.track_id
            GROUP BY tg.normalized_genre
            ORDER BY tg.normalized_genre {}, MIN(tg.genre) ASC
            LIMIT ? OFFSET ?
            "#,
            compiled.sql, direction
        );
        let mut statement = connection.prepare(&sql).map_err(sql_error)?;
        let mut genres = statement
            .query_map(params_from_iter(parameters), |row| {
                Ok(GenreDto {
                    name: row.get(0)?,
                    track_count: ui_count(row.get::<_, i64>(1)?),
                })
            })
            .map_err(sql_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sql_error)?;
        let has_more = genres.len() > usize::try_from(page_size).unwrap_or(usize::MAX);
        if has_more {
            genres.pop();
        }
        Ok(QueryPage {
            entity: EntityKind::Genre,
            page: request.page,
            page_size,
            has_more,
            items: QueryItems::Genres(genres),
        })
    }
}

struct CompiledExpression {
    sql: String,
    parameters: Vec<Value>,
}

fn compile_expression(expression: &Expr) -> Result<CompiledExpression, String> {
    validate_expr(expression)?;
    let mut parameters = Vec::new();
    let sql = compile_node(expression, &mut parameters)?;
    Ok(CompiledExpression { sql, parameters })
}

fn compile_node(expression: &Expr, parameters: &mut Vec<Value>) -> Result<String, String> {
    match expression {
        Expr::And { items } => compile_group(items, "AND", "1 = 1", parameters),
        Expr::Or { items } => compile_group(items, "OR", "0 = 1", parameters),
        Expr::Not { item } => Ok(format!("NOT ({})", compile_node(item, parameters)?)),
        Expr::Text { value } => {
            parameters.push(Value::Text(fts_prefix_query(value)));
            Ok("t.rowid IN (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?)".to_owned())
        }
        Expr::Predicate { field, op, value } => compile_predicate(*field, *op, value, parameters),
    }
}

fn compile_group(
    items: &[Expr],
    operator: &str,
    empty: &str,
    parameters: &mut Vec<Value>,
) -> Result<String, String> {
    if items.is_empty() {
        return Ok(empty.to_owned());
    }
    let clauses = items
        .iter()
        .map(|item| compile_node(item, parameters))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(format!("({})", clauses.join(&format!(" {operator} "))))
}

fn compile_predicate(
    field: QueryField,
    operator: QueryOperator,
    value: &QueryValue,
    parameters: &mut Vec<Value>,
) -> Result<String, String> {
    match field {
        QueryField::Artist => compile_relation_predicate(
            "track_artists",
            "normalized_artist",
            operator,
            value,
            parameters,
        ),
        QueryField::Genre => compile_relation_predicate(
            "track_genres",
            "normalized_genre",
            operator,
            value,
            parameters,
        ),
        QueryField::Title
        | QueryField::AlbumArtist
        | QueryField::Album
        | QueryField::Composer
        | QueryField::Codec
        | QueryField::Path => compile_scalar_predicate(
            text_column(field),
            operator,
            normalize_text_value(value)?,
            parameters,
        ),
        QueryField::Favorite => {
            compile_scalar_predicate("t.favorite", operator, boolean_value(value)?, parameters)
        }
        QueryField::Year
        | QueryField::Track
        | QueryField::Disc
        | QueryField::Duration
        | QueryField::SampleRate
        | QueryField::BitDepth
        | QueryField::Channels
        | QueryField::Bitrate
        | QueryField::AddedAt
        | QueryField::LastPlayed
        | QueryField::PlayCount => compile_scalar_predicate(
            number_column(field),
            operator,
            number_value(value)?,
            parameters,
        ),
    }
}

fn compile_relation_predicate(
    table: &str,
    column: &str,
    operator: QueryOperator,
    value: &QueryValue,
    parameters: &mut Vec<Value>,
) -> Result<String, String> {
    let normalized = normalize_text_value(value)?;
    let predicate = compile_scalar_predicate(
        &format!("relation.{column}"),
        if operator == QueryOperator::Neq {
            QueryOperator::Eq
        } else {
            operator
        },
        normalized,
        parameters,
    )?;
    let exists = format!(
        "EXISTS (SELECT 1 FROM {table} relation WHERE relation.track_id = t.id AND {predicate})"
    );
    Ok(if operator == QueryOperator::Neq {
        format!("NOT ({exists})")
    } else {
        exists
    })
}

fn compile_scalar_predicate(
    column: &str,
    operator: QueryOperator,
    value: QueryValue,
    parameters: &mut Vec<Value>,
) -> Result<String, String> {
    match (operator, value) {
        (QueryOperator::Eq, value) => {
            parameters.push(single_sql_value(value)?);
            Ok(format!("{column} = ?"))
        }
        (QueryOperator::Neq, value) => {
            parameters.push(single_sql_value(value)?);
            Ok(format!("({column} IS NULL OR {column} != ?)"))
        }
        (QueryOperator::Contains, QueryValue::Text(value)) => {
            parameters.push(Value::Text(value));
            Ok(format!("INSTR(COALESCE({column}, ''), ?) > 0"))
        }
        (QueryOperator::Gt, value)
        | (QueryOperator::Gte, value)
        | (QueryOperator::Lt, value)
        | (QueryOperator::Lte, value) => {
            let symbol = match operator {
                QueryOperator::Gt => ">",
                QueryOperator::Gte => ">=",
                QueryOperator::Lt => "<",
                QueryOperator::Lte => "<=",
                _ => unreachable!(),
            };
            parameters.push(single_sql_value(value)?);
            Ok(format!("{column} {symbol} ?"))
        }
        (QueryOperator::In, value) => {
            let values = list_sql_values(value)?;
            let placeholders = vec!["?"; values.len()].join(", ");
            parameters.extend(values);
            Ok(format!("{column} IN ({placeholders})"))
        }
        _ => Err("Query operator and value are incompatible".to_owned()),
    }
}

fn normalize_text_value(value: &QueryValue) -> Result<QueryValue, String> {
    match value {
        QueryValue::Text(value) => Ok(QueryValue::Text(comparison_key(value))),
        QueryValue::TextList(values) => Ok(QueryValue::TextList(
            values.iter().map(|value| comparison_key(value)).collect(),
        )),
        _ => Err("Text field requires text values".to_owned()),
    }
}

fn number_value(value: &QueryValue) -> Result<QueryValue, String> {
    match value {
        QueryValue::Number(value) => Ok(QueryValue::Number(*value)),
        QueryValue::NumberList(values) => Ok(QueryValue::NumberList(values.clone())),
        _ => Err("Numeric field requires numeric values".to_owned()),
    }
}

fn boolean_value(value: &QueryValue) -> Result<QueryValue, String> {
    match value {
        QueryValue::Boolean(value) => Ok(QueryValue::Boolean(*value)),
        _ => Err("Boolean field requires boolean values".to_owned()),
    }
}

fn single_sql_value(value: QueryValue) -> Result<Value, String> {
    match value {
        QueryValue::Text(value) => Ok(Value::Text(value)),
        QueryValue::Number(value) => Ok(Value::Real(value)),
        QueryValue::Boolean(value) => Ok(Value::Integer(i64::from(value))),
        QueryValue::TextList(_) | QueryValue::NumberList(_) => {
            Err("A scalar operator cannot receive a list".to_owned())
        }
    }
}

fn list_sql_values(value: QueryValue) -> Result<Vec<Value>, String> {
    match value {
        QueryValue::TextList(values) => Ok(values.into_iter().map(Value::Text).collect()),
        QueryValue::NumberList(values) => Ok(values.into_iter().map(Value::Real).collect()),
        _ => Err("IN requires a list value".to_owned()),
    }
}

fn text_column(field: QueryField) -> &'static str {
    match field {
        QueryField::Title => "t.title_search",
        QueryField::AlbumArtist => "t.album_artist_search",
        QueryField::Album => "t.album_search",
        QueryField::Composer => "t.composer_search",
        QueryField::Codec => "t.codec_search",
        QueryField::Path => "t.path_search",
        _ => unreachable!("text_column requires a scalar text field"),
    }
}

fn number_column(field: QueryField) -> &'static str {
    match field {
        QueryField::Year => "t.year",
        QueryField::Track => "t.track_no",
        QueryField::Disc => "t.disc_no",
        QueryField::Duration => "t.duration_ms",
        QueryField::SampleRate => "t.sample_rate",
        QueryField::BitDepth => "t.bit_depth",
        QueryField::Channels => "t.channels",
        QueryField::Bitrate => "t.bitrate",
        QueryField::AddedAt => "t.added_at",
        QueryField::LastPlayed => "t.last_played",
        QueryField::PlayCount => "t.play_count",
        _ => unreachable!("number_column requires a numeric field"),
    }
}

fn fts_prefix_query(value: &str) -> String {
    let escaped = value.trim().replace('"', "\"\"");
    format!("\"{escaped}\"*")
}

fn fts_rank_query(expression: &Expr) -> Option<String> {
    match expression {
        Expr::Text { value } => Some(fts_prefix_query(value)),
        Expr::And { items } if !items.is_empty() => items
            .iter()
            .map(fts_rank_query)
            .collect::<Option<Vec<_>>>()
            .map(|items| items.join(" AND ")),
        Expr::Or { items } if !items.is_empty() => items
            .iter()
            .map(fts_rank_query)
            .collect::<Option<Vec<_>>>()
            .map(|items| format!("({})", items.join(" OR "))),
        Expr::And { .. } | Expr::Or { .. } | Expr::Not { .. } | Expr::Predicate { .. } => None,
    }
}

fn validate_sort(entity: EntityKind, sorts: &[QuerySort]) -> Result<(), String> {
    if sorts.len() > 8 {
        return Err("A query may contain at most eight sort fields".to_owned());
    }
    for sort in sorts {
        let valid = match entity {
            EntityKind::Track => true,
            EntityKind::Album => matches!(
                sort.field,
                QueryField::Album
                    | QueryField::AlbumArtist
                    | QueryField::Artist
                    | QueryField::Year
                    | QueryField::Duration
            ),
            EntityKind::Artist => matches!(sort.field, QueryField::Artist),
            EntityKind::Folder => matches!(sort.field, QueryField::Path),
            EntityKind::Genre => matches!(sort.field, QueryField::Genre),
        };
        if !valid {
            return Err(format!(
                "Sort field {:?} is not valid for entity {:?}",
                sort.field, entity
            ));
        }
    }
    Ok(())
}

fn track_order(sorts: &[QuerySort], use_fts_rank: bool) -> String {
    let mut clauses = sorts
        .iter()
        .map(|sort| {
            let column = match sort.field {
                QueryField::Title => "t.title_search",
                QueryField::Artist => "t.artist",
                QueryField::AlbumArtist => "t.album_artist_search",
                QueryField::Album => "t.album_search",
                QueryField::Genre => "t.genres_text",
                QueryField::Composer => "t.composer_search",
                QueryField::Year => "t.year",
                QueryField::Track => "t.track_no",
                QueryField::Disc => "t.disc_no",
                QueryField::Duration => "t.duration_ms",
                QueryField::Codec => "t.codec_search",
                QueryField::SampleRate => "t.sample_rate",
                QueryField::BitDepth => "t.bit_depth",
                QueryField::Channels => "t.channels",
                QueryField::Bitrate => "t.bitrate",
                QueryField::Path => "t.path_search",
                QueryField::AddedAt => "t.added_at",
                QueryField::LastPlayed => "t.last_played",
                QueryField::PlayCount => "t.play_count",
                QueryField::Favorite => "t.favorite",
            };
            format!("{column} {}", sql_direction(sort.direction))
        })
        .collect::<Vec<_>>();
    if use_fts_rank {
        clauses.push(
            "COALESCE((SELECT bm25(tracks_fts) FROM tracks_fts WHERE tracks_fts.rowid = t.rowid AND tracks_fts MATCH ?), 1000000000) ASC"
                .to_owned(),
        );
    } else if clauses.is_empty() {
        clauses.push("t.title_search ASC".to_owned());
    }
    clauses.push("t.rel_path ASC".to_owned());
    clauses.join(", ")
}

fn album_order(sorts: &[QuerySort]) -> String {
    let mut clauses = sorts
        .iter()
        .map(|sort| {
            let column = match sort.field {
                QueryField::Album => "title",
                QueryField::AlbumArtist | QueryField::Artist => "album_artist",
                QueryField::Year => "year",
                QueryField::Duration => "duration_ms",
                _ => unreachable!(),
            };
            format!("{column} {}", sql_direction(sort.direction))
        })
        .collect::<Vec<_>>();
    if clauses.is_empty() {
        clauses.push("title COLLATE NOCASE ASC".to_owned());
    }
    clauses.push("stable_path ASC".to_owned());
    clauses.join(", ")
}

fn artist_order(sorts: &[QuerySort]) -> String {
    let direction = sorts
        .first()
        .map(|sort| sql_direction(sort.direction))
        .unwrap_or("ASC");
    format!("ta.normalized_artist {direction}, name ASC")
}

fn sql_direction(direction: SortDirection) -> &'static str {
    match direction {
        SortDirection::Asc => "ASC",
        SortDirection::Desc => "DESC",
    }
}

fn track_select() -> &'static str {
    r#"
    SELECT
        t.id, t.rel_path, t.title, t.artist, t.artists_text, t.album_artist, t.album,
        t.year, t.track_no, t.disc_no, t.genres_json, t.composer, t.duration_ms,
        t.codec, t.container, t.sample_rate, t.bit_depth, t.channels, t.bitrate,
        t.artwork_key, t.added_at, t.last_played, t.play_count, t.favorite
    FROM tracks t
    "#
}

fn map_track(row: &Row<'_>) -> rusqlite::Result<TrackDto> {
    let id = row.get::<_, String>(0)?;
    let artist = row.get::<_, Option<String>>(3)?;
    let artists_text = row.get::<_, String>(4)?;
    let artists = if artists_text.is_empty() {
        artist.iter().cloned().collect()
    } else {
        artists_text.lines().map(str::to_owned).collect()
    };
    let genres_json = row.get::<_, String>(10)?;
    let genres = serde_json::from_str(&genres_json).unwrap_or_default();
    Ok(TrackDto {
        id: Uuid::parse_str(&id).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        rel_path: row.get(1)?,
        title: row.get(2)?,
        artist,
        artists,
        album_artist: row.get(5)?,
        album: row.get(6)?,
        year: optional_i32(row.get(7)?),
        track_no: optional_u32(row.get(8)?),
        disc_no: optional_u32(row.get(9)?),
        genres,
        composer: row.get(11)?,
        duration_ms: optional_f64(row.get(12)?),
        codec: row.get(13)?,
        container: row.get(14)?,
        sample_rate: optional_u32(row.get(15)?),
        bit_depth: optional_u32(row.get(16)?),
        channels: optional_u32(row.get(17)?),
        bitrate: optional_u32(row.get(18)?),
        artwork_key: row.get(19)?,
        added_at: row.get::<_, i64>(20)? as f64,
        last_played: optional_f64(row.get(21)?),
        play_count: ui_count(row.get(22)?),
        favorite: row.get::<_, i64>(23)? != 0,
    })
}

fn map_album(row: &Row<'_>) -> rusqlite::Result<AlbumDto> {
    let key = row.get::<_, String>(0)?;
    Ok(AlbumDto {
        album_key: Uuid::parse_str(&key).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        title: row.get(1)?,
        album_artist: row.get(2)?,
        year: optional_i32(row.get(3)?),
        track_count: ui_count(row.get(4)?),
        duration_ms: row.get::<_, i64>(5)? as f64,
        artwork_key: row.get(6)?,
        unknown: row.get::<_, i64>(7)? != 0,
    })
}

fn query_album_by_key(
    connection: &Connection,
    album_key: Uuid,
) -> Result<Option<AlbumDto>, String> {
    connection
        .query_row(
            r#"
            SELECT
                t.album_key,
                COALESCE(MIN(t.album), 'Unknown Album'),
                CASE
                    WHEN MAX(t.compilation) = 1 THEN 'Various Artists'
                    ELSE COALESCE(MIN(t.album_artist), MIN(t.artist), 'Unknown Artist')
                END,
                MIN(t.year),
                COUNT(*),
                COALESCE(SUM(t.duration_ms), 0),
                MIN(t.artwork_key),
                MAX(CASE WHEN t.album IS NULL THEN 1 ELSE 0 END)
            FROM tracks t
            WHERE t.album_key = ?1
            GROUP BY t.album_key
            "#,
            [album_key.to_string()],
            map_album,
        )
        .optional()
        .map_err(sql_error)
}

fn find_artist_identity(
    connection: &Connection,
    library_id: Uuid,
    requested_key: Uuid,
) -> Result<Option<(String, String)>, String> {
    let mut statement = connection
        .prepare(
            "SELECT normalized_artist, MIN(artist) FROM track_artists GROUP BY normalized_artist",
        )
        .map_err(sql_error)?;
    let identities = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(sql_error)?;
    for identity in identities {
        let (normalized, display) = identity.map_err(sql_error)?;
        if artist_key(library_id, &display) == requested_key {
            return Ok(Some((normalized, display)));
        }
    }
    Ok(None)
}

fn query_artist_summary(
    connection: &Connection,
    library_id: Uuid,
    normalized_artist: &str,
    display_name: &str,
) -> Result<ArtistDto, String> {
    connection
        .query_row(
            r#"
            SELECT COUNT(DISTINCT ta.track_id), COUNT(DISTINCT t.album_key)
            FROM track_artists ta
            JOIN tracks t ON t.id = ta.track_id
            WHERE ta.normalized_artist = ?1
            "#,
            [normalized_artist],
            |row| {
                Ok(ArtistDto {
                    artist_key: artist_key(library_id, display_name),
                    name: display_name.to_owned(),
                    track_count: ui_count(row.get(0)?),
                    album_count: ui_count(row.get(1)?),
                })
            },
        )
        .map_err(sql_error)
}

fn search_query_request(entity: EntityKind, query: &Expr, page_size: u32) -> QueryRequest {
    QueryRequest {
        entity,
        query: query.clone(),
        sort: Vec::new(),
        page: 0,
        page_size,
    }
}

fn take_tracks(page: QueryPage) -> Result<Vec<TrackDto>, String> {
    match page.items {
        QueryItems::Tracks(items) => Ok(items),
        _ => Err("Query returned an unexpected entity kind".to_owned()),
    }
}

fn take_albums(page: QueryPage) -> Result<Vec<AlbumDto>, String> {
    match page.items {
        QueryItems::Albums(items) => Ok(items),
        _ => Err("Query returned an unexpected entity kind".to_owned()),
    }
}

fn take_artists(page: QueryPage) -> Result<Vec<ArtistDto>, String> {
    match page.items {
        QueryItems::Artists(items) => Ok(items),
        _ => Err("Query returned an unexpected entity kind".to_owned()),
    }
}

fn take_folders(page: QueryPage) -> Result<Vec<FolderDto>, String> {
    match page.items {
        QueryItems::Folders(items) => Ok(items),
        _ => Err("Query returned an unexpected entity kind".to_owned()),
    }
}

fn take_genres(page: QueryPage) -> Result<Vec<GenreDto>, String> {
    match page.items {
        QueryItems::Genres(items) => Ok(items),
        _ => Err("Query returned an unexpected entity kind".to_owned()),
    }
}

fn rank_tracks(input: &str, items: &mut [TrackDto]) {
    items.sort_by_key(|item| {
        let primary = item.title.as_deref().unwrap_or_default();
        let related = item
            .artists
            .iter()
            .map(String::as_str)
            .chain(item.album_artist.iter().map(String::as_str))
            .chain(item.album.iter().map(String::as_str))
            .chain(item.genres.iter().map(String::as_str))
            .chain(item.codec.iter().map(String::as_str))
            .collect::<Vec<_>>();
        (
            match_tier(input, primary, &related),
            comparison_key(primary),
            item.rel_path.clone(),
        )
    });
}

fn rank_albums(input: &str, items: &mut [AlbumDto]) {
    items.sort_by_key(|item| {
        (
            match_tier(input, &item.title, &[item.album_artist.as_str()]),
            comparison_key(&item.title),
            item.album_key,
        )
    });
}

fn rank_artists(input: &str, items: &mut [ArtistDto]) {
    items.sort_by_key(|item| {
        (
            match_tier(input, &item.name, &[]),
            comparison_key(&item.name),
            item.artist_key,
        )
    });
}

fn rank_folders(input: &str, items: &mut [FolderDto]) {
    items.sort_by_key(|item| {
        (
            match_tier(input, &item.name, &[item.path.as_str()]),
            comparison_key(&item.path),
        )
    });
}

fn rank_genres(input: &str, items: &mut [GenreDto]) {
    items.sort_by_key(|item| {
        (
            match_tier(input, &item.name, &[]),
            comparison_key(&item.name),
        )
    });
}

fn match_tier(input: &str, primary: &str, related: &[&str]) -> u8 {
    let input = comparison_key(input);
    let primary = comparison_key(primary);
    if primary == input {
        0
    } else if related.iter().any(|value| comparison_key(value) == input) {
        1
    } else if primary.starts_with(&input) {
        2
    } else if primary.contains(&input) {
        3
    } else {
        4
    }
}

fn is_simple_text_query(query: &Expr) -> bool {
    matches!(query, Expr::Text { .. } | Expr::And { .. })
}

fn truncate_to<T>(items: &mut Vec<T>, limit: u32) {
    items.truncate(usize::try_from(limit).unwrap_or(usize::MAX));
}

fn sort_folders(folders: &mut [FolderDto], sorts: &[QuerySort]) {
    folders.sort_by(|left, right| {
        let ordering = comparison_key(&left.path).cmp(&comparison_key(&right.path));
        if sorts
            .first()
            .is_some_and(|sort| sort.direction == SortDirection::Desc)
        {
            ordering.reverse()
        } else {
            ordering
        }
    });
}

fn paginate_vec<T>(items: Vec<T>, page: u32, page_size: u32) -> (Vec<T>, bool) {
    let start = usize::try_from(u64::from(page) * u64::from(page_size)).unwrap_or(usize::MAX);
    if start >= items.len() {
        return (Vec::new(), false);
    }
    let end = start
        .saturating_add(usize::try_from(page_size).unwrap_or(usize::MAX))
        .min(items.len());
    let has_more = end < items.len();
    (
        items.into_iter().skip(start).take(end - start).collect(),
        has_more,
    )
}

fn normalized_page_size(page_size: u32) -> u32 {
    if page_size == 0 {
        DEFAULT_PAGE_SIZE
    } else {
        page_size.min(MAX_PAGE_SIZE)
    }
}

fn page_window(page: u32, page_size: u32) -> (i64, i64) {
    let limit = i64::from(page_size.saturating_add(1));
    let offset = u64::from(page) * u64::from(page_size);
    (limit, i64::try_from(offset).unwrap_or(i64::MAX))
}

fn optional_i32(value: Option<i64>) -> Option<i32> {
    value.and_then(|value| i32::try_from(value).ok())
}

fn optional_u32(value: Option<i64>) -> Option<u32> {
    value.and_then(|value| u32::try_from(value).ok())
}

fn optional_f64(value: Option<i64>) -> Option<f64> {
    value.map(|value| value as f64)
}

fn ui_count(value: i64) -> u32 {
    u32::try_from(value).unwrap_or(if value.is_negative() { 0 } else { u32::MAX })
}

fn sql_error(error: rusqlite::Error) -> String {
    format!("Local query error: {error}")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use uuid::Uuid;

    use crate::domain::{
        metadata::album_key,
        query::{
            parse_query, EntityKind, Expr, QueryField, QueryItems, QueryOperator, QueryRequest,
            QueryValue, SearchRequest, SortDirection,
        },
        track::IndexedTrack,
    };

    use super::IndexDatabase;

    #[test]
    fn compiler_uses_bound_values_and_rejects_invalid_entity_sorts() {
        let (root, database, library_id) = database_with_tracks();
        let malicious = "x' OR 1=1 --";
        let page = database
            .execute_query(
                library_id,
                QueryRequest {
                    entity: EntityKind::Track,
                    query: Expr::Predicate {
                        field: QueryField::Title,
                        op: QueryOperator::Eq,
                        value: QueryValue::Text(malicious.to_owned()),
                    },
                    sort: Vec::new(),
                    page: 0,
                    page_size: 100,
                },
            )
            .unwrap();
        let QueryItems::Tracks(tracks) = page.items else {
            panic!("expected tracks")
        };
        assert!(tracks.is_empty());
        assert_eq!(database.track_count().unwrap(), 4);

        let invalid = database.execute_query(
            library_id,
            QueryRequest {
                entity: EntityKind::Artist,
                query: Expr::all(),
                sort: vec![crate::domain::query::QuerySort {
                    field: QueryField::Bitrate,
                    direction: SortDirection::Asc,
                }],
                page: 0,
                page_size: 100,
            },
        );
        assert!(invalid.is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn fts_follows_insert_update_and_delete() {
        let root = temporary_root();
        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();
        let library_id = Uuid::new_v4();
        let session = database.scan_session(1).unwrap();
        session
            .upsert_track(&track(
                library_id,
                "album/one.flac",
                "Original",
                "Artist",
                "Album",
                1,
            ))
            .unwrap();
        session.finish().unwrap();
        assert_eq!(search_track_count(&database, library_id, "Original"), 1);

        let session = database.scan_session(2).unwrap();
        session
            .upsert_track(&track(
                library_id,
                "album/one.flac",
                "Updated",
                "Artist",
                "Album",
                1,
            ))
            .unwrap();
        session.finish().unwrap();
        assert_eq!(search_track_count(&database, library_id, "Original"), 0);
        assert_eq!(search_track_count(&database, library_id, "Updated"), 1);

        database.scan_session(3).unwrap().finish().unwrap();
        assert_eq!(search_track_count(&database, library_id, "Updated"), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn album_detail_is_isolated_and_orders_disc_then_track() {
        let (root, database, library_id) = database_with_tracks();
        let albums = database
            .execute_query(
                library_id,
                QueryRequest {
                    entity: EntityKind::Album,
                    query: Expr::Predicate {
                        field: QueryField::Album,
                        op: QueryOperator::Eq,
                        value: QueryValue::Text("Even in Arcadia".to_owned()),
                    },
                    sort: Vec::new(),
                    page: 0,
                    page_size: 100,
                },
            )
            .unwrap();
        let QueryItems::Albums(albums) = albums.items else {
            panic!("expected albums")
        };
        assert_eq!(albums.len(), 1);
        let detail = database.album_detail(albums[0].album_key).unwrap().unwrap();
        assert_eq!(detail.tracks.len(), 3);
        assert_eq!(detail.tracks[0].title.as_deref(), Some("First"));
        assert_eq!(detail.tracks[1].title.as_deref(), Some("Second"));
        assert_eq!(detail.tracks[2].title.as_deref(), Some("Disc Two"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn exact_artist_search_relationally_exposes_albums_and_tracks() {
        let (root, database, library_id) = database_with_tracks();
        let results = database
            .global_search(
                library_id,
                SearchRequest {
                    input: "Sleep Token".to_owned(),
                    limit_per_section: 20,
                },
            )
            .unwrap();
        assert_eq!(results.artists.len(), 1);
        assert_eq!(results.artists[0].name, "Sleep Token");
        assert_eq!(results.albums.len(), 1);
        assert_eq!(results.albums[0].title, "Even in Arcadia");
        assert_eq!(results.tracks.len(), 3);
        let detail = database
            .artist_detail(library_id, results.artists[0].artist_key)
            .unwrap()
            .unwrap();
        assert_eq!(detail.albums.len(), 1);
        assert_eq!(detail.tracks.len(), 3);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn free_text_and_structured_filters_share_one_ast_and_query_path() {
        let (root, database, library_id) = database_with_tracks();
        let query =
            parse_query(r#""Sleep Token" codec:flac year:>=2020 samplerate:>=48000 genre:metal"#)
                .unwrap();
        let page = database
            .execute_query(
                library_id,
                QueryRequest {
                    entity: EntityKind::Track,
                    query,
                    sort: Vec::new(),
                    page: 0,
                    page_size: 2,
                },
            )
            .unwrap();
        assert!(page.has_more);
        let QueryItems::Tracks(tracks) = page.items else {
            panic!("expected tracks")
        };
        assert_eq!(tracks.len(), 2);
        assert!(tracks
            .iter()
            .all(|track| track.artist.as_deref() == Some("Sleep Token")));
        fs::remove_dir_all(root).unwrap();
    }

    fn search_track_count(database: &IndexDatabase, library_id: Uuid, query: &str) -> usize {
        database
            .global_search(
                library_id,
                SearchRequest {
                    input: query.to_owned(),
                    limit_per_section: 50,
                },
            )
            .unwrap()
            .tracks
            .len()
    }

    fn database_with_tracks() -> (std::path::PathBuf, IndexDatabase, Uuid) {
        let root = temporary_root();
        let database = IndexDatabase::open(root.join("index.sqlite3")).unwrap();
        let library_id = Uuid::new_v4();
        let session = database.scan_session(1).unwrap();
        session
            .upsert_track(&track(
                library_id,
                "Sleep Token/Even in Arcadia/02.flac",
                "Second",
                "Sleep Token",
                "Even in Arcadia",
                2,
            ))
            .unwrap();
        session
            .upsert_track(&track(
                library_id,
                "Sleep Token/Even in Arcadia/01.flac",
                "First",
                "Sleep Token",
                "Even in Arcadia",
                1,
            ))
            .unwrap();
        let mut disc_two = track(
            library_id,
            "Sleep Token/Even in Arcadia/Disc 2/01.flac",
            "Disc Two",
            "Sleep Token",
            "Even in Arcadia",
            1,
        );
        disc_two.disc_no = Some(2);
        session.upsert_track(&disc_two).unwrap();
        session
            .upsert_track(&track(
                library_id,
                "Other/Other Album/01.flac",
                "Unrelated",
                "Other Artist",
                "Other Album",
                1,
            ))
            .unwrap();
        session.finish().unwrap();
        (root, database, library_id)
    }

    fn track(
        library_id: Uuid,
        path: &str,
        title: &str,
        artist: &str,
        album: &str,
        track_no: i64,
    ) -> IndexedTrack {
        IndexedTrack {
            id: Uuid::new_v5(&library_id, path.as_bytes()),
            album_key: album_key(
                library_id,
                path,
                Some(artist),
                Some(artist),
                Some(album),
                Some(2025),
                false,
            ),
            rel_path: path.to_owned(),
            title: Some(title.to_owned()),
            artist: Some(artist.to_owned()),
            artists: vec![artist.to_owned()],
            album_artist: Some(artist.to_owned()),
            album: Some(album.to_owned()),
            year: Some(2025),
            track_no: Some(track_no),
            disc_no: Some(1),
            genres: vec!["Metal".to_owned()],
            composer: None,
            duration_ms: Some(180_000),
            codec: Some("flac".to_owned()),
            container: Some("flac".to_owned()),
            sample_rate: Some(48_000),
            bit_depth: Some(24),
            channels: Some(2),
            bitrate: Some(1_000),
            file_size: 100,
            mtime_ns: 1,
            artwork_key: None,
            compilation: false,
        }
    }

    fn temporary_root() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("basis-query-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }
}

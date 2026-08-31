use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader, Write},
    path::Path,
};

use uuid::Uuid;

use crate::{
    domain::history::{HistoryEvent, HistoryEventType, HistoryPayload},
    index::db::{HistoryProjection, IndexDatabase},
};

use super::manifest::MUSICLIB_DIRECTORY;

const MAX_EVENT_FILE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_EVENT_LINE_BYTES: usize = 256 * 1024;
const MAX_EVENT_FILES: usize = 1_024;
const MAX_EVENTS: usize = 2_000_000;

#[derive(Debug)]
pub struct EventCatalog {
    pub events: Vec<HistoryEvent>,
    pub warnings: Vec<String>,
}

pub fn append_event(
    root: &Path,
    device_id: Uuid,
    mut event: HistoryEvent,
) -> Result<HistoryEvent, String> {
    event.normalize_and_validate()?;
    let directory = event_directory(root);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create {}: {error}", directory.display()))?;
    let path = directory.join(format!("{device_id}.jsonl"));
    let mut serialized = serde_json::to_vec(&event)
        .map_err(|error| format!("Could not serialize portable history event: {error}"))?;
    if serialized.len() > MAX_EVENT_LINE_BYTES {
        return Err("Portable history event exceeds the safety limit".to_owned());
    }
    serialized.push(b'\n');
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("Could not open {} for append: {error}", path.display()))?;
    file.write_all(&serialized)
        .map_err(|error| format!("Could not append portable history: {error}"))?;
    file.sync_data()
        .map_err(|error| format!("Could not sync portable history: {error}"))?;
    Ok(event)
}

pub fn load_events(root: &Path) -> Result<EventCatalog, String> {
    let directory = event_directory(root);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create {}: {error}", directory.display()))?;
    let mut paths = fs::read_dir(&directory)
        .map_err(|error| format!("Could not read {}: {error}", directory.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "jsonl")
        })
        .collect::<Vec<_>>();
    paths.sort();
    if paths.len() > MAX_EVENT_FILES {
        return Err(format!(
            "Portable history contains more than {MAX_EVENT_FILES} device logs"
        ));
    }

    let mut events = Vec::new();
    let mut warnings = Vec::new();
    for path in paths {
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("<invalid filename>");
        let relative = format!(".musiclib/events/{name}");
        let valid_filename = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .and_then(|stem| Uuid::parse_str(stem).ok())
            .is_some();
        if !valid_filename {
            warnings.push(format!("Skipped {relative}: filename is not a device UUID"));
            continue;
        }
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                warnings.push(format!("Skipped {relative}: {error}"));
                continue;
            }
        };
        if metadata.len() > MAX_EVENT_FILE_BYTES {
            warnings.push(format!("Skipped {relative}: file exceeds the safety limit"));
            continue;
        }
        let file = match fs::File::open(&path) {
            Ok(file) => file,
            Err(error) => {
                warnings.push(format!("Skipped {relative}: {error}"));
                continue;
            }
        };
        for (line_index, line) in BufReader::new(file).split(b'\n').enumerate() {
            if events.len() >= MAX_EVENTS {
                return Err(format!(
                    "Portable history contains more than {MAX_EVENTS} events"
                ));
            }
            let line_number = line_index + 1;
            let line = match line {
                Ok(line) => line,
                Err(error) => {
                    warnings.push(format!("Skipped {relative}:{line_number}: {error}"));
                    continue;
                }
            };
            if line.is_empty() {
                continue;
            }
            if line.len() > MAX_EVENT_LINE_BYTES {
                warnings.push(format!(
                    "Skipped {relative}:{line_number}: line exceeds the safety limit"
                ));
                continue;
            }
            let parsed = serde_json::from_slice::<HistoryEvent>(&line)
                .map_err(|error| error.to_string())
                .and_then(|mut event| {
                    event
                        .normalize_and_validate()
                        .map(|_| event)
                        .map_err(|error| error.to_string())
                });
            match parsed {
                Ok(event) => events.push(event),
                Err(error) => warnings.push(format!(
                    "Skipped {relative}:{line_number}: invalid event: {error}"
                )),
            }
        }
    }
    Ok(EventCatalog { events, warnings })
}

pub fn rebuild_projection(root: &Path, database: &IndexDatabase) -> Result<Vec<String>, String> {
    let catalog = load_events(root)?;
    let mut unique_ids = HashSet::new();
    let mut by_path: HashMap<String, HistoryProjection> = HashMap::new();
    let mut favorite_order: HashMap<String, (i128, Uuid)> = HashMap::new();
    for mut event in catalog.events {
        if !unique_ids.insert(event.id) {
            continue;
        }
        let timestamp = event.normalize_and_validate()?;
        let resolved_path = if database.track_exists(&event.track.path)? {
            Some(event.track.path.clone())
        } else {
            let candidates = database.find_relink_candidates(&event.track.hint)?;
            (candidates.len() == 1).then(|| candidates[0].rel_path.clone())
        };
        let Some(path) = resolved_path else {
            continue;
        };
        let projection = by_path
            .entry(path.clone())
            .or_insert_with(|| HistoryProjection::new(path.clone()));
        match (event.event_type, event.payload) {
            (HistoryEventType::Played, HistoryPayload::Seconds { .. }) => {
                projection.play_count = projection.play_count.saturating_add(1);
                let millis = timestamp.unix_timestamp_nanos() / 1_000_000;
                let millis = i64::try_from(millis).unwrap_or(if millis.is_negative() {
                    i64::MIN
                } else {
                    i64::MAX
                });
                projection.last_played = Some(
                    projection
                        .last_played
                        .map_or(millis, |current| current.max(millis)),
                );
            }
            (HistoryEventType::FavoriteSet, HistoryPayload::Favorite { value }) => {
                let order = (timestamp.unix_timestamp_nanos(), event.id);
                let is_newer = match favorite_order.get(&path) {
                    Some(current) => order > *current,
                    None => true,
                };
                if is_newer {
                    favorite_order.insert(path, order);
                    projection.favorite = value;
                }
            }
            (HistoryEventType::Skipped, HistoryPayload::Seconds { .. }) => {}
            _ => unreachable!("validated history event payload"),
        }
    }
    database.replace_history_projections(by_path.into_values().collect())?;
    Ok(catalog.warnings)
}

fn event_directory(root: &Path) -> std::path::PathBuf {
    root.join(MUSICLIB_DIRECTORY).join("events")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use uuid::Uuid;

    use crate::{
        domain::{
            history::{EventTrack, HistoryEvent, HistoryEventType, HistoryPayload},
            metadata::album_key,
            playlist::TrackHint,
            track::IndexedTrack,
        },
        index::db::IndexDatabase,
        portable::manifest::ensure_layout,
    };

    use super::{append_event, load_events, rebuild_projection};

    #[test]
    fn device_logs_are_append_only_and_rebuild_local_projection() {
        let root = std::env::temp_dir().join(format!("basis-events-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        ensure_layout(&root).unwrap();
        let database = IndexDatabase::open(root.join("local.sqlite3")).unwrap();
        let library_id = Uuid::new_v4();
        let session = database.scan_session(1).unwrap();
        session.upsert_track(&track(library_id)).unwrap();
        session.finish().unwrap();
        let first_device = Uuid::new_v4();
        let second_device = Uuid::new_v4();

        let played = event_at(
            "2026-08-30T22:00:00Z",
            HistoryEventType::Played,
            HistoryPayload::Seconds { seconds: 150.0 },
        );
        append_event(&root, first_device, played.clone()).unwrap();
        append_event(&root, second_device, played).unwrap();
        append_event(
            &root,
            first_device,
            event_at(
                "2026-08-30T22:01:00Z",
                HistoryEventType::FavoriteSet,
                HistoryPayload::Favorite { value: false },
            ),
        )
        .unwrap();
        append_event(
            &root,
            second_device,
            event_at(
                "2026-08-30T22:02:00Z",
                HistoryEventType::FavoriteSet,
                HistoryPayload::Favorite { value: true },
            ),
        )
        .unwrap();
        append_event(
            &root,
            second_device,
            event_at(
                "2026-08-30T22:03:00Z",
                HistoryEventType::Skipped,
                HistoryPayload::Seconds { seconds: 4.0 },
            ),
        )
        .unwrap();

        assert_eq!(load_events(&root).unwrap().events.len(), 5);
        assert_eq!(
            fs::read_dir(root.join(".musiclib/events"))
                .unwrap()
                .filter_map(Result::ok)
                .count(),
            2
        );
        rebuild_projection(&root, &database).unwrap();
        let projection = database.history_for_track("Artist/Album/01.flac").unwrap();
        assert_eq!(projection.0, 1);
        assert!(projection.1);
        assert!(projection.2.is_some());

        let database_path = database.path().to_path_buf();
        drop(database);
        fs::remove_file(&database_path).unwrap();
        let rebuilt = IndexDatabase::open(database_path).unwrap();
        let session = rebuilt.scan_session(2).unwrap();
        session.upsert_track(&track(library_id)).unwrap();
        session.finish().unwrap();
        assert_eq!(
            rebuilt.history_for_track("Artist/Album/01.flac").unwrap(),
            (0, false, None)
        );
        rebuild_projection(&root, &rebuilt).unwrap();
        assert_eq!(
            rebuilt.history_for_track("Artist/Album/01.flac").unwrap().0,
            1
        );
        fs::remove_dir_all(root).unwrap();
    }

    fn event_at(
        timestamp: &str,
        event_type: HistoryEventType,
        payload: HistoryPayload,
    ) -> HistoryEvent {
        HistoryEvent {
            id: Uuid::new_v4(),
            ts: timestamp.to_owned(),
            event_type,
            track: EventTrack {
                path: "Artist/Album/01.flac".to_owned(),
                hint: hint(),
            },
            payload,
        }
    }

    fn hint() -> TrackHint {
        TrackHint {
            title: Some("Song".to_owned()),
            artist: Some("Artist".to_owned()),
            album: Some("Album".to_owned()),
            duration_ms: Some(180_000.0),
            disc_no: Some(1),
            track_no: Some(1),
        }
    }

    fn track(library_id: Uuid) -> IndexedTrack {
        IndexedTrack {
            id: Uuid::new_v5(&library_id, b"Artist/Album/01.flac"),
            album_key: album_key(
                library_id,
                "Artist/Album/01.flac",
                Some("Artist"),
                Some("Artist"),
                Some("Album"),
                None,
                false,
            ),
            rel_path: "Artist/Album/01.flac".to_owned(),
            title: Some("Song".to_owned()),
            artist: Some("Artist".to_owned()),
            artists: vec!["Artist".to_owned()],
            album_artist: Some("Artist".to_owned()),
            album: Some("Album".to_owned()),
            year: None,
            track_no: Some(1),
            disc_no: Some(1),
            genres: Vec::new(),
            composer: None,
            duration_ms: Some(180_000),
            codec: Some("flac".to_owned()),
            container: Some("flac".to_owned()),
            sample_rate: Some(44_100),
            bit_depth: Some(16),
            channels: Some(2),
            bitrate: None,
            file_size: 1,
            mtime_ns: 1,
            artwork_key: None,
            compilation: false,
        }
    }
}

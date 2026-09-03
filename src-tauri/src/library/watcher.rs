use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::{Duration, Instant, UNIX_EPOCH},
};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event as TauriSpectaEvent;

use crate::{
    app_state::{ActiveLibrary, AppState},
    domain::track::LibrarySummary,
    portable::{events::rebuild_projection, paths::normalize_from_absolute},
};

use super::scanner::{
    is_supported_audio_path, reindex_audio_path, reindex_audio_tree, remove_indexed_path_prefix,
    scan_library,
};

const DEBOUNCE: Duration = Duration::from_millis(500);
const STABILITY_SAMPLE: Duration = Duration::from_millis(125);
const MAX_STABILITY_SAMPLES: usize = 40;
const MAX_BATCH_PATHS: usize = 4096;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum LibraryChangeKind {
    Audio,
    Views,
    Playlists,
    Events,
    Themes,
    Workspace,
    Lyrics,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, TauriSpectaEvent)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "library://changed")]
pub struct LibraryChangedEvent {
    pub summary: LibrarySummary,
    pub kinds: Vec<LibraryChangeKind>,
    pub changed_paths: Vec<String>,
    pub error: Option<String>,
}

pub fn start_library_watcher(app: AppHandle, state: AppState, generation: u64) {
    thread::spawn(move || {
        let active = match state.active_library() {
            Ok(Some(active)) if state.is_generation_current(generation) => active,
            _ => return,
        };
        if let Err(error) = watch_loop(&app, &state, generation, active) {
            emit_error(&app, &state, generation, error);
        }
    });
}

fn watch_loop(
    app: &AppHandle,
    state: &AppState,
    generation: u64,
    active: ActiveLibrary,
) -> Result<(), String> {
    let (sender, receiver) = mpsc::channel();
    let mut watcher = RecommendedWatcher::new(
        move |event| {
            let _ = sender.send(event);
        },
        Config::default(),
    )
    .map_err(|error| format!("Could not initialize the library watcher: {error}"))?;
    watcher
        .watch(&active.root, RecursiveMode::Recursive)
        .map_err(|error| format!("Could not watch the selected library: {error}"))?;

    while state.is_generation_current(generation) {
        let first = match receiver.recv_timeout(Duration::from_millis(250)) {
            Ok(Ok(event)) => event,
            Ok(Err(error)) => {
                emit_error(
                    app,
                    state,
                    generation,
                    format!("Library watcher error: {error}"),
                );
                continue;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        let mut paths = BTreeSet::new();
        let mut overflowed = collect_paths(&active.root, &first, &mut paths);
        let mut deadline = Instant::now() + DEBOUNCE;
        loop {
            let timeout = deadline.saturating_duration_since(Instant::now());
            match receiver.recv_timeout(timeout) {
                Ok(Ok(event)) => {
                    overflowed |= collect_paths(&active.root, &event, &mut paths);
                    deadline = Instant::now() + DEBOUNCE;
                }
                Ok(Err(error)) => {
                    emit_error(
                        app,
                        state,
                        generation,
                        format!("Library watcher error: {error}"),
                    );
                }
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
            }
        }
        if !state.is_generation_current(generation) {
            return Ok(());
        }
        if overflowed {
            rescan_after_overflow(app, state, generation, &active)?;
            continue;
        }
        process_paths(app, state, generation, &active, paths)?;
    }
    Ok(())
}

fn collect_paths(root: &Path, event: &Event, paths: &mut BTreeSet<PathBuf>) -> bool {
    let mut overflowed = false;
    for path in &event.paths {
        if paths.len() >= MAX_BATCH_PATHS {
            overflowed = true;
            continue;
        }
        let absolute = if path.is_absolute() {
            path.clone()
        } else {
            root.join(path)
        };
        if absolute.starts_with(root) {
            paths.insert(absolute);
        }
    }
    overflowed
}

fn rescan_after_overflow(
    app: &AppHandle,
    state: &AppState,
    generation: u64,
    active: &ActiveLibrary,
) -> Result<(), String> {
    scan_library(
        &active.root,
        active.summary.library_id,
        &active.database,
        &active.artwork_cache_dir,
        |_| {},
    )?;
    rebuild_projection(&active.root, &active.database)?;
    let Some(summary) = state.refresh_summary(generation)? else {
        return Ok(());
    };
    LibraryChangedEvent {
        summary,
        kinds: vec![
            LibraryChangeKind::Audio,
            LibraryChangeKind::Views,
            LibraryChangeKind::Playlists,
            LibraryChangeKind::Events,
            LibraryChangeKind::Themes,
            LibraryChangeKind::Workspace,
            LibraryChangeKind::Lyrics,
        ],
        changed_paths: Vec::new(),
        error: None,
    }
    .emit(app)
    .map_err(|error| format!("Could not publish the library rescan: {error}"))
}

fn process_paths(
    app: &AppHandle,
    state: &AppState,
    generation: u64,
    active: &ActiveLibrary,
    paths: BTreeSet<PathBuf>,
) -> Result<(), String> {
    let mut kinds = BTreeSet::new();
    let mut changed_paths = BTreeSet::new();
    let mut projection_changed = false;
    let mut first_error = None;

    for path in paths {
        if !state.is_generation_current(generation) {
            return Ok(());
        }
        let Some(kind) = classify_path(&active.root, &path) else {
            continue;
        };
        kinds.insert(kind);
        if let Ok(relative) = normalize_from_absolute(&active.root, &path) {
            changed_paths.insert(relative);
        }
        if kind != LibraryChangeKind::Audio {
            if kind == LibraryChangeKind::Events {
                projection_changed = true;
            }
            continue;
        }

        let result = if path.is_dir() {
            reindex_audio_tree(
                &active.root,
                active.summary.library_id,
                &active.database,
                &active.artwork_cache_dir,
                &path,
            )
        } else if path.exists() {
            wait_until_stable(&path, state, generation).and_then(|stable| {
                if stable {
                    reindex_audio_path(
                        &active.root,
                        active.summary.library_id,
                        &active.database,
                        &active.artwork_cache_dir,
                        &path,
                    )
                    .map(|_| ())
                } else {
                    Ok(())
                }
            })
        } else if is_supported_audio_path(&path) {
            reindex_audio_path(
                &active.root,
                active.summary.library_id,
                &active.database,
                &active.artwork_cache_dir,
                &path,
            )
            .map(|_| ())
        } else {
            remove_indexed_path_prefix(&active.root, &active.database, &path)
        };
        if let Err(error) = result {
            first_error.get_or_insert(error);
        } else {
            projection_changed = true;
        }
    }

    if kinds.is_empty() {
        return Ok(());
    }
    if kinds.contains(&LibraryChangeKind::Audio) {
        if let Err(error) = active
            .database
            .reproject_album_identities(active.summary.library_id)
        {
            first_error.get_or_insert(error);
        }
    }
    if projection_changed {
        if let Err(error) = rebuild_projection(&active.root, &active.database) {
            first_error.get_or_insert(error);
        }
    }
    let Some(summary) = state.refresh_summary(generation)? else {
        return Ok(());
    };
    LibraryChangedEvent {
        summary,
        kinds: kinds.into_iter().collect(),
        changed_paths: changed_paths.into_iter().collect(),
        error: first_error,
    }
    .emit(app)
    .map_err(|error| format!("Could not publish the library change: {error}"))
}

fn classify_path(root: &Path, path: &Path) -> Option<LibraryChangeKind> {
    let relative = normalize_from_absolute(root, path).ok()?;
    let normalized = relative.to_ascii_lowercase();
    if normalized == ".musiclib/workspace.json" {
        return Some(LibraryChangeKind::Workspace);
    }
    if normalized == ".musiclib" || normalized == ".musiclib/views" {
        return Some(LibraryChangeKind::Workspace);
    }
    if normalized.starts_with(".musiclib/views/") {
        return Some(LibraryChangeKind::Views);
    }
    if normalized == ".musiclib/playlists" || normalized.starts_with(".musiclib/playlists/") {
        return Some(LibraryChangeKind::Playlists);
    }
    if normalized == ".musiclib/events" || normalized.starts_with(".musiclib/events/") {
        return Some(LibraryChangeKind::Events);
    }
    if normalized == ".musiclib/themes" || normalized.starts_with(".musiclib/themes/") {
        return Some(LibraryChangeKind::Themes);
    }
    if normalized == ".musiclib/lyrics"
        || normalized.starts_with(".musiclib/lyrics/")
        || normalized.ends_with(".lrc")
    {
        return Some(LibraryChangeKind::Lyrics);
    }
    if is_supported_audio_path(path)
        || path.is_dir()
        || (!path.exists() && path.extension().is_none())
    {
        return Some(LibraryChangeKind::Audio);
    }
    None
}

fn wait_until_stable(path: &Path, state: &AppState, generation: u64) -> Result<bool, String> {
    let mut previous = None;
    let mut stable_samples = 0;
    for _ in 0..MAX_STABILITY_SAMPLES {
        if !state.is_generation_current(generation) {
            return Ok(false);
        }
        let metadata = match fs::metadata(path) {
            Ok(metadata) if metadata.is_file() => metadata,
            Ok(_) => return Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(true),
            Err(error) => return Err(format!("Could not inspect changed library file: {error}")),
        };
        let fingerprint = (metadata.len(), modified_ns(&metadata));
        if previous == Some(fingerprint) {
            stable_samples += 1;
            if stable_samples >= 2 {
                return Ok(true);
            }
        } else {
            previous = Some(fingerprint);
            stable_samples = 0;
        }
        thread::sleep(STABILITY_SAMPLE);
    }
    Err("A changed audio file did not become stable in time".to_owned())
}

fn modified_ns(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

fn emit_error(app: &AppHandle, state: &AppState, generation: u64, error: String) {
    if let Ok(Some(summary)) = state.refresh_summary(generation) {
        let _ = LibraryChangedEvent {
            summary,
            kinds: Vec::new(),
            changed_paths: Vec::new(),
            error: Some(error),
        }
        .emit(app);
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{classify_path, LibraryChangeKind};

    #[test]
    fn classifies_portable_atomic_replacement_by_final_path() {
        let root = std::env::temp_dir().join(format!("basis-watch-{}", uuid::Uuid::new_v4()));
        let path = root.join(".musiclib/views/custom.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, b"{}").unwrap();
        fs::rename(temporary, &path).unwrap();
        assert_eq!(classify_path(&root, &path), Some(LibraryChangeKind::Views));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn classifies_audio_and_ignores_unrelated_files() {
        let root = std::env::temp_dir().join(format!("basis-watch-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        assert_eq!(
            classify_path(&root, &root.join("album/track.FLAC")),
            Some(LibraryChangeKind::Audio)
        );
        assert_eq!(classify_path(&root, &root.join("cover.jpg")), None);
        fs::remove_dir_all(root).unwrap();
    }
}

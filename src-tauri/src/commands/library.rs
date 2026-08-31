use std::{
    path::PathBuf,
    sync::{mpsc, Arc},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_specta::Event;

use crate::{
    app_state::AppState,
    domain::track::{LibrarySummary, ScanProgress},
    library::{scanner::scan_library, service::open_library},
    local_settings::remember_library_root,
    player::service::PlayerService,
    portable::events::rebuild_projection,
};

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "library://scan-progress")]
pub struct LibraryScanEvent {
    summary: LibrarySummary,
    progress: ScanProgress,
    error: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn library_choose_root(
    app: AppHandle,
    state: State<'_, AppState>,
    player: State<'_, Arc<PlayerService>>,
) -> Result<Option<LibrarySummary>, String> {
    let Some(root) = choose_folder(&app)? else {
        return Ok(None);
    };
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Basis application data: {error}"))?;
    let app_cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Could not resolve Basis application cache: {error}"))?;
    let active = open_library(root, &app_data_dir, &app_cache_dir)?;
    remember_library_root(&app_data_dir, &active.root)?;
    player.attach_library(
        active.root.clone(),
        active.summary.library_id,
        active.summary.root_instance_hash.clone(),
        Some(active.database.clone()),
    )?;
    state.set_active_library(active)?;
    let generation = state.begin_scan()?;
    let scanning_summary = state
        .active_library()?
        .ok_or_else(|| "Basis could not retain the selected library".to_owned())?
        .summary;

    start_scan(app, state.inner().clone(), generation);
    Ok(Some(scanning_summary))
}

#[tauri::command]
#[specta::specta]
pub fn library_status(state: State<'_, AppState>) -> Result<Option<LibrarySummary>, String> {
    Ok(state.active_library()?.map(|library| library.summary))
}

#[tauri::command]
#[specta::specta]
pub fn artwork_thumbnail(
    state: State<'_, AppState>,
    artwork_key: String,
    dimension: u32,
) -> Result<Option<String>, String> {
    let library = state
        .active_library()?
        .ok_or_else(|| "Choose a music folder before loading artwork".to_owned())?;
    crate::library::artwork::read_cached_thumbnail(
        &library.artwork_cache_dir,
        &artwork_key,
        dimension,
    )
    .map(|thumbnail| {
        thumbnail.map(|bytes| format!("data:image/webp;base64,{}", STANDARD.encode(bytes)))
    })
}

fn choose_folder(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    app.dialog()
        .file()
        .set_title("Choose your Basis music folder")
        .pick_folder(move |selected| {
            let _ = sender.send(selected);
        });
    let selected = receiver
        .recv()
        .map_err(|_| "The native folder picker closed unexpectedly".to_owned())?;
    selected
        .map(PathBuf::try_from)
        .transpose()
        .map_err(|error| format!("Basis could not access the selected folder: {error}"))
}

pub(crate) fn start_scan(app: AppHandle, state: AppState, generation: u64) {
    std::thread::spawn(move || {
        let active = match state.active_library() {
            Ok(Some(active)) => active,
            Ok(None) | Err(_) => return,
        };
        let scan_result = scan_library(
            &active.root,
            active.summary.library_id,
            &active.database,
            &active.artwork_cache_dir,
            |progress| {
                if let Ok(Some(summary)) = state.update_progress(generation, progress.clone()) {
                    let _ = LibraryScanEvent {
                        summary,
                        progress: progress.clone(),
                        error: None,
                    }
                    .emit(&app);
                }
            },
        )
        .and_then(|_| rebuild_projection(&active.root, &active.database).map(|_| ()));
        if let Err(error) = scan_result {
            if let Ok(Some(summary)) = state.mark_failed(generation) {
                let progress = state
                    .active_library()
                    .ok()
                    .flatten()
                    .map(|library| library.progress)
                    .unwrap_or_default();
                let _ = LibraryScanEvent {
                    summary,
                    progress,
                    error: Some(error),
                }
                .emit(&app);
            }
        }
    });
}

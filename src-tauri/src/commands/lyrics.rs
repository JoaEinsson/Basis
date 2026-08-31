use std::sync::Arc;

use specta::specta;
use tauri::State;
use uuid::Uuid;

use crate::{app_state::AppState, domain::lyrics::LyricsResolution, lyrics::LyricsService};

#[tauri::command]
#[specta]
pub async fn lyrics_resolve(
    state: State<'_, AppState>,
    service: State<'_, Arc<LyricsService>>,
    track_id: Uuid,
    allow_network: bool,
) -> Result<LyricsResolution, String> {
    let library = state
        .active_library()?
        .ok_or_else(|| "Choose a library before loading lyrics".to_owned())?;
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let track = library
            .database
            .tracks_by_ids(&[track_id])?
            .into_iter()
            .next()
            .ok_or_else(|| "Track is no longer in the local index".to_owned())?;
        service.resolve(&library.root, &track, allow_network)
    })
    .await
    .map_err(|error| format!("Lyrics worker failed: {error}"))?
}

#[tauri::command]
#[specta]
pub async fn lyrics_choose_candidate(
    state: State<'_, AppState>,
    service: State<'_, Arc<LyricsService>>,
    track_id: Uuid,
    candidate_id: u32,
) -> Result<LyricsResolution, String> {
    let library = state
        .active_library()?
        .ok_or_else(|| "Choose a library before loading lyrics".to_owned())?;
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let track = library
            .database
            .tracks_by_ids(&[track_id])?
            .into_iter()
            .next()
            .ok_or_else(|| "Track is no longer in the local index".to_owned())?;
        service.choose_candidate(&library.root, &track, candidate_id)
    })
    .await
    .map_err(|error| format!("Lyrics worker failed: {error}"))?
}

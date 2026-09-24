use std::sync::Arc;

use specta::specta;
use tauri::{Manager, State};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    domain::lyrics::{
        LyricsPreferenceState, LyricsPrefetchPolicy, LyricsResolution, LyricsSearchQuery,
    },
    local_settings,
    lyrics::LyricsService,
    player::service::PlayerService,
};

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
pub async fn lyrics_search(
    state: State<'_, AppState>,
    service: State<'_, Arc<LyricsService>>,
    track_id: Uuid,
    query: LyricsSearchQuery,
) -> Result<LyricsResolution, String> {
    let library = state
        .active_library()?
        .ok_or_else(|| "Choose a library before searching for lyrics".to_owned())?;
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let track = library
            .database
            .tracks_by_ids(&[track_id])?
            .into_iter()
            .next()
            .ok_or_else(|| "Track is no longer in the local index".to_owned())?;
        service.search(&library.root, &track, query)
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

#[tauri::command]
#[specta]
pub async fn lyrics_set_offset(
    state: State<'_, AppState>,
    service: State<'_, Arc<LyricsService>>,
    track_id: Uuid,
    offset_ms: i32,
) -> Result<LyricsPreferenceState, String> {
    let library = state
        .active_library()?
        .ok_or_else(|| "Choose a library before changing lyric timing".to_owned())?;
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let track = library
            .database
            .tracks_by_ids(&[track_id])?
            .into_iter()
            .next()
            .ok_or_else(|| "Track is no longer in the local index".to_owned())?;
        service.set_offset(&library.root, &track, offset_ms)
    })
    .await
    .map_err(|error| format!("Lyrics worker failed: {error}"))?
}

#[tauri::command]
#[specta]
pub async fn lyrics_clear_selection(
    state: State<'_, AppState>,
    service: State<'_, Arc<LyricsService>>,
    track_id: Uuid,
) -> Result<LyricsResolution, String> {
    let library = state
        .active_library()?
        .ok_or_else(|| "Choose a library before resetting a lyric choice".to_owned())?;
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let track = library
            .database
            .tracks_by_ids(&[track_id])?
            .into_iter()
            .next()
            .ok_or_else(|| "Track is no longer in the local index".to_owned())?;
        service.clear_selection(&library.root, &track)
    })
    .await
    .map_err(|error| format!("Lyrics worker failed: {error}"))?
}

#[tauri::command]
#[specta]
pub fn lyrics_prefetch_policy(app: tauri::AppHandle) -> Result<LyricsPrefetchPolicy, String> {
    local_settings::lyrics_prefetch_policy(
        &app.path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve local lyrics settings: {error}"))?,
    )
}

#[tauri::command]
#[specta]
pub fn lyrics_set_prefetch(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<LyricsPrefetchPolicy, String> {
    local_settings::set_lyrics_prefetch(
        &app.path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve local lyrics settings: {error}"))?,
        enabled,
    )
}

#[tauri::command]
#[specta]
pub async fn lyrics_prefetch(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    service: State<'_, Arc<LyricsService>>,
    player: State<'_, Arc<PlayerService>>,
    track_id: Option<Uuid>,
) -> Result<bool, String> {
    let service = Arc::clone(service.inner());
    let Some(track_id) = track_id else {
        service.cancel_prefetch();
        return Ok(false);
    };
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve local lyrics settings: {error}"))?;
    if !local_settings::lyrics_prefetch_policy(&app_data)?.enabled {
        service.cancel_prefetch();
        return Ok(false);
    }
    if player.lyrics_prefetch_track_id()? != Some(track_id) {
        service.cancel_prefetch();
        return Ok(false);
    }
    let Some(library) = state.active_library()? else {
        service.cancel_prefetch();
        return Ok(false);
    };
    let generation = service.begin_prefetch();
    tauri::async_runtime::spawn_blocking(move || {
        let track = library
            .database
            .tracks_by_ids(&[track_id])?
            .into_iter()
            .next()
            .ok_or_else(|| "Track is no longer in the local index".to_owned())?;
        match service.prefetch(&library.root, &track, generation) {
            Err(error) if error == "Lyrics prefetch was superseded" => Ok(false),
            result => result,
        }
    })
    .await
    .map_err(|error| format!("Lyrics worker failed: {error}"))?
}

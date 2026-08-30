use std::sync::Arc;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    domain::player::{PlayerSnapshot, QueueInsertMode, RepeatMode},
    player::service::PlayerService,
};

const MAX_MATERIALIZED_TRACKS: usize = 10_000;

#[tauri::command]
#[specta::specta]
pub async fn player_play_collection(
    app: AppHandle,
    state: State<'_, AppState>,
    player: State<'_, Arc<PlayerService>>,
    track_ids: Vec<Uuid>,
    start_track_id: Uuid,
    mode: QueueInsertMode,
) -> Result<PlayerSnapshot, String> {
    if track_ids.is_empty() {
        return Err("Cannot materialize an empty playback collection".to_owned());
    }
    if track_ids.len() > MAX_MATERIALIZED_TRACKS {
        return Err("The requested playback collection exceeds the safety limit".to_owned());
    }
    let library = state
        .active_library()?
        .ok_or_else(|| "Choose a music folder before starting playback".to_owned())?;
    let tracks =
        tauri::async_runtime::spawn_blocking(move || library.database.tracks_by_ids(&track_ids))
            .await
            .map_err(|error| format!("Playback collection worker failed: {error}"))??;
    player
        .inner()
        .play_collection(&app, tracks, start_track_id, mode)
}

#[tauri::command]
#[specta::specta]
pub fn player_get_state(player: State<'_, Arc<PlayerService>>) -> Result<PlayerSnapshot, String> {
    player.snapshot()
}

#[tauri::command]
#[specta::specta]
pub fn player_pause(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
) -> Result<PlayerSnapshot, String> {
    player.pause(&app)
}

#[tauri::command]
#[specta::specta]
pub fn player_resume(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
) -> Result<PlayerSnapshot, String> {
    player.inner().resume(&app)
}

#[tauri::command]
#[specta::specta]
pub fn player_seek(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
    position_ms: f64,
) -> Result<PlayerSnapshot, String> {
    player.seek(&app, position_ms)
}

#[tauri::command]
#[specta::specta]
pub fn player_next(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
) -> Result<PlayerSnapshot, String> {
    player.inner().next(&app)
}

#[tauri::command]
#[specta::specta]
pub fn player_previous(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
) -> Result<PlayerSnapshot, String> {
    player.inner().previous(&app)
}

#[tauri::command]
#[specta::specta]
pub fn player_set_volume(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
    volume: u8,
) -> Result<PlayerSnapshot, String> {
    player.set_volume(&app, volume)
}

#[tauri::command]
#[specta::specta]
pub fn player_set_shuffle(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
    enabled: bool,
) -> Result<PlayerSnapshot, String> {
    player.set_shuffle(&app, enabled)
}

#[tauri::command]
#[specta::specta]
pub fn player_set_repeat(
    app: AppHandle,
    player: State<'_, Arc<PlayerService>>,
    repeat: RepeatMode,
) -> Result<PlayerSnapshot, String> {
    player.set_repeat(&app, repeat)
}

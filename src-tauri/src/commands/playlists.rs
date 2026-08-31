use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::{
    app_state::{ActiveLibrary, AppState},
    domain::{
        history::HistoryEvent,
        playlist::{
            Playlist, PlaylistCatalog, PlaylistDraft, ResolvedPlaylist, ResolvedPlaylistItem,
            StaticPlaylistItem, TrackHint,
        },
        query::{EntityKind, QueryItems, QueryRequest},
    },
    local_settings::device_id,
    portable::{
        events::{append_event, rebuild_projection},
        playlists::{
            create_playlist, delete_playlist, find_playlist, load_playlists, save_playlist,
        },
    },
};

const RESOLVE_PAGE_SIZE: u32 = 500;
const MAX_RESOLVED_ITEMS: usize = 10_000;

#[tauri::command]
#[specta::specta]
pub fn playlists_list(state: State<'_, AppState>) -> Result<PlaylistCatalog, String> {
    let library = active_library(&state)?;
    load_playlists(&library.root)
}

#[tauri::command]
#[specta::specta]
pub fn playlists_create(
    state: State<'_, AppState>,
    draft: PlaylistDraft,
) -> Result<Playlist, String> {
    let library = active_library(&state)?;
    create_playlist(&library.root, draft)
}

#[tauri::command]
#[specta::specta]
pub fn playlists_update(
    state: State<'_, AppState>,
    playlist: Playlist,
) -> Result<Playlist, String> {
    let library = active_library(&state)?;
    save_playlist(&library.root, playlist)
}

#[tauri::command]
#[specta::specta]
pub fn playlists_delete(state: State<'_, AppState>, id: Uuid) -> Result<(), String> {
    let library = active_library(&state)?;
    delete_playlist(&library.root, id)
}

#[tauri::command]
#[specta::specta]
pub async fn playlists_resolve(
    state: State<'_, AppState>,
    id: Uuid,
) -> Result<ResolvedPlaylist, String> {
    let library = active_library(&state)?;
    tauri::async_runtime::spawn_blocking(move || resolve_playlist(&library, id))
        .await
        .map_err(|error| format!("Playlist worker failed: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn favorite_set(
    app: AppHandle,
    state: State<'_, AppState>,
    track_id: Uuid,
    value: bool,
) -> Result<HistoryEvent, String> {
    let library = active_library(&state)?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Basis application data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let track = library
            .database
            .tracks_by_ids(&[track_id])?
            .into_iter()
            .next()
            .ok_or_else(|| format!("Track {track_id} is no longer in the local index"))?;
        let event = append_event(
            &library.root,
            device_id(&app_data_dir)?,
            HistoryEvent::favorite(&track, value)?,
        )?;
        rebuild_projection(&library.root, &library.database)?;
        Ok(event)
    })
    .await
    .map_err(|error| format!("Favorite worker failed: {error}"))?
}

fn resolve_playlist(library: &ActiveLibrary, id: Uuid) -> Result<ResolvedPlaylist, String> {
    let playlist = find_playlist(&library.root, id)?;
    let items = match &playlist {
        Playlist::Static { items, .. } => {
            let paths = items
                .iter()
                .map(|item| item.path.clone())
                .collect::<Vec<_>>();
            let tracks = library.database.tracks_by_paths(&paths)?;
            items
                .iter()
                .cloned()
                .zip(tracks)
                .map(|(item, track)| {
                    let suggested_path = if track.is_none() {
                        let candidates = library.database.find_relink_candidates(&item.hint)?;
                        (candidates.len() == 1).then(|| candidates[0].rel_path.clone())
                    } else {
                        None
                    };
                    Ok(ResolvedPlaylistItem {
                        item,
                        track,
                        suggested_path,
                    })
                })
                .collect::<Result<Vec<_>, String>>()?
        }
        Playlist::Smart { query, sort, .. } => {
            let mut page = 0;
            let mut tracks = Vec::new();
            loop {
                let result = library.database.execute_query(
                    library.summary.library_id,
                    QueryRequest {
                        entity: EntityKind::Track,
                        query: query.clone(),
                        sort: sort.clone(),
                        page,
                        page_size: RESOLVE_PAGE_SIZE,
                    },
                )?;
                let QueryItems::Tracks(mut page_tracks) = result.items else {
                    return Err("Smart playlist returned an unexpected entity kind".to_owned());
                };
                tracks.append(&mut page_tracks);
                if tracks.len() > MAX_RESOLVED_ITEMS {
                    return Err(format!(
                        "Smart playlist exceeds the {MAX_RESOLVED_ITEMS}-track materialization limit"
                    ));
                }
                if !result.has_more {
                    break;
                }
                page = page.saturating_add(1);
            }
            tracks
                .into_iter()
                .map(|track| ResolvedPlaylistItem {
                    item: StaticPlaylistItem {
                        path: track.rel_path.clone(),
                        hint: TrackHint::from_track(&track),
                    },
                    track: Some(track),
                    suggested_path: None,
                })
                .collect()
        }
    };
    Ok(ResolvedPlaylist { playlist, items })
}

fn active_library(state: &State<'_, AppState>) -> Result<ActiveLibrary, String> {
    state
        .active_library()?
        .ok_or_else(|| "Choose a music folder before using playlists".to_owned())
}

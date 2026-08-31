#![forbid(unsafe_code)]
#![allow(linker_messages)] // MSVC localizes normal import-library output as a rustc warning.

use std::sync::Arc;

mod app_state;
mod commands;
mod domain;
mod index;
mod library;
mod local_settings;
mod player;
mod portable;
mod theme_engine;

use specta_typescript::Typescript;
use tauri::Manager;
use tauri_specta::{collect_commands, collect_events, Builder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bindings = Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            commands::app::app_health,
            commands::library::library_choose_root,
            commands::library::library_status,
            commands::library::artwork_thumbnail,
            commands::query::query_parse,
            commands::query::query_execute,
            commands::query::search_global,
            commands::query::views_list,
            commands::query::views_save,
            commands::query::views_duplicate,
            commands::query::views_delete,
            commands::query::views_set_pinned,
            commands::query::album_detail,
            commands::query::artist_detail,
            commands::player::player_play_collection,
            commands::player::player_get_state,
            commands::player::player_pause,
            commands::player::player_resume,
            commands::player::player_seek,
            commands::player::player_next,
            commands::player::player_previous,
            commands::player::player_set_volume,
            commands::player::player_set_shuffle,
            commands::player::player_set_repeat,
            commands::playlists::playlists_list,
            commands::playlists::playlists_create,
            commands::playlists::playlists_update,
            commands::playlists::playlists_delete,
            commands::playlists::playlists_resolve,
            commands::playlists::favorite_set,
            commands::theme::themes_list,
            commands::theme::theme_get_editable,
            commands::theme::theme_resolve,
            commands::theme::theme_duplicate,
            commands::theme::theme_save_edits,
            commands::theme::theme_import,
            commands::theme::theme_export,
            commands::theme::theme_delete,
            commands::theme::theme_selection,
            commands::theme::theme_set_selection,
            commands::theme::theme_token_registry,
        ])
        .events(collect_events![
            commands::library::LibraryScanEvent,
            domain::player::PlayerStateEvent,
            domain::player::PlayerTrackChangedEvent,
            domain::player::PlayerQueueChangedEvent,
            domain::player::PlayerErrorEvent,
        ]);

    #[cfg(debug_assertions)]
    bindings
        .export(Typescript::default(), "../src/lib/bindings.ts")
        .expect("Could not generate Basis TypeScript bindings");

    tauri::Builder::default()
        .manage(app_state::AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(bindings.invoke_handler())
        .setup(move |app| {
            bindings.mount_events(app);
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("Could not resolve Basis application data: {error}"))?;
            let player = player::service::PlayerService::load(&app_data_dir)?;
            app.manage(Arc::clone(&player));
            if let Err(error) = library::service::restore_recent_library(app.handle()) {
                eprintln!("Basis could not restore the recent library: {error}");
            }
            if let Some(active) = app.state::<app_state::AppState>().active_library()? {
                player.attach_library(
                    active.root,
                    active.summary.library_id,
                    active.summary.root_instance_hash,
                    Some(active.database),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Basis");
}

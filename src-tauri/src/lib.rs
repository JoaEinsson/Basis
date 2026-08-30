#![forbid(unsafe_code)]
#![allow(linker_messages)] // MSVC localizes normal import-library output as a rustc warning.

mod app_state;
mod commands;
mod domain;
mod index;
mod library;
mod portable;

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
        ])
        .events(collect_events![commands::library::LibraryScanEvent]);

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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Basis");
}

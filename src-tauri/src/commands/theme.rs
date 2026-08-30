use std::collections::BTreeMap;

use specta::specta;
use tauri::State;

use crate::{
    app_state::{ActiveLibrary, AppState},
    domain::theme::{
        EditableTheme, ResolvedTheme, ThemeAppearance, ThemeCatalog, ThemeSelectionDto,
        ThemeSummary, ThemeTokenDescriptor, ThemeTokenValue,
    },
    theme_engine::{registry, service},
};

#[tauri::command]
#[specta]
pub fn themes_list(state: State<'_, AppState>) -> Result<ThemeCatalog, String> {
    let library = active_library(&state)?;
    service::theme_catalog(&library.root)
}

#[tauri::command]
#[specta]
pub fn theme_get_editable(state: State<'_, AppState>, id: String) -> Result<EditableTheme, String> {
    let library = active_library(&state)?;
    service::editable_theme(&library.root, &id)
}

#[tauri::command]
#[specta]
pub fn theme_resolve(
    state: State<'_, AppState>,
    id: String,
    artwork_key: Option<String>,
) -> Result<ResolvedTheme, String> {
    let library = active_library(&state)?;
    let accent = artwork_key
        .as_deref()
        .map(|key| crate::library::artwork::read_cached_accent(&library.artwork_cache_dir, key))
        .transpose()?
        .flatten();
    service::resolve_theme(&library.root, &id, accent.as_deref())
}

#[tauri::command]
#[specta]
pub fn theme_duplicate(
    state: State<'_, AppState>,
    source_id: String,
    name: String,
) -> Result<ThemeSummary, String> {
    let library = active_library(&state)?;
    service::duplicate_theme(&library.root, &source_id, &name)
}

#[tauri::command]
#[specta]
pub fn theme_save_edits(
    state: State<'_, AppState>,
    id: String,
    name: String,
    tokens: BTreeMap<String, ThemeTokenValue>,
) -> Result<ThemeSummary, String> {
    let library = active_library(&state)?;
    service::save_theme_edits(&library.root, &id, &name, tokens)
}

#[tauri::command]
#[specta]
pub fn theme_import(
    state: State<'_, AppState>,
    json: String,
    replace: bool,
) -> Result<ThemeSummary, String> {
    let library = active_library(&state)?;
    service::import_theme(&library.root, &json, replace)
}

#[tauri::command]
#[specta]
pub fn theme_export(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let library = active_library(&state)?;
    service::export_theme(&library.root, &id)
}

#[tauri::command]
#[specta]
pub fn theme_delete(state: State<'_, AppState>, id: String) -> Result<ThemeSelectionDto, String> {
    let library = active_library(&state)?;
    service::delete_theme(&library.root, &id)
}

#[tauri::command]
#[specta]
pub fn theme_selection(state: State<'_, AppState>) -> Result<ThemeSelectionDto, String> {
    let library = active_library(&state)?;
    service::theme_selection(&library.root)
}

#[tauri::command]
#[specta]
pub fn theme_set_selection(
    state: State<'_, AppState>,
    appearance: ThemeAppearance,
    id: String,
    follow_system_appearance: bool,
) -> Result<ThemeSelectionDto, String> {
    let library = active_library(&state)?;
    service::set_theme_selection(&library.root, appearance, &id, follow_system_appearance)
}

#[tauri::command]
#[specta]
pub fn theme_token_registry() -> Vec<ThemeTokenDescriptor> {
    registry::descriptors()
}

fn active_library(state: &State<'_, AppState>) -> Result<ActiveLibrary, String> {
    state
        .active_library()?
        .ok_or_else(|| "Choose a music folder before managing portable themes".to_owned())
}

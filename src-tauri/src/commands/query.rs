use specta::specta;
use tauri::State;
use uuid::Uuid;

use crate::{
    app_state::{ActiveLibrary, AppState},
    domain::metadata::comparison_key,
    domain::query::{
        built_in_views, parse_query, AlbumDetailDto, ArtistDetailDto, Expr, GlobalSearchResults,
        NamedSearchResult, QueryPage, QueryRequest, SearchRequest, ViewDefinition,
    },
    portable::views::{delete_view, duplicate_view, load_views, save_view, set_pinned_views},
};

#[tauri::command]
#[specta]
pub fn query_parse(input: String) -> Result<Expr, String> {
    parse_query(&input)
}

#[tauri::command]
#[specta]
pub async fn query_execute(
    state: State<'_, AppState>,
    request: QueryRequest,
) -> Result<QueryPage, String> {
    let library = active_library(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        library
            .database
            .execute_query(library.summary.library_id, request)
    })
    .await
    .map_err(|error| format!("Library query worker failed: {error}"))?
}

#[tauri::command]
#[specta]
pub async fn search_global(
    state: State<'_, AppState>,
    request: SearchRequest,
) -> Result<GlobalSearchResults, String> {
    let library = active_library(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let input = request.input.clone();
        let limit = usize::try_from(request.limit_per_section).unwrap_or(usize::MAX);
        let mut results = library
            .database
            .global_search(library.summary.library_id, request)?;
        let normalized_input = comparison_key(&input);
        if !normalized_input.is_empty() {
            results.views = load_views(&library.root)?
                .into_iter()
                .filter(|view| comparison_key(&view.name).contains(&normalized_input))
                .take(limit)
                .map(|view| NamedSearchResult {
                    id: view.id,
                    name: view.name,
                    kind: "view".to_owned(),
                })
                .collect();
        }
        Ok(results)
    })
    .await
    .map_err(|error| format!("Library search worker failed: {error}"))?
}

#[tauri::command]
#[specta]
pub fn views_list(state: State<'_, AppState>) -> Result<Vec<ViewDefinition>, String> {
    let views = match state.active_library()? {
        Some(library) => load_views(&library.root)?,
        None => built_in_views(),
    };
    for view in &views {
        view.validate()?;
    }
    Ok(views)
}

#[tauri::command]
#[specta]
pub fn views_save(
    state: State<'_, AppState>,
    view: ViewDefinition,
) -> Result<ViewDefinition, String> {
    let library = active_library(&state)?;
    save_view(&library.root, view)
}

#[tauri::command]
#[specta]
pub fn views_duplicate(
    state: State<'_, AppState>,
    source_id: String,
    name: String,
) -> Result<ViewDefinition, String> {
    let library = active_library(&state)?;
    duplicate_view(&library.root, &source_id, &name)
}

#[tauri::command]
#[specta]
pub fn views_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let library = active_library(&state)?;
    delete_view(&library.root, &id)
}

#[tauri::command]
#[specta]
pub fn views_set_pinned(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<Vec<String>, String> {
    let library = active_library(&state)?;
    set_pinned_views(&library.root, ids)
}

#[tauri::command]
#[specta]
pub async fn album_detail(
    state: State<'_, AppState>,
    album_key: Uuid,
) -> Result<Option<AlbumDetailDto>, String> {
    let library = active_library(&state)?;
    tauri::async_runtime::spawn_blocking(move || library.database.album_detail(album_key))
        .await
        .map_err(|error| format!("Album query worker failed: {error}"))?
}

#[tauri::command]
#[specta]
pub async fn artist_detail(
    state: State<'_, AppState>,
    artist_key: Uuid,
) -> Result<Option<ArtistDetailDto>, String> {
    let library = active_library(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        library
            .database
            .artist_detail(library.summary.library_id, artist_key)
    })
    .await
    .map_err(|error| format!("Artist query worker failed: {error}"))?
}

fn active_library(state: &State<'_, AppState>) -> Result<ActiveLibrary, String> {
    state
        .active_library()?
        .ok_or_else(|| "Choose a music folder before querying the library".to_owned())
}

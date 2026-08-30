use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use uuid::Uuid;

use crate::domain::query::{built_in_views, ViewDefinition};

use super::{
    manifest::MUSICLIB_DIRECTORY,
    workspace::{ensure_workspace, write_atomic_json, Workspace, WORKSPACE_FILE},
};

const MAX_VIEW_FILE_BYTES: u64 = 512 * 1024;
const MAX_PINNED_VIEWS: usize = 128;
const VIEW_ID_PREFIX: &str = "view:";

pub fn load_views(root: &Path) -> Result<Vec<ViewDefinition>, String> {
    let workspace = ensure_workspace(root)?;
    let pinned: HashSet<&str> = workspace.sidebar.iter().map(String::as_str).collect();
    let mut views = built_in_views();
    views.extend(load_custom_views(root)?);
    for view in &mut views {
        view.pin_to_sidebar = pinned.contains(view.id.as_str());
    }
    let order: HashMap<&str, usize> = workspace
        .sidebar
        .iter()
        .enumerate()
        .map(|(index, id)| (id.as_str(), index))
        .collect();
    views.sort_by_key(|view| {
        order
            .get(view.id.as_str())
            .copied()
            .map(|index| (0, index))
            .unwrap_or((1, usize::MAX))
    });
    Ok(views)
}

pub fn save_view(root: &Path, view: ViewDefinition) -> Result<ViewDefinition, String> {
    view.validate()?;
    custom_view_uuid(&view.id)?;
    let path = view_path(root, &view.id)?;
    write_atomic_json(&path, &view)?;
    update_pin_for_view(root, &view.id, view.pin_to_sidebar)?;
    Ok(view)
}

pub fn duplicate_view(
    root: &Path,
    source_id: &str,
    requested_name: &str,
) -> Result<ViewDefinition, String> {
    let name = requested_name.trim();
    if name.is_empty() || name.len() > 16 * 1024 {
        return Err("Duplicated View name is empty or exceeds the safety limit".to_owned());
    }
    let mut source = load_views(root)?
        .into_iter()
        .find(|view| view.id == source_id)
        .ok_or_else(|| format!("View {source_id} does not exist"))?;
    source.id = format!("{VIEW_ID_PREFIX}{}", Uuid::new_v4());
    source.name = name.to_owned();
    source.pin_to_sidebar = false;
    save_view(root, source)
}

pub fn delete_view(root: &Path, id: &str) -> Result<(), String> {
    let path = view_path(root, id)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not delete custom View {id}: {error}"))?;
    }
    update_pin_for_view(root, id, false)
}

pub fn set_pinned_views(root: &Path, ids: Vec<String>) -> Result<Vec<String>, String> {
    if ids.len() > MAX_PINNED_VIEWS {
        return Err(format!(
            "Primary navigation may contain at most {MAX_PINNED_VIEWS} Views"
        ));
    }
    let known: HashSet<String> = load_views(root)?.into_iter().map(|view| view.id).collect();
    let mut seen = HashSet::new();
    for id in &ids {
        if !known.contains(id) {
            return Err(format!("Cannot pin unknown View {id}"));
        }
        if !seen.insert(id.clone()) {
            return Err(format!("View {id} appears more than once"));
        }
    }

    let mut workspace = ensure_workspace(root)?;
    let unknown_references: Vec<String> = workspace
        .sidebar
        .iter()
        .filter(|id| !known.contains(*id))
        .cloned()
        .collect();
    workspace.sidebar = ids.clone();
    workspace.sidebar.extend(unknown_references);
    write_workspace(root, &workspace)?;
    Ok(ids)
}

fn load_custom_views(root: &Path) -> Result<Vec<ViewDefinition>, String> {
    let directory = root.join(MUSICLIB_DIRECTORY).join("views");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create {}: {error}", directory.display()))?;
    let mut paths = fs::read_dir(&directory)
        .map_err(|error| format!("Could not read {}: {error}", directory.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect::<Vec<_>>();
    paths.sort();

    let mut views = Vec::with_capacity(paths.len());
    for path in paths {
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("Could not inspect {}: {error}", path.display()))?;
        if metadata.len() > MAX_VIEW_FILE_BYTES {
            return Err(format!(
                "Custom View {} exceeds the safety limit",
                path.display()
            ));
        }
        let contents = fs::read_to_string(&path)
            .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
        let view: ViewDefinition = serde_json::from_str(&contents)
            .map_err(|error| format!("Custom View {} is invalid: {error}", path.display()))?;
        view.validate()?;
        let expected = custom_view_uuid(&view.id)?;
        if path.file_stem().and_then(|stem| stem.to_str()) != Some(&expected.to_string()) {
            return Err(format!(
                "Custom View filename does not match its ID: {}",
                path.display()
            ));
        }
        views.push(view);
    }
    Ok(views)
}

fn update_pin_for_view(root: &Path, id: &str, pinned: bool) -> Result<(), String> {
    let mut workspace = ensure_workspace(root)?;
    workspace.sidebar.retain(|candidate| candidate != id);
    if pinned {
        workspace.sidebar.push(id.to_owned());
    }
    write_workspace(root, &workspace)
}

fn write_workspace(root: &Path, workspace: &Workspace) -> Result<(), String> {
    workspace.validate()?;
    write_atomic_json(
        &root.join(MUSICLIB_DIRECTORY).join(WORKSPACE_FILE),
        workspace,
    )
}

fn view_path(root: &Path, id: &str) -> Result<std::path::PathBuf, String> {
    let id = custom_view_uuid(id)?;
    Ok(root
        .join(MUSICLIB_DIRECTORY)
        .join("views")
        .join(format!("{id}.json")))
}

fn custom_view_uuid(id: &str) -> Result<Uuid, String> {
    let raw = id
        .strip_prefix(VIEW_ID_PREFIX)
        .ok_or_else(|| "Built-in Views are immutable; duplicate one before editing".to_owned())?;
    Uuid::parse_str(raw).map_err(|_| "Custom View ID must be view:<uuid>".to_owned())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::{
        domain::query::built_in_views,
        portable::{manifest::ensure_layout, workspace::ensure_workspace},
    };

    use super::{delete_view, duplicate_view, load_views, save_view, set_pinned_views};

    #[test]
    fn custom_views_and_primary_navigation_roundtrip_without_mutating_builtins() {
        let root = std::env::temp_dir().join(format!("basis-views-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        ensure_layout(&root).unwrap();
        ensure_workspace(&root).unwrap();

        let original = built_in_views()
            .into_iter()
            .find(|view| view.id == "builtin:albums")
            .unwrap();
        let mut duplicate = duplicate_view(&root, &original.id, "Favorite albums").unwrap();
        duplicate.pin_to_sidebar = true;
        save_view(&root, duplicate.clone()).unwrap();
        set_pinned_views(
            &root,
            vec![duplicate.id.clone(), "builtin:artists".to_owned()],
        )
        .unwrap();

        let loaded = load_views(&root).unwrap();
        let loaded_original = loaded.iter().find(|view| view.id == original.id).unwrap();
        let loaded_duplicate = loaded.iter().find(|view| view.id == duplicate.id).unwrap();
        assert_eq!(loaded_original.name, "Albums");
        assert!(!loaded_original.pin_to_sidebar);
        assert!(loaded_duplicate.pin_to_sidebar);

        delete_view(&root, &duplicate.id).unwrap();
        assert!(!load_views(&root)
            .unwrap()
            .iter()
            .any(|view| view.id == duplicate.id));
        fs::remove_dir_all(root).unwrap();
    }
}

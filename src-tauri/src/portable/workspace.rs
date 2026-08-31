use std::{collections::BTreeMap, fs, io::Write, path::Path};

use super::manifest::MUSICLIB_DIRECTORY;
use serde::{de::DeserializeOwned, Deserialize, Serialize};

pub const WORKSPACE_FILE: &str = "workspace.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub schema_version: u32,
    pub default_view: String,
    pub theme: ThemeSelection,
    pub sidebar: Vec<String>,
    pub home_sections: Vec<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSelection {
    pub light_selection: String,
    pub dark_selection: String,
    pub follow_system_appearance: bool,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

impl Workspace {
    pub fn default_portable() -> Self {
        Self {
            schema_version: 1,
            default_view: "builtin:home".to_owned(),
            theme: ThemeSelection {
                light_selection: "builtin:paper".to_owned(),
                dark_selection: "builtin:nocturne".to_owned(),
                follow_system_appearance: false,
                extra: BTreeMap::new(),
            },
            sidebar: vec![
                "builtin:home".to_owned(),
                "builtin:albums".to_owned(),
                "builtin:artists".to_owned(),
                "builtin:tracks".to_owned(),
                "builtin:folders".to_owned(),
                "builtin:genres".to_owned(),
                "builtin:favorites".to_owned(),
            ],
            home_sections: vec![
                "builtin:recently-added".to_owned(),
                "builtin:recently-played".to_owned(),
                "builtin:favorites".to_owned(),
            ],
            extra: BTreeMap::new(),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err(format!(
                "workspace.json schema version {} is unsupported",
                self.schema_version
            ));
        }
        if self.default_view.len() > 16 * 1024 {
            return Err("workspace.json default_view exceeds the safety limit".to_owned());
        }
        Ok(())
    }
}

pub fn ensure_workspace(root: &Path) -> Result<Workspace, String> {
    let path = root.join(MUSICLIB_DIRECTORY).join(WORKSPACE_FILE);
    let workspace = if path.exists() {
        read_json(&path, "workspace.json")?
    } else {
        let workspace = Workspace::default_portable();
        write_atomic_json(&path, &workspace)?;
        workspace
    };
    workspace.validate()?;
    Ok(workspace)
}

pub fn write_atomic_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let mut serialized = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("Could not serialize portable data: {error}"))?;
    let _: serde_json::Value = serde_json::from_slice(&serialized)
        .map_err(|error| format!("Portable data failed validation: {error}"))?;
    serialized.push(b'\n');
    write_atomic_bytes(path, &serialized)
}

pub fn write_atomic_bytes(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Portable path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;

    let mut temporary = tempfile::Builder::new()
        .prefix(".basis-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| format!("Could not create temporary portable file: {error}"))?;
    let write_result = (|| -> Result<(), String> {
        temporary
            .write_all(contents)
            .map_err(|error| format!("Could not write temporary portable file: {error}"))?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|error| format!("Could not sync temporary portable file: {error}"))?;
        temporary.persist(path).map_err(|error| {
            format!(
                "Could not atomically replace portable file {}: {}",
                path.display(),
                error.error
            )
        })?;
        Ok(())
    })();
    write_result
}

fn read_json<T: DeserializeOwned>(path: &Path, name: &str) -> Result<T, String> {
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    if contents.len() > 512 * 1024 {
        return Err(format!("{name} exceeds the safety limit"));
    }
    serde_json::from_str(&contents).map_err(|error| format!("{name} is invalid JSON: {error}"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{ensure_workspace, write_atomic_json};
    use crate::portable::manifest::ensure_layout;

    #[test]
    fn manifest_workspace_roundtrip_and_atomic_write() {
        let temp = std::env::temp_dir().join(format!("basis-portable-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp).unwrap();

        let first_manifest = ensure_layout(&temp).unwrap();
        let workspace = ensure_workspace(&temp).unwrap();
        write_atomic_json(&temp.join(".musiclib/workspace.json"), &workspace).unwrap();
        let second_manifest = ensure_layout(&temp).unwrap();
        let second_workspace = ensure_workspace(&temp).unwrap();

        assert_eq!(first_manifest.library_id, second_manifest.library_id);
        assert_eq!(workspace.default_view, second_workspace.default_view);
        assert!(temp.join(".musiclib/views").is_dir());

        fs::remove_dir_all(temp).unwrap();
    }
}

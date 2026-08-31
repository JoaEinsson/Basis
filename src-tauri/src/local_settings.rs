use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::portable::workspace::write_atomic_json;

const SETTINGS_SCHEMA_VERSION: u32 = 1;
const SETTINGS_FILE_LIMIT: u64 = 256 * 1024;
const MAX_RECENT_ROOTS: usize = 10;

#[derive(Debug, Default, Deserialize, Serialize)]
struct LocalSettings {
    schema_version: u32,
    recent_roots: Vec<String>,
    #[serde(default)]
    device_id: Option<Uuid>,
}

pub fn device_id(app_data_dir: &Path) -> Result<Uuid, String> {
    let mut settings = read_settings(app_data_dir)?;
    if let Some(device_id) = settings.device_id {
        return Ok(device_id);
    }
    let device_id = Uuid::new_v4();
    settings.device_id = Some(device_id);
    write_atomic_json(&settings_path(app_data_dir), &settings)?;
    Ok(device_id)
}

pub fn remember_library_root(app_data_dir: &Path, root: &Path) -> Result<(), String> {
    let root = root
        .to_str()
        .ok_or_else(|| "Library root must be valid UTF-8".to_owned())?
        .to_owned();
    let mut settings = read_settings(app_data_dir)?;
    settings.recent_roots.retain(|candidate| candidate != &root);
    settings.recent_roots.insert(0, root);
    settings.recent_roots.truncate(MAX_RECENT_ROOTS);
    write_atomic_json(&settings_path(app_data_dir), &settings)
}

pub fn recent_library_roots(app_data_dir: &Path) -> Result<Vec<PathBuf>, String> {
    Ok(read_settings(app_data_dir)?
        .recent_roots
        .into_iter()
        .map(PathBuf::from)
        .collect())
}

fn read_settings(app_data_dir: &Path) -> Result<LocalSettings, String> {
    let path = settings_path(app_data_dir);
    if !path.exists() {
        return Ok(LocalSettings {
            schema_version: SETTINGS_SCHEMA_VERSION,
            recent_roots: Vec::new(),
            device_id: None,
        });
    }
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Could not inspect local settings: {error}"))?;
    if metadata.len() > SETTINGS_FILE_LIMIT {
        return Err("Local settings exceed the safety limit".to_owned());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read local settings: {error}"))?;
    let settings: LocalSettings = serde_json::from_str(&contents)
        .map_err(|error| format!("Local settings are invalid: {error}"))?;
    if settings.schema_version != SETTINGS_SCHEMA_VERSION {
        return Err(format!(
            "Local settings schema version {} is unsupported",
            settings.schema_version
        ));
    }
    if settings.recent_roots.len() > MAX_RECENT_ROOTS {
        return Err("Local settings contain too many recent roots".to_owned());
    }
    Ok(settings)
}

fn settings_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("basis").join("settings.json")
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{device_id, recent_library_roots, remember_library_root, MAX_RECENT_ROOTS};

    #[test]
    fn recent_roots_are_local_ordered_bounded_and_atomic() {
        let app_data =
            std::env::temp_dir().join(format!("basis-settings-{}", uuid::Uuid::new_v4()));
        for index in 0..(MAX_RECENT_ROOTS + 2) {
            remember_library_root(&app_data, &app_data.join(format!("library-{index}"))).unwrap();
        }
        let roots = recent_library_roots(&app_data).unwrap();
        assert_eq!(roots.len(), MAX_RECENT_ROOTS);
        assert!(roots[0].ends_with("library-11"));
        remember_library_root(&app_data, &app_data.join("library-5")).unwrap();
        assert!(recent_library_roots(&app_data).unwrap()[0].ends_with("library-5"));
        let first_device = device_id(&app_data).unwrap();
        assert_eq!(device_id(&app_data).unwrap(), first_device);
        fs::remove_dir_all(app_data).unwrap();
    }
}

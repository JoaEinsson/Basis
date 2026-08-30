use std::{collections::BTreeMap, fs, path::Path};

use serde::{Deserialize, Serialize};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use super::workspace::write_atomic_json;

pub const MUSICLIB_DIRECTORY: &str = ".musiclib";
pub const MANIFEST_FILE: &str = "manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub format: String,
    pub schema_version: u32,
    pub library_id: Uuid,
    pub created_at: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

impl Manifest {
    pub fn new() -> Result<Self, String> {
        let created_at = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .map_err(|error| format!("Could not format manifest timestamp: {error}"))?;
        Ok(Self {
            format: "musiclib".to_owned(),
            schema_version: 1,
            library_id: Uuid::new_v4(),
            created_at,
            extra: BTreeMap::new(),
        })
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.format != "musiclib" {
            return Err("manifest.json is not a Basis music library".to_owned());
        }
        if self.schema_version != 1 {
            return Err(format!(
                "manifest.json schema version {} is unsupported",
                self.schema_version
            ));
        }
        if self.created_at.len() > 16 * 1024 {
            return Err("manifest.json created_at exceeds the safety limit".to_owned());
        }
        Ok(())
    }
}

pub fn ensure_layout(root: &Path) -> Result<Manifest, String> {
    let musiclib = root.join(MUSICLIB_DIRECTORY);
    for directory in [
        "views",
        "playlists",
        "themes",
        "lyrics",
        "events",
        "overrides",
    ] {
        fs::create_dir_all(musiclib.join(directory))
            .map_err(|error| format!("Could not create .musiclib/{directory}: {error}"))?;
    }

    let manifest_path = musiclib.join(MANIFEST_FILE);
    let manifest = if manifest_path.exists() {
        read_manifest(&manifest_path)?
    } else {
        let manifest = Manifest::new()?;
        write_atomic_json(&manifest_path, &manifest)?;
        manifest
    };
    manifest.validate()?;
    Ok(manifest)
}

fn read_manifest(path: &Path) -> Result<Manifest, String> {
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    if contents.len() > 256 * 1024 {
        return Err("manifest.json exceeds the safety limit".to_owned());
    }
    let manifest = serde_json::from_str(&contents)
        .map_err(|error| format!("manifest.json is invalid JSON: {error}"))?;
    Ok(manifest)
}

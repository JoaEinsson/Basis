use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use specta::Type;
use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime};
use uuid::Uuid;

use crate::portable::workspace::write_atomic_json;

const SETTINGS_SCHEMA_VERSION: u32 = 1;
const SETTINGS_FILE_LIMIT: u64 = 256 * 1024;
const MAX_RECENT_ROOTS: usize = 10;
const DEVICE_SCHEMA_VERSION: u32 = 1;
const DEVICE_FILE_LIMIT: u64 = 4 * 1024;
const UPDATE_CHECK_INTERVAL: Duration = Duration::hours(24);

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePolicy {
    pub automatic_checks_enabled: bool,
    pub last_check_at: Option<String>,
    pub automatic_check_due: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckPermit {
    pub allowed: bool,
    pub policy: UpdatePolicy,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct LocalSettings {
    schema_version: u32,
    recent_roots: Vec<String>,
    #[serde(default)]
    device_id: Option<Uuid>,
    #[serde(default = "automatic_checks_default")]
    automatic_update_checks: bool,
    #[serde(default)]
    last_update_check: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct DeviceIdentity {
    schema_version: u32,
    device_id: Uuid,
}

pub fn device_id(app_data_dir: &Path) -> Result<Uuid, String> {
    let path = device_path(app_data_dir);
    if path.exists() {
        let device_id = read_device_identity(&path)?;
        let _ = mirror_device_id_to_settings(app_data_dir, device_id);
        return Ok(device_id);
    }

    let mut settings = read_settings(app_data_dir)?;
    let candidate = settings.device_id.unwrap_or_else(Uuid::new_v4);
    let parent = path
        .parent()
        .ok_or_else(|| "Local device identity path has no parent".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create local device directory: {error}"))?;
    let identity = DeviceIdentity {
        schema_version: DEVICE_SCHEMA_VERSION,
        device_id: candidate,
    };
    let serialized = serde_json::to_vec_pretty(&identity)
        .map_err(|error| format!("Could not serialize local device identity: {error}"))?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".basis-device-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| format!("Could not create local device identity: {error}"))?;
    temporary
        .write_all(&serialized)
        .and_then(|_| temporary.write_all(b"\n"))
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("Could not write local device identity: {error}"))?;
    let (device_id, created) = match temporary.persist_noclobber(&path) {
        Ok(_) => (candidate, true),
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            (read_device_identity(&path)?, false)
        }
        Err(error) => {
            return Err(format!(
                "Could not persist local device identity: {}",
                error.error
            ));
        }
    };
    if created && settings.device_id != Some(device_id) {
        settings.device_id = Some(device_id);
        write_atomic_json(&settings_path(app_data_dir), &settings)?;
    }
    Ok(device_id)
}

fn mirror_device_id_to_settings(app_data_dir: &Path, device_id: Uuid) -> Result<(), String> {
    let mut settings = read_settings(app_data_dir)?;
    if settings.device_id != Some(device_id) {
        settings.device_id = Some(device_id);
        write_atomic_json(&settings_path(app_data_dir), &settings)?;
    }
    Ok(())
}

fn read_device_identity(path: &Path) -> Result<Uuid, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Could not inspect local device identity: {error}"))?;
    if metadata.len() > DEVICE_FILE_LIMIT {
        return Err("Local device identity exceeds the safety limit".to_owned());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read local device identity: {error}"))?;
    let identity: DeviceIdentity = serde_json::from_str(&contents)
        .map_err(|error| format!("Local device identity is invalid: {error}"))?;
    if identity.schema_version != DEVICE_SCHEMA_VERSION {
        return Err(format!(
            "Local device identity schema version {} is unsupported",
            identity.schema_version
        ));
    }
    Ok(identity.device_id)
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

pub fn update_policy(app_data_dir: &Path) -> Result<UpdatePolicy, String> {
    policy_from_settings(&read_settings(app_data_dir)?, OffsetDateTime::now_utc())
}

pub fn set_automatic_update_checks(
    app_data_dir: &Path,
    enabled: bool,
) -> Result<UpdatePolicy, String> {
    let mut settings = read_settings(app_data_dir)?;
    settings.automatic_update_checks = enabled;
    write_atomic_json(&settings_path(app_data_dir), &settings)?;
    policy_from_settings(&settings, OffsetDateTime::now_utc())
}

pub fn begin_update_check(app_data_dir: &Path, manual: bool) -> Result<UpdateCheckPermit, String> {
    let mut settings = read_settings(app_data_dir)?;
    let now = OffsetDateTime::now_utc();
    let current = policy_from_settings(&settings, now)?;
    let allowed = manual || (current.automatic_checks_enabled && current.automatic_check_due);
    if allowed {
        settings.last_update_check = Some(
            now.format(&Rfc3339)
                .map_err(|error| format!("Could not format update check time: {error}"))?,
        );
        write_atomic_json(&settings_path(app_data_dir), &settings)?;
    }
    Ok(UpdateCheckPermit {
        allowed,
        policy: policy_from_settings(&settings, now)?,
    })
}

fn policy_from_settings(
    settings: &LocalSettings,
    now: OffsetDateTime,
) -> Result<UpdatePolicy, String> {
    let last = settings
        .last_update_check
        .as_deref()
        .map(|value| {
            OffsetDateTime::parse(value, &Rfc3339)
                .map_err(|error| format!("Local update check time is invalid: {error}"))
        })
        .transpose()?;
    let automatic_check_due = last
        .map(|last| now - last >= UPDATE_CHECK_INTERVAL)
        .unwrap_or(true);
    Ok(UpdatePolicy {
        automatic_checks_enabled: settings.automatic_update_checks,
        last_check_at: settings.last_update_check.clone(),
        automatic_check_due,
    })
}

const fn automatic_checks_default() -> bool {
    true
}

fn read_settings(app_data_dir: &Path) -> Result<LocalSettings, String> {
    let path = settings_path(app_data_dir);
    if !path.exists() {
        return Ok(LocalSettings {
            schema_version: SETTINGS_SCHEMA_VERSION,
            recent_roots: Vec::new(),
            device_id: None,
            automatic_update_checks: automatic_checks_default(),
            last_update_check: None,
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

fn device_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("basis").join("device.json")
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::{Arc, Barrier},
        thread,
    };

    use super::{
        begin_update_check, device_id, recent_library_roots, remember_library_root,
        set_automatic_update_checks, update_policy, MAX_RECENT_ROOTS,
    };

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

    #[test]
    fn concurrent_device_initialization_converges_on_one_atomic_identity() {
        let app_data =
            Arc::new(std::env::temp_dir().join(format!("basis-device-{}", uuid::Uuid::new_v4())));
        let workers = 8;
        let barrier = Arc::new(Barrier::new(workers));
        let handles = (0..workers)
            .map(|_| {
                let app_data = Arc::clone(&app_data);
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    device_id(&app_data).unwrap()
                })
            })
            .collect::<Vec<_>>();
        let identities = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect::<Vec<_>>();
        assert!(identities.iter().all(|identity| *identity == identities[0]));
        assert_eq!(device_id(&app_data).unwrap(), identities[0]);
        assert!(app_data.join("basis/device.json").is_file());
        fs::remove_dir_all(app_data.as_ref()).unwrap();
    }

    #[test]
    fn automatic_update_checks_are_local_bounded_and_manual_checks_bypass_the_interval() {
        let app_data = std::env::temp_dir().join(format!("basis-updater-{}", uuid::Uuid::new_v4()));
        let initial = update_policy(&app_data).unwrap();
        assert!(initial.automatic_checks_enabled);
        assert!(initial.automatic_check_due);

        let first = begin_update_check(&app_data, false).unwrap();
        assert!(first.allowed);
        assert!(!first.policy.automatic_check_due);
        assert!(!begin_update_check(&app_data, false).unwrap().allowed);
        assert!(begin_update_check(&app_data, true).unwrap().allowed);

        let disabled = set_automatic_update_checks(&app_data, false).unwrap();
        assert!(!disabled.automatic_checks_enabled);
        assert!(!begin_update_check(&app_data, false).unwrap().allowed);
        assert!(begin_update_check(&app_data, true).unwrap().allowed);
        fs::remove_dir_all(app_data).unwrap();
    }
}

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::Manager;

use crate::local_settings::{self, UpdateCheckPermit, UpdatePolicy};

#[derive(Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppHealth {
    app_name: &'static str,
    version: &'static str,
    status: &'static str,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LinuxDesktopIntegration {
    supported: bool,
    installed: bool,
    can_install: bool,
    path_conflict: bool,
    managed_executable_path: Option<String>,
    desktop_entry_path: Option<String>,
    icon_path: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn app_health() -> AppHealth {
    AppHealth {
        app_name: "Basis",
        version: env!("CARGO_PKG_VERSION"),
        status: "ready",
    }
}

#[tauri::command]
#[specta::specta]
pub fn updater_policy(app: tauri::AppHandle) -> Result<UpdatePolicy, String> {
    local_settings::update_policy(
        &app.path().app_data_dir().map_err(|error| {
            format!("Could not resolve local update settings directory: {error}")
        })?,
    )
}

#[tauri::command]
#[specta::specta]
pub fn updater_begin_check(
    app: tauri::AppHandle,
    manual: bool,
) -> Result<UpdateCheckPermit, String> {
    local_settings::begin_update_check(
        &app.path().app_data_dir().map_err(|error| {
            format!("Could not resolve local update settings directory: {error}")
        })?,
        manual,
    )
}

#[tauri::command]
#[specta::specta]
pub fn updater_set_automatic_checks(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<UpdatePolicy, String> {
    local_settings::set_automatic_update_checks(
        &app.path().app_data_dir().map_err(|error| {
            format!("Could not resolve local update settings directory: {error}")
        })?,
        enabled,
    )
}

#[tauri::command]
#[specta::specta]
pub fn linux_desktop_integration_status(
    app: tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    linux_desktop_integration_status_impl(&app)
}

#[tauri::command]
#[specta::specta]
pub fn linux_desktop_integration_install(
    app: tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    linux_desktop_integration_install_impl(&app)
}

#[tauri::command]
#[specta::specta]
pub fn linux_desktop_integration_remove(
    app: tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    linux_desktop_integration_remove_impl(&app)
}

#[cfg(target_os = "linux")]
#[derive(Debug)]
struct LinuxIntegrationPaths {
    executable: std::path::PathBuf,
    desktop_entry: std::path::PathBuf,
    icon: std::path::PathBuf,
}

#[cfg(target_os = "linux")]
fn linux_paths(app: &tauri::AppHandle) -> Result<LinuxIntegrationPaths, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|error| format!("Could not resolve the home folder: {error}"))?;
    let data_home = std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_absolute())
        .unwrap_or_else(|| home.join(".local/share"));
    Ok(LinuxIntegrationPaths {
        executable: home.join(".local/bin/Basis.AppImage"),
        desktop_entry: data_home.join("applications/basis.desktop"),
        icon: data_home.join("icons/hicolor/256x256/apps/basis.png"),
    })
}

#[cfg(target_os = "linux")]
fn linux_appimage_source() -> Option<std::path::PathBuf> {
    std::env::var_os("APPIMAGE")
        .map(std::path::PathBuf::from)
        .filter(|path| path.is_absolute() && path.is_file())
}

#[cfg(target_os = "linux")]
fn integration_dto(paths: &LinuxIntegrationPaths) -> LinuxDesktopIntegration {
    let source = linux_appimage_source();
    let managed = integration_is_managed(paths);
    let source_is_destination = source
        .as_ref()
        .is_some_and(|source| same_path(source, &paths.executable));
    let path_conflict = !managed
        && ((paths.executable.exists() && !source_is_destination)
            || paths.desktop_entry.exists()
            || paths.icon.exists());
    let source_available = source.is_some() || (managed && paths.executable.is_file());
    LinuxDesktopIntegration {
        supported: true,
        installed: managed
            && paths.executable.is_file()
            && paths.desktop_entry.is_file()
            && paths.icon.is_file(),
        can_install: source_available && !path_conflict,
        path_conflict,
        managed_executable_path: Some(paths.executable.to_string_lossy().into_owned()),
        desktop_entry_path: Some(paths.desktop_entry.to_string_lossy().into_owned()),
        icon_path: Some(paths.icon.to_string_lossy().into_owned()),
    }
}

#[cfg(target_os = "linux")]
fn linux_desktop_integration_status_impl(
    app: &tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    Ok(integration_dto(&linux_paths(app)?))
}

#[cfg(not(target_os = "linux"))]
fn linux_desktop_integration_status_impl(
    _app: &tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    Ok(unsupported_linux_integration())
}

#[cfg(target_os = "linux")]
fn linux_desktop_integration_install_impl(
    app: &tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    use std::os::unix::fs::PermissionsExt;

    let paths = linux_paths(app)?;
    let source = linux_appimage_source();
    let managed = integration_is_managed(&paths);
    let source_is_destination = source
        .as_ref()
        .is_some_and(|source| same_path(source, &paths.executable));
    if !managed
        && ((paths.executable.exists() && !source_is_destination)
            || paths.desktop_entry.exists()
            || paths.icon.exists())
    {
        return Err(
            "Desktop integration files already exist. Move or remove them before installing."
                .to_string(),
        );
    }
    if !paths.executable.is_file() && source.is_none() {
        return Err(
            "Desktop integration is available when Basis is running as an AppImage.".to_string(),
        );
    }
    // Write the ownership marker first so a partial, user-requested install can be retried.
    atomic_write(
        &paths.desktop_entry,
        desktop_entry(&paths.executable).as_bytes(),
    )?;
    if !paths.executable.is_file() {
        let source = source.as_ref().ok_or_else(|| {
            "Desktop integration is available when Basis is running as an AppImage.".to_string()
        })?;
        atomic_copy(source, &paths.executable)?;
    } else if let Some(source) = source
        .as_ref()
        .filter(|source| managed && !same_path(source, &paths.executable))
    {
        atomic_copy(source, &paths.executable)?;
    }
    std::fs::set_permissions(&paths.executable, std::fs::Permissions::from_mode(0o755))
        .map_err(|error| format!("Could not make Basis executable: {error}"))?;

    atomic_write(&paths.icon, include_bytes!("../../icons/128x128@2x.png"))?;
    Ok(integration_dto(&paths))
}

#[cfg(not(target_os = "linux"))]
fn linux_desktop_integration_install_impl(
    _app: &tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    Err("Desktop integration is only available on Linux.".to_string())
}

#[cfg(target_os = "linux")]
fn linux_desktop_integration_remove_impl(
    app: &tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    let paths = linux_paths(app)?;
    if !integration_is_managed(&paths) {
        return Err("No Basis-managed desktop integration was found.".to_string());
    }
    // Keep the ownership marker until last so an interrupted removal can be retried safely.
    for path in [&paths.executable, &paths.icon, &paths.desktop_entry] {
        if path.is_file() {
            std::fs::remove_file(path)
                .map_err(|error| format!("Could not remove {}: {error}", path.display()))?;
        }
    }
    Ok(integration_dto(&paths))
}

#[cfg(not(target_os = "linux"))]
fn linux_desktop_integration_remove_impl(
    _app: &tauri::AppHandle,
) -> Result<LinuxDesktopIntegration, String> {
    Err("Desktop integration is only available on Linux.".to_string())
}

#[cfg(not(target_os = "linux"))]
fn unsupported_linux_integration() -> LinuxDesktopIntegration {
    LinuxDesktopIntegration {
        supported: false,
        installed: false,
        can_install: false,
        path_conflict: false,
        managed_executable_path: None,
        desktop_entry_path: None,
        icon_path: None,
    }
}

#[cfg(target_os = "linux")]
fn atomic_copy(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Could not resolve the integration folder.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    let temporary = destination.with_extension(format!("tmp-{}", std::process::id()));
    let result = (|| {
        std::fs::copy(source, &temporary)
            .map_err(|error| format!("Could not install Basis.AppImage: {error}"))?;
        std::fs::rename(&temporary, destination)
            .map_err(|error| format!("Could not replace Basis.AppImage: {error}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(target_os = "linux")]
fn atomic_write(destination: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let parent = destination
        .parent()
        .ok_or_else(|| "Could not resolve the integration folder.".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    let temporary = destination.with_extension(format!("tmp-{}", std::process::id()));
    let result = (|| {
        let mut file = std::fs::File::create(&temporary)
            .map_err(|error| format!("Could not create {}: {error}", temporary.display()))?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Could not write {}: {error}", temporary.display()))?;
        std::fs::rename(&temporary, destination)
            .map_err(|error| format!("Could not replace {}: {error}", destination.display()))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(any(target_os = "linux", test))]
fn desktop_entry(executable: &std::path::Path) -> String {
    let exec = quote_desktop_exec(executable);
    let try_exec = escape_desktop_string(&executable.to_string_lossy());
    format!(
        "[Desktop Entry]\nType=Application\nName=Basis\nComment=Local-first music player\nExec={exec}\nTryExec={try_exec}\nIcon=basis\nTerminal=false\nCategories=AudioVideo;Audio;Player;\nStartupWMClass=Basis\nX-Basis-Managed=true\n"
    )
}

#[cfg(target_os = "linux")]
fn integration_is_managed(paths: &LinuxIntegrationPaths) -> bool {
    std::fs::read_to_string(&paths.desktop_entry)
        .is_ok_and(|entry| entry.lines().any(|line| line == "X-Basis-Managed=true"))
}

#[cfg(target_os = "linux")]
fn same_path(first: &std::path::Path, second: &std::path::Path) -> bool {
    match (first.canonicalize(), second.canonicalize()) {
        (Ok(first), Ok(second)) => first == second,
        _ => first == second,
    }
}

#[cfg(any(target_os = "linux", test))]
fn quote_desktop_exec(path: &std::path::Path) -> String {
    let quoted = path
        .to_string_lossy()
        .chars()
        .flat_map(|character| match character {
            '%' => vec!['%', '%'],
            '\\' | '"' | '`' | '$' => vec!['\\', character],
            _ => vec![character],
        })
        .collect::<String>();
    format!("\"{}\"", quoted.replace('\\', "\\\\"))
}

#[cfg(any(target_os = "linux", test))]
fn escape_desktop_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(' ', "\\s")
        .replace('\n', "\\n")
        .replace('\t', "\\t")
        .replace('\r', "\\r")
}

#[cfg(test)]
mod tests {
    use super::app_health;

    #[test]
    fn reports_the_basis_desktop_contract() {
        let health = app_health();

        assert_eq!(health.app_name, "Basis");
        assert_eq!(health.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(health.status, "ready");
    }

    #[test]
    fn desktop_entry_uses_a_stable_absolute_escaped_path() {
        let path = std::path::Path::new("/home/Basis User/.local/bin/Basis.AppImage");
        let entry = super::desktop_entry(path);

        assert!(entry.contains("Exec=\"/home/Basis User/.local/bin/Basis.AppImage\""));
        assert!(entry.contains("TryExec=/home/Basis\\sUser/.local/bin/Basis.AppImage"));
        assert!(!entry.contains(env!("CARGO_PKG_VERSION")));
        assert!(entry.contains("Icon=basis"));
    }
}

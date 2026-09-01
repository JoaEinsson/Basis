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
}

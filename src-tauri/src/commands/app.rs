use serde::{Deserialize, Serialize};
use specta::Type;

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

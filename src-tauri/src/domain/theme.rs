use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

pub const THEME_FORMAT: &str = "basis-theme";
pub const THEME_SCHEMA_VERSION: u32 = 1;
pub const PAPER_ID: &str = "builtin:paper";
pub const NOCTURNE_ID: &str = "builtin:nocturne";
pub const CHROMATIC_ID: &str = "builtin:chromatic";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThemeAppearance {
    Light,
    Dark,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ThemeDocument {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub format: String,
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub author: String,
    pub based_on: Option<String>,
    pub appearance: ThemeAppearance,
    #[serde(default)]
    pub min_app_version: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub tokens: BTreeMap<String, serde_json::Value>,
    #[serde(default)]
    pub behavior: ThemeBehavior,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ThemeBehavior {
    #[serde(default = "fixed_accent")]
    pub accent_source: String,
    #[serde(default = "warning_contrast")]
    pub contrast_policy: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

impl Default for ThemeBehavior {
    fn default() -> Self {
        Self {
            accent_source: fixed_accent(),
            contrast_policy: warning_contrast(),
            extra: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(untagged)]
pub enum ThemeTokenValue {
    Text(String),
    Number(f64),
    Boolean(bool),
}

impl ThemeTokenValue {
    pub fn as_json(&self) -> serde_json::Value {
        match self {
            Self::Text(value) => serde_json::Value::String(value.clone()),
            Self::Number(value) => serde_json::json!(value),
            Self::Boolean(value) => serde_json::Value::Bool(*value),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSummary {
    pub id: String,
    pub name: String,
    pub appearance: ThemeAppearance,
    pub based_on: Option<String>,
    pub built_in: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCatalog {
    pub themes: Vec<ThemeSummary>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTheme {
    pub id: String,
    pub name: String,
    pub appearance: ThemeAppearance,
    pub tokens: BTreeMap<String, ThemeTokenValue>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EditableTheme {
    pub id: String,
    pub name: String,
    pub appearance: ThemeAppearance,
    pub based_on: Option<String>,
    pub built_in: bool,
    pub tokens: BTreeMap<String, ThemeTokenValue>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSelectionDto {
    pub light_selection: String,
    pub dark_selection: String,
    pub follow_system_appearance: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeTokenDescriptor {
    pub id: String,
    pub label: String,
    pub category: String,
    pub kind: ThemeTokenKind,
    pub minimum: Option<f64>,
    pub maximum: Option<f64>,
    pub default_value: ThemeTokenValue,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ThemeTokenKind {
    Color,
    Number,
    Text,
    Boolean,
}

fn fixed_accent() -> String {
    "fixed".to_owned()
}

fn warning_contrast() -> String {
    "warn".to_owned()
}

use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use uuid::Uuid;

use crate::{
    domain::theme::{
        EditableTheme, ResolvedTheme, ThemeAppearance, ThemeCatalog, ThemeDocument,
        ThemeSelectionDto, ThemeSummary, ThemeTokenValue, CHROMATIC_ID, NOCTURNE_ID, PAPER_ID,
        THEME_FORMAT, THEME_SCHEMA_VERSION,
    },
    portable::{
        manifest::MUSICLIB_DIRECTORY,
        workspace::{ensure_workspace, write_atomic_json, WORKSPACE_FILE},
    },
};

use super::registry::{
    canonical_color, contrast_ratio, hard_defaults, is_registered, safe_on_accent,
    validate_and_canonicalize,
};

const MAX_THEME_BYTES: u64 = 512 * 1024;
const MAX_THEME_TOKENS: usize = 512;
const THEME_SCHEMA_URL: &str =
    "https://raw.githubusercontent.com/JoaEinsson/Basis/main/schemas/basis-theme.schema.v1.json";

pub fn theme_catalog(root: &Path) -> Result<ThemeCatalog, String> {
    let (custom, warnings) = load_custom_themes(root)?;
    let mut documents = built_in_themes()?;
    documents.extend(custom);
    Ok(ThemeCatalog {
        themes: documents.iter().map(theme_summary).collect(),
        warnings,
    })
}

pub fn editable_theme(root: &Path, id: &str) -> Result<EditableTheme, String> {
    let document = find_theme(root, id)?.ok_or_else(|| format!("Theme {id} does not exist"))?;
    let tokens = document
        .tokens
        .iter()
        .filter_map(|(id, value)| {
            validate_and_canonicalize(id, value)
                .ok()
                .flatten()
                .map(|value| (id.clone(), value))
        })
        .collect();
    Ok(EditableTheme {
        id: document.id.clone(),
        name: document.name,
        appearance: document.appearance,
        based_on: document.based_on,
        built_in: document.id.starts_with("builtin:"),
        tokens,
    })
}

pub fn resolve_theme(
    root: &Path,
    requested_id: &str,
    runtime_accent: Option<&str>,
) -> Result<ResolvedTheme, String> {
    let mut warnings = Vec::new();
    let requested = find_theme(root, requested_id)?;
    let selected = if let Some(theme) = requested {
        theme
    } else {
        warnings.push(format!(
            "Theme {requested_id} is unavailable; Basis applied Nocturne"
        ));
        builtin_theme(NOCTURNE_ID)?
    };
    let fallback_id = fallback_for_appearance(selected.appearance);
    let base = match selected.based_on.as_deref() {
        Some(base_id) => match builtin_theme(base_id) {
            Ok(base) => base,
            Err(_) => {
                warnings.push(format!(
                    "Base theme {base_id} is unavailable; Basis applied {fallback_id}"
                ));
                builtin_theme(fallback_id)?
            }
        },
        None if selected.id.starts_with("builtin:") => selected.clone(),
        None => {
            warnings.push(format!(
                "Theme {} has no built-in base; Basis applied {fallback_id}",
                selected.name
            ));
            builtin_theme(fallback_id)?
        }
    };

    let mut tokens = hard_defaults();
    apply_document_tokens(&base, &mut tokens, &mut warnings);
    if selected.id != base.id {
        apply_document_tokens(&selected, &mut tokens, &mut warnings);
    }

    if selected.behavior.accent_source == "artwork" {
        if let Some(accent) = runtime_accent {
            match canonical_color(accent) {
                Ok(accent) => {
                    tokens.insert(
                        "color.accent.primary".to_owned(),
                        ThemeTokenValue::Text(accent.clone()),
                    );
                    tokens.insert("color.focus.ring".to_owned(), ThemeTokenValue::Text(accent));
                }
                Err(error) => warnings.push(format!(
                    "Artwork accent was rejected; the fixed fallback remains: {error}"
                )),
            }
        }
    }
    apply_contrast_policy(&mut tokens, &mut warnings);

    Ok(ResolvedTheme {
        id: selected.id,
        name: selected.name,
        appearance: selected.appearance,
        tokens,
        warnings,
    })
}

pub fn duplicate_theme(root: &Path, source_id: &str, name: &str) -> Result<ThemeSummary, String> {
    let source =
        find_theme(root, source_id)?.ok_or_else(|| format!("Theme {source_id} does not exist"))?;
    let trimmed_name = validate_name(name)?;
    let based_on = ultimate_builtin_base(&source)?;
    let source_is_builtin = source.id.starts_with("builtin:");
    let mut duplicate = source;
    duplicate.id = Uuid::new_v4().to_string();
    duplicate.name = trimmed_name;
    duplicate.based_on = Some(based_on);
    if source_is_builtin {
        duplicate.tokens.clear();
    }
    write_custom_theme(root, &duplicate)?;
    Ok(theme_summary(&duplicate))
}

pub fn save_theme_edits(
    root: &Path,
    id: &str,
    name: &str,
    tokens: BTreeMap<String, ThemeTokenValue>,
) -> Result<ThemeSummary, String> {
    custom_theme_uuid(id)?;
    let mut document = find_theme(root, id)?.ok_or_else(|| format!("Theme {id} does not exist"))?;
    document.name = validate_name(name)?;
    document.tokens.retain(|key, _| !is_registered(key));
    for (key, value) in tokens {
        if !is_registered(&key) {
            return Err(format!("Theme editor cannot write unknown token {key}"));
        }
        document.tokens.insert(key, value.as_json());
    }
    write_custom_theme(root, &document)?;
    Ok(theme_summary(&document))
}

pub fn import_theme(root: &Path, json: &str, replace: bool) -> Result<ThemeSummary, String> {
    if json.len() > MAX_THEME_BYTES as usize {
        return Err("Imported theme exceeds the safety limit".to_owned());
    }
    let mut document: ThemeDocument =
        serde_json::from_str(json).map_err(|error| format!("Theme JSON is invalid: {error}"))?;
    migrate_theme(&mut document)?;
    if document.id.starts_with("builtin:") {
        return Err("Imported themes may not use a permanent built-in ID".to_owned());
    }
    if custom_theme_uuid(&document.id).is_err() {
        document.id = Uuid::new_v4().to_string();
    }
    if theme_path(root, &document.id)?.exists() && !replace {
        document.id = Uuid::new_v4().to_string();
    }
    validate_theme(&document, false)?;
    write_custom_theme(root, &document)?;
    Ok(theme_summary(&document))
}

pub fn export_theme(root: &Path, id: &str) -> Result<String, String> {
    let document = find_theme(root, id)?.ok_or_else(|| format!("Theme {id} does not exist"))?;
    serde_json::to_string_pretty(&document)
        .map(|json| format!("{json}\n"))
        .map_err(|error| format!("Could not export theme: {error}"))
}

pub fn delete_theme(root: &Path, id: &str) -> Result<ThemeSelectionDto, String> {
    let path = theme_path(root, id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("Could not delete theme {id}: {error}"))?;
    }
    let mut workspace = ensure_workspace(root)?;
    if workspace.theme.light_selection == id {
        workspace.theme.light_selection = PAPER_ID.to_owned();
    }
    if workspace.theme.dark_selection == id {
        workspace.theme.dark_selection = NOCTURNE_ID.to_owned();
    }
    write_workspace(root, &workspace)?;
    Ok(selection_dto(&workspace.theme))
}

pub fn theme_selection(root: &Path) -> Result<ThemeSelectionDto, String> {
    Ok(selection_dto(&ensure_workspace(root)?.theme))
}

pub fn set_theme_selection(
    root: &Path,
    appearance: ThemeAppearance,
    id: &str,
    follow_system_appearance: bool,
) -> Result<ThemeSelectionDto, String> {
    let theme = find_theme(root, id)?.ok_or_else(|| format!("Theme {id} does not exist"))?;
    if theme.appearance != appearance {
        return Err("Theme appearance does not match the selected light/dark slot".to_owned());
    }
    let mut workspace = ensure_workspace(root)?;
    match appearance {
        ThemeAppearance::Light => workspace.theme.light_selection = id.to_owned(),
        ThemeAppearance::Dark => workspace.theme.dark_selection = id.to_owned(),
    }
    workspace.theme.follow_system_appearance = follow_system_appearance;
    write_workspace(root, &workspace)?;
    Ok(selection_dto(&workspace.theme))
}

pub fn built_in_themes() -> Result<Vec<ThemeDocument>, String> {
    [
        include_str!("../../themes/paper.json"),
        include_str!("../../themes/nocturne.json"),
        include_str!("../../themes/chromatic.json"),
    ]
    .into_iter()
    .map(|source| {
        let document: ThemeDocument = serde_json::from_str(source)
            .map_err(|error| format!("Built-in theme is invalid JSON: {error}"))?;
        validate_theme(&document, true)?;
        Ok(document)
    })
    .collect()
}

pub fn validate_theme(document: &ThemeDocument, allow_builtin: bool) -> Result<(), String> {
    if document.format != THEME_FORMAT {
        return Err("Theme format must be basis-theme".to_owned());
    }
    if document.schema_version != THEME_SCHEMA_VERSION {
        return Err(format!(
            "Theme schema version {} is unsupported",
            document.schema_version
        ));
    }
    if document
        .schema
        .as_deref()
        .is_some_and(|schema| schema != THEME_SCHEMA_URL)
    {
        return Err("Theme $schema URL is not the Basis v1 schema".to_owned());
    }
    validate_name(&document.name)?;
    validate_metadata_text(&document.author, "Theme author")?;
    validate_metadata_text(&document.min_app_version, "Theme minimum app version")?;
    if document.capabilities.len() > 64 {
        return Err("Theme declares too many capabilities".to_owned());
    }
    for capability in &document.capabilities {
        if capability.is_empty()
            || capability.len() > 128
            || !capability
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        {
            return Err("Theme capability names contain unsupported characters".to_owned());
        }
    }
    if document.id.starts_with("builtin:") {
        if !allow_builtin || ![PAPER_ID, NOCTURNE_ID, CHROMATIC_ID].contains(&document.id.as_str())
        {
            return Err("Theme uses a reserved built-in ID".to_owned());
        }
    } else {
        custom_theme_uuid(&document.id)?;
        let base = document
            .based_on
            .as_deref()
            .ok_or_else(|| "Custom themes must inherit from a permanent built-in".to_owned())?;
        if ![PAPER_ID, NOCTURNE_ID, CHROMATIC_ID].contains(&base) {
            return Err("Custom themes may inherit only from permanent built-ins".to_owned());
        }
    }
    if document.tokens.len() > MAX_THEME_TOKENS {
        return Err("Theme contains too many tokens".to_owned());
    }
    if document.behavior.accent_source != "fixed" && document.behavior.accent_source != "artwork" {
        return Err("Theme accent_source must be fixed or artwork".to_owned());
    }
    if document.behavior.contrast_policy != "warn"
        && document.behavior.contrast_policy != "correct-critical"
    {
        return Err("Theme contrast_policy must be warn or correct-critical".to_owned());
    }
    for (id, value) in &document.tokens {
        validate_and_canonicalize(id, value)?;
    }
    validate_untrusted_json(&document.extra)?;
    validate_untrusted_json(&document.behavior.extra)?;
    Ok(())
}

fn find_theme(root: &Path, id: &str) -> Result<Option<ThemeDocument>, String> {
    if id.starts_with("builtin:") {
        return built_in_themes().map(|themes| themes.into_iter().find(|theme| theme.id == id));
    }
    let path = theme_path(root, id)?;
    if !path.exists() {
        return Ok(None);
    }
    read_custom_theme(&path).map(Some)
}

fn builtin_theme(id: &str) -> Result<ThemeDocument, String> {
    built_in_themes()?
        .into_iter()
        .find(|theme| theme.id == id)
        .ok_or_else(|| format!("Built-in theme {id} does not exist"))
}

fn load_custom_themes(root: &Path) -> Result<(Vec<ThemeDocument>, Vec<String>), String> {
    let directory = themes_directory(root);
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
    let mut documents = Vec::new();
    let mut warnings = Vec::new();
    let mut ids = HashSet::new();
    for path in paths {
        match read_custom_theme(&path) {
            Ok(document) if ids.insert(document.id.clone()) => documents.push(document),
            Ok(document) => {
                warnings.push(format!("Duplicate theme ID {} was ignored", document.id))
            }
            Err(error) => warnings.push(format!("{}: {error}", path.display())),
        }
    }
    Ok((documents, warnings))
}

fn read_custom_theme(path: &Path) -> Result<ThemeDocument, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Could not inspect theme file: {error}"))?;
    if metadata.len() > MAX_THEME_BYTES {
        return Err("Theme file exceeds the safety limit".to_owned());
    }
    let source =
        fs::read_to_string(path).map_err(|error| format!("Could not read theme file: {error}"))?;
    let mut document: ThemeDocument =
        serde_json::from_str(&source).map_err(|error| format!("Theme JSON is invalid: {error}"))?;
    migrate_theme(&mut document)?;
    validate_loaded_theme(&document)?;
    let expected = custom_theme_uuid(&document.id)?;
    if path.file_stem().and_then(|stem| stem.to_str()) != Some(&expected.to_string()) {
        return Err("Theme filename does not match its ID".to_owned());
    }
    Ok(document)
}

fn write_custom_theme(root: &Path, document: &ThemeDocument) -> Result<(), String> {
    validate_theme(document, false)?;
    let path = theme_path(root, &document.id)?;
    if path.exists() {
        let existing = fs::read_to_string(&path)
            .map_err(|error| format!("Could not inspect existing theme: {error}"))?;
        if serde_json::from_str::<ThemeDocument>(&existing)
            .map(|theme| theme.schema_version < THEME_SCHEMA_VERSION)
            .unwrap_or(false)
        {
            write_atomic_backup(&path, existing.as_bytes())?;
        }
    }
    write_atomic_json(&path, document)
}

fn migrate_theme(document: &mut ThemeDocument) -> Result<(), String> {
    match document.schema_version {
        THEME_SCHEMA_VERSION => Ok(()),
        0 => {
            document.schema_version = THEME_SCHEMA_VERSION;
            document.schema = Some(THEME_SCHEMA_URL.to_owned());
            for (old, new) in [
                ("color.canvas", "color.background.canvas"),
                ("radius.card", "shape.radius.surface"),
            ] {
                if let Some(value) = document.tokens.remove(old) {
                    document.tokens.entry(new.to_owned()).or_insert(value);
                }
            }
            Ok(())
        }
        version => Err(format!("Theme schema version {version} is unsupported")),
    }
}

fn apply_document_tokens(
    document: &ThemeDocument,
    resolved: &mut BTreeMap<String, ThemeTokenValue>,
    warnings: &mut Vec<String>,
) {
    for (id, value) in &document.tokens {
        match validate_and_canonicalize(id, value) {
            Ok(Some(value)) => {
                resolved.insert(id.clone(), value);
            }
            Ok(None) => {}
            Err(error) => warnings.push(format!("{error}; the safe inherited value remains")),
        }
    }
}

fn apply_contrast_policy(
    tokens: &mut BTreeMap<String, ThemeTokenValue>,
    warnings: &mut Vec<String>,
) {
    let accent = token_text(tokens, "color.accent.primary").unwrap_or("#49d9c7");
    let on_accent = token_text(tokens, "color.accent.onAccent").unwrap_or("#ffffff");
    if contrast_ratio(accent, on_accent).map_or(true, |ratio| ratio < 4.5) {
        let safe = safe_on_accent(accent);
        tokens.insert(
            "color.accent.onAccent".to_owned(),
            ThemeTokenValue::Text(safe),
        );
        warnings.push(
            "On-accent contrast was corrected at runtime; the source theme was not rewritten"
                .to_owned(),
        );
    }
    let canvas = token_text(tokens, "color.background.canvas").unwrap_or("#0c0d10");
    let primary = token_text(tokens, "color.text.primary").unwrap_or("#f4f5f7");
    if contrast_ratio(canvas, primary).is_some_and(|ratio| ratio < 4.5) {
        warnings.push(format!(
            "Primary text contrast is below AA ({:.2}:1)",
            contrast_ratio(canvas, primary).unwrap_or(0.0)
        ));
    }
    let focus = token_text(tokens, "color.focus.ring").unwrap_or("#a5f4e6");
    if contrast_ratio(canvas, focus).map_or(true, |ratio| ratio < 3.0) {
        tokens.insert(
            "color.focus.ring".to_owned(),
            ThemeTokenValue::Text(safe_on_accent(canvas)),
        );
        warnings.push(
            "Focus-ring contrast was corrected at runtime; the source theme was not rewritten"
                .to_owned(),
        );
    }
    let selection = token_text(tokens, "color.selection.background").unwrap_or("#123734");
    let selection_text = token_text(tokens, "color.selection.foreground").unwrap_or("#f4f5f7");
    if contrast_ratio(selection, selection_text).map_or(true, |ratio| ratio < 3.0) {
        tokens.insert(
            "color.selection.foreground".to_owned(),
            ThemeTokenValue::Text(safe_on_accent(selection)),
        );
        warnings.push(
            "Selection contrast was corrected at runtime; the source theme was not rewritten"
                .to_owned(),
        );
    }
}

fn ultimate_builtin_base(document: &ThemeDocument) -> Result<String, String> {
    if document.id.starts_with("builtin:") {
        return Ok(document.id.clone());
    }
    let base = document
        .based_on
        .clone()
        .unwrap_or_else(|| fallback_for_appearance(document.appearance).to_owned());
    if builtin_theme(&base).is_ok() {
        Ok(base)
    } else {
        Ok(fallback_for_appearance(document.appearance).to_owned())
    }
}

fn validate_loaded_theme(document: &ThemeDocument) -> Result<(), String> {
    if document.id.starts_with("builtin:") {
        return Err("Custom theme files cannot use reserved built-in IDs".to_owned());
    }

    let mut validation_copy = document.clone();
    if validation_copy
        .based_on
        .as_deref()
        .is_some_and(|base| base.starts_with("builtin:"))
    {
        validation_copy.based_on = Some(NOCTURNE_ID.to_owned());
    }
    validate_theme(&validation_copy, false)
}

fn validate_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 16 * 1024 {
        return Err("Theme name is empty or exceeds the safety limit".to_owned());
    }
    Ok(name.to_owned())
}

fn validate_metadata_text(value: &str, label: &str) -> Result<(), String> {
    let normalized = value.to_ascii_lowercase();
    if value.len() > 16 * 1024
        || normalized.contains("http://")
        || normalized.contains("https://")
        || normalized.contains("file://")
        || normalized.contains("javascript:")
        || normalized.contains("<script")
        || value.contains('\\')
    {
        return Err(format!("{label} contains remote, executable, or path data"));
    }
    Ok(())
}

fn validate_untrusted_json(values: &BTreeMap<String, serde_json::Value>) -> Result<(), String> {
    let source = serde_json::to_string(values)
        .map_err(|error| format!("Theme metadata is invalid: {error}"))?;
    let normalized = source.to_ascii_lowercase();
    if source.len() > 64 * 1024
        || normalized.contains("http://")
        || normalized.contains("https://")
        || normalized.contains("javascript:")
        || normalized.contains("file://")
        || normalized.contains("<script")
        || source.contains("\\\\")
    {
        return Err("Theme metadata contains remote or executable content".to_owned());
    }
    for value in values.values() {
        validate_metadata_json_value(value)?;
    }
    Ok(())
}

fn validate_metadata_json_value(value: &serde_json::Value) -> Result<(), String> {
    match value {
        serde_json::Value::String(value) => {
            validate_metadata_text(value, "Theme metadata")?;
            let bytes = value.as_bytes();
            if value.starts_with('/')
                || (bytes.len() > 2
                    && bytes[0].is_ascii_alphabetic()
                    && bytes[1] == b':'
                    && bytes[2] == b'/')
            {
                return Err("Theme metadata contains a filesystem path".to_owned());
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                validate_metadata_json_value(value)?;
            }
        }
        serde_json::Value::Object(values) => {
            for value in values.values() {
                validate_metadata_json_value(value)?;
            }
        }
        serde_json::Value::Null | serde_json::Value::Bool(_) | serde_json::Value::Number(_) => {}
    }
    Ok(())
}

fn write_atomic_backup(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let backup = path.with_extension("json.bak");
    let parent = backup
        .parent()
        .ok_or_else(|| "Theme backup has no parent folder".to_owned())?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".basis-theme-backup-")
        .tempfile_in(parent)
        .map_err(|error| format!("Could not create theme backup: {error}"))?;
    temporary
        .write_all(bytes)
        .map_err(|error| format!("Could not write theme backup: {error}"))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("Could not sync theme backup: {error}"))?;
    temporary
        .persist(&backup)
        .map_err(|error| format!("Could not persist theme backup: {}", error.error))?;
    Ok(())
}

fn theme_summary(document: &ThemeDocument) -> ThemeSummary {
    ThemeSummary {
        id: document.id.clone(),
        name: document.name.clone(),
        appearance: document.appearance,
        based_on: document.based_on.clone(),
        built_in: document.id.starts_with("builtin:"),
    }
}

fn selection_dto(selection: &crate::portable::workspace::ThemeSelection) -> ThemeSelectionDto {
    ThemeSelectionDto {
        light_selection: selection.light_selection.clone(),
        dark_selection: selection.dark_selection.clone(),
        follow_system_appearance: selection.follow_system_appearance,
    }
}

fn write_workspace(
    root: &Path,
    workspace: &crate::portable::workspace::Workspace,
) -> Result<(), String> {
    workspace.validate()?;
    write_atomic_json(
        &root.join(MUSICLIB_DIRECTORY).join(WORKSPACE_FILE),
        workspace,
    )
}

fn themes_directory(root: &Path) -> PathBuf {
    root.join(MUSICLIB_DIRECTORY).join("themes")
}

fn theme_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    Ok(themes_directory(root).join(format!("{}.json", custom_theme_uuid(id)?)))
}

fn custom_theme_uuid(id: &str) -> Result<Uuid, String> {
    Uuid::parse_str(id).map_err(|_| "Custom Theme ID must be a UUID".to_owned())
}

fn fallback_for_appearance(appearance: ThemeAppearance) -> &'static str {
    match appearance {
        ThemeAppearance::Light => PAPER_ID,
        ThemeAppearance::Dark => NOCTURNE_ID,
    }
}

fn token_text<'a>(tokens: &'a BTreeMap<String, ThemeTokenValue>, id: &str) -> Option<&'a str> {
    match tokens.get(id) {
        Some(ThemeTokenValue::Text(value)) => Some(value),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::{
        domain::theme::{ThemeAppearance, ThemeDocument, ThemeTokenValue, NOCTURNE_ID, PAPER_ID},
        portable::{manifest::ensure_layout, workspace::ensure_workspace},
    };

    use super::{
        built_in_themes, delete_theme, duplicate_theme, editable_theme, export_theme, import_theme,
        resolve_theme, save_theme_edits, set_theme_selection, theme_catalog, theme_selection,
        validate_theme,
    };

    fn root() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("basis-themes-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        ensure_layout(&root).unwrap();
        ensure_workspace(&root).unwrap();
        root
    }

    #[test]
    fn shipped_themes_and_schema_are_valid() {
        let schema: serde_json::Value =
            serde_json::from_str(include_str!("../../../schemas/basis-theme.schema.v1.json"))
                .unwrap();
        assert_eq!(schema["properties"]["format"]["const"], "basis-theme");
        let validator = jsonschema::JSONSchema::compile(&schema).unwrap();
        let themes = built_in_themes().unwrap();
        assert_eq!(themes.len(), 3);
        for theme in &themes {
            let document = serde_json::to_value(theme).unwrap();
            assert!(
                validator.is_valid(&document),
                "{} does not match the checked-in JSON Schema",
                theme.id
            );
            validate_theme(theme, true).unwrap();
        }
        let paper = themes.iter().find(|theme| theme.id == PAPER_ID).unwrap();
        for token in super::hard_defaults()
            .keys()
            .filter(|token| token.starts_with("color."))
        {
            assert!(
                paper.tokens.contains_key(token),
                "Paper must explicitly override the dark color default {token}"
            );
        }
    }

    #[test]
    fn old_schema_migration_preserves_unknown_data_and_creates_a_backup_before_write() {
        let root = root();
        let id = uuid::Uuid::new_v4().to_string();
        let path = super::theme_path(&root, &id).unwrap();
        let source = serde_json::json!({
            "format": "basis-theme", "schema_version": 0, "id": id,
            "name": "Legacy", "based_on": "builtin:nocturne", "appearance": "dark",
            "tokens": {"color.canvas": "#101010", "future.token": {"kept": true}},
            "behavior": {"accent_source": "fixed", "contrast_policy": "warn", "future_behavior": 9},
            "future_metadata": {"kept": "yes"}
        });
        super::write_atomic_json(&path, &source).unwrap();

        let editable = editable_theme(&root, &id).unwrap();
        save_theme_edits(&root, &id, &editable.name, editable.tokens).unwrap();

        let migrated: serde_json::Value =
            serde_json::from_str(&export_theme(&root, &id).unwrap()).unwrap();
        assert_eq!(migrated["schema_version"], 1);
        assert_eq!(migrated["tokens"]["color.background.canvas"], "#101010");
        assert_eq!(migrated["tokens"]["future.token"]["kept"], true);
        assert_eq!(migrated["behavior"]["future_behavior"], 9);
        assert_eq!(migrated["future_metadata"]["kept"], "yes");

        let backup: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(path.with_extension("json.bak")).unwrap())
                .unwrap();
        assert_eq!(backup["schema_version"], 0);
        assert_eq!(backup["future_metadata"]["kept"], "yes");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sparse_custom_roundtrip_preserves_unknown_future_data() {
        let root = root();
        let id = uuid::Uuid::new_v4().to_string();
        let source = serde_json::json!({
            "$schema": "https://raw.githubusercontent.com/JoaEinsson/Basis/main/schemas/basis-theme.schema.v1.json",
            "format": "basis-theme", "schema_version": 1, "id": id,
            "name": "Future", "author": "User", "based_on": "builtin:nocturne",
            "appearance": "dark", "tokens": {"color.accent.primary": "#ABCDEF", "future.sparkle": {"amount": 7}},
            "behavior": {"accent_source": "fixed", "contrast_policy": "warn", "future_behavior": true},
            "future_metadata": {"kept": true}
        }).to_string();
        let imported = import_theme(&root, &source, false).unwrap();
        let exported: serde_json::Value =
            serde_json::from_str(&export_theme(&root, &imported.id).unwrap()).unwrap();
        assert_eq!(exported["tokens"]["future.sparkle"]["amount"], 7);
        assert_eq!(exported["behavior"]["future_behavior"], true);
        assert_eq!(exported["future_metadata"]["kept"], true);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sparse_inheritance_bounds_missing_base_and_contrast_fall_back_safely() {
        let root = root();
        let id = uuid::Uuid::new_v4().to_string();
        let mut document: ThemeDocument = serde_json::from_value(serde_json::json!({
            "format": "basis-theme", "schema_version": 1, "id": id,
            "name": "Sparse", "based_on": "builtin:nocturne", "appearance": "dark",
            "tokens": {"color.accent.primary": "#ffffff", "color.accent.onAccent": "#ffffff"},
            "behavior": {"accent_source": "fixed", "contrast_policy": "warn"}
        }))
        .unwrap();
        super::write_custom_theme(&root, &document).unwrap();
        let resolved = resolve_theme(&root, &document.id, None).unwrap();
        assert!(resolved.tokens.contains_key("density.trackRowHeight"));
        assert_eq!(
            resolved.tokens["color.accent.onAccent"],
            ThemeTokenValue::Text("#000000".to_owned())
        );

        document.based_on = Some("builtin:missing".to_owned());
        super::write_atomic_json(&super::theme_path(&root, &document.id).unwrap(), &document)
            .unwrap();
        let resolved = resolve_theme(&root, &document.id, None).unwrap();
        assert!(resolved
            .warnings
            .iter()
            .any(|warning| warning.contains("Base theme")));

        document.based_on = Some(NOCTURNE_ID.to_owned());
        document
            .tokens
            .insert("density.scale".to_owned(), serde_json::json!(9));
        let mut resolved_tokens = super::hard_defaults();
        let mut warnings = Vec::new();
        super::apply_document_tokens(&document, &mut resolved_tokens, &mut warnings);
        assert_eq!(
            resolved_tokens["density.scale"],
            ThemeTokenValue::Number(1.0)
        );
        assert!(!warnings.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicate_edit_selection_delete_and_collision_rules_hold() {
        let root = root();
        let duplicate = duplicate_theme(&root, NOCTURNE_ID, "Studio").unwrap();
        let mut editable = editable_theme(&root, &duplicate.id).unwrap();
        editable.tokens.insert(
            "shape.radius.surface".to_owned(),
            ThemeTokenValue::Number(30.0),
        );
        save_theme_edits(&root, &duplicate.id, "Studio Wide", editable.tokens).unwrap();
        set_theme_selection(&root, ThemeAppearance::Dark, &duplicate.id, true).unwrap();
        assert_eq!(theme_selection(&root).unwrap().dark_selection, duplicate.id);
        let exported = export_theme(&root, &duplicate.id).unwrap();
        let collision = import_theme(&root, &exported, false).unwrap();
        assert_ne!(collision.id, duplicate.id);
        let selection = delete_theme(&root, &duplicate.id).unwrap();
        assert_eq!(selection.dark_selection, NOCTURNE_ID);
        assert!(theme_catalog(&root).unwrap().themes.len() >= 4);
        fs::remove_dir_all(root).unwrap();
    }
}

use std::path::{Component, Path, PathBuf};

use unicode_normalization::UnicodeNormalization;

pub fn normalize_relative_path(candidate: &str) -> Result<String, String> {
    if candidate.is_empty() {
        return Err("Portable paths must not be empty".to_owned());
    }
    if candidate.contains('\0') {
        return Err("Portable paths must not contain NUL bytes".to_owned());
    }
    if candidate.starts_with('/') || candidate.starts_with('\\') || has_drive_prefix(candidate) {
        return Err("Portable paths must be relative".to_owned());
    }

    let mut segments = Vec::new();
    for segment in candidate.split(['/', '\\']) {
        match segment {
            "" | "." => continue,
            ".." => return Err("Portable paths must not escape the library root".to_owned()),
            value => segments.push(value.nfc().collect::<String>()),
        }
    }

    if segments.is_empty() {
        return Err("Portable paths must contain at least one component".to_owned());
    }

    Ok(segments.join("/"))
}

pub fn normalize_from_absolute(root: &Path, candidate: &Path) -> Result<String, String> {
    let relative = candidate
        .strip_prefix(root)
        .map_err(|_| "Path is outside the selected library root".to_owned())?;
    let text = relative
        .to_str()
        .ok_or_else(|| "Portable paths must be valid UTF-8".to_owned())?;

    normalize_relative_path(text)
}

pub fn resolve_inside_root(root: &Path, portable_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_path(portable_path)?;
    reject_nonportable_path(Path::new(&normalized))?;
    let mut candidate = root.to_path_buf();
    for segment in normalized.split('/') {
        candidate.push(segment);
    }

    let root = root
        .canonicalize()
        .map_err(|error| format!("Could not canonicalize library root: {error}"))?;
    let resolved = candidate
        .canonicalize()
        .map_err(|error| format!("Could not canonicalize library path: {error}"))?;
    if !resolved.starts_with(&root) {
        return Err("Resolved path escapes the selected library root".to_owned());
    }

    Ok(resolved)
}

pub fn reject_nonportable_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("Path must not be empty".to_owned());
    }
    if path.to_str().is_none() {
        return Err("Path must be valid UTF-8".to_owned());
    }
    let text = path
        .to_str()
        .ok_or_else(|| "Path must be valid UTF-8".to_owned())?;
    if text.starts_with('/')
        || text.starts_with('\\')
        || has_drive_prefix(text)
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err("Path must be a portable relative path".to_owned());
    }
    Ok(())
}

fn has_drive_prefix(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

#[cfg(test)]
mod tests {
    use super::{normalize_relative_path, reject_nonportable_path};
    use std::path::Path;

    #[test]
    fn normalizes_windows_linux_and_unicode_paths() {
        assert_eq!(
            normalize_relative_path("Albums\\Cafe\u{301}/01 - Song.flac").unwrap(),
            "Albums/Caf\u{e9}/01 - Song.flac"
        );
        assert_eq!(
            normalize_relative_path("Albums//Artist/./Song.mp3").unwrap(),
            "Albums/Artist/Song.mp3"
        );
    }

    #[test]
    fn rejects_nonportable_references() {
        for value in [
            "",
            "/music/song.mp3",
            "\\\\server\\share\\song.mp3",
            "C:\\music\\song.mp3",
            "../song.mp3",
            "album/../../song.mp3",
            "song\0.mp3",
        ] {
            assert!(normalize_relative_path(value).is_err(), "{value:?}");
        }

        assert!(reject_nonportable_path(Path::new("../song.mp3")).is_err());
    }
}

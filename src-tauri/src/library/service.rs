use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use blake3::Hash;

use crate::{
    app_state::ActiveLibrary,
    domain::track::{LibraryStatus, LibrarySummary, ScanProgress},
    index::db::IndexDatabase,
    portable::{manifest::ensure_layout, paths::resolve_inside_root, workspace::ensure_workspace},
};

pub fn open_library(
    root: PathBuf,
    app_data_dir: &Path,
    app_cache_dir: &Path,
) -> Result<ActiveLibrary, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Could not access selected library folder: {error}"))?;
    if !canonical_root.is_dir() {
        return Err("The selected library root must be a folder".to_owned());
    }
    ensure_utf8_path(&canonical_root)?;
    probe_writable_root(&canonical_root)?;

    let manifest = ensure_layout(&canonical_root)?;
    ensure_workspace(&canonical_root)?;
    let manifest_path = resolve_inside_root(&canonical_root, ".musiclib/manifest.json")?;
    if !manifest_path.is_file() {
        return Err("Basis could not create the portable library manifest".to_owned());
    }
    let root_instance_hash = root_instance_hash(&canonical_root)?;
    let database_path = app_data_dir
        .join("basis")
        .join("libraries")
        .join(manifest.library_id.to_string())
        .join(&root_instance_hash)
        .join("index.sqlite3");
    let database = IndexDatabase::open(database_path)?;
    let artwork_cache_dir = app_cache_dir.join("basis").join("artwork");
    let track_count = database.track_count()?;
    let root_path = canonical_root
        .to_str()
        .ok_or_else(|| "Selected library path must be valid UTF-8".to_owned())?
        .to_owned();

    Ok(ActiveLibrary {
        root: canonical_root,
        database,
        artwork_cache_dir,
        summary: LibrarySummary {
            library_id: manifest.library_id,
            root_instance_hash,
            root_path,
            track_count,
            status: LibraryStatus::Ready,
        },
        progress: ScanProgress {
            complete: true,
            ..ScanProgress::default()
        },
    })
}

pub fn root_instance_hash(root: &Path) -> Result<String, String> {
    let root = root
        .to_str()
        .ok_or_else(|| "Library root must be valid UTF-8".to_owned())?;
    Ok(hash(root).to_hex().to_string())
}

pub fn probe_writable_root(root: &Path) -> Result<(), String> {
    let probe_path = root.join(format!(".basis-write-probe-{}", uuid::Uuid::new_v4()));
    let result = (|| -> Result<(), String> {
        let mut probe = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe_path)
            .map_err(|error| format!("The selected library folder is not writable: {error}"))?;
        probe
            .write_all(b"Basis writable root probe\n")
            .map_err(|error| format!("Could not write to the selected library folder: {error}"))?;
        probe
            .sync_all()
            .map_err(|error| format!("Could not sync the selected library folder: {error}"))?;
        Ok(())
    })();
    if probe_path.exists() {
        fs::remove_file(&probe_path)
            .map_err(|error| format!("Could not remove Basis write probe: {error}"))?;
    }
    result
}

fn ensure_utf8_path(path: &Path) -> Result<(), String> {
    if path.to_str().is_none() {
        return Err("Selected library path must be valid UTF-8".to_owned());
    }
    Ok(())
}

fn hash(value: &str) -> Hash {
    blake3::hash(value.as_bytes())
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use crate::{
        library::scanner::scan_library, portable::manifest::ensure_layout,
        portable::workspace::ensure_workspace,
    };

    use super::open_library;

    #[test]
    fn copied_roots_with_one_library_id_get_distinct_local_indexes() {
        let base = std::env::temp_dir().join(format!("basis-copy-{}", uuid::Uuid::new_v4()));
        let original = base.join("original");
        let copy = base.join("copy");
        let app_data = base.join("app-data");
        fs::create_dir_all(&original).unwrap();
        fs::create_dir_all(&copy).unwrap();
        let manifest = ensure_layout(&original).unwrap();
        ensure_workspace(&original).unwrap();
        fs::create_dir_all(copy.join(".musiclib")).unwrap();
        fs::copy(
            original.join(".musiclib/manifest.json"),
            copy.join(".musiclib/manifest.json"),
        )
        .unwrap();
        ensure_workspace(&copy).unwrap();

        let cache = base.join("cache");
        let original_library = open_library(original, &app_data, &cache).unwrap();
        let copied_library = open_library(copy, &app_data, &cache).unwrap();

        assert_eq!(original_library.summary.library_id, manifest.library_id);
        assert_eq!(
            original_library.summary.library_id,
            copied_library.summary.library_id
        );
        assert_ne!(
            original_library.summary.root_instance_hash,
            copied_library.summary.root_instance_hash
        );
        assert_ne!(
            original_library.database.path(),
            copied_library.database.path()
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn deleting_only_the_local_database_rebuilds_the_fixture_index() {
        let base = std::env::temp_dir().join(format!("basis-rebuild-{}", uuid::Uuid::new_v4()));
        let root = base.join("library");
        let app_data = base.join("app-data");
        let cache = base.join("cache");
        copy_directory(
            &Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("fixtures/library-a"),
            &root,
        );

        let first = open_library(root.clone(), &app_data, &cache).unwrap();
        let first_library_id = first.summary.library_id;
        let database_path = first.database.path().to_path_buf();
        scan_library(
            &first.root,
            first_library_id,
            &first.database,
            &first.artwork_cache_dir,
            |_| {},
        )
        .unwrap();
        assert_eq!(first.database.track_count().unwrap(), 4);
        drop(first);
        fs::remove_file(&database_path).unwrap();

        let rebuilt = open_library(root, &app_data, &cache).unwrap();
        assert_eq!(rebuilt.summary.library_id, first_library_id);
        assert_eq!(rebuilt.database.track_count().unwrap(), 0);
        scan_library(
            &rebuilt.root,
            rebuilt.summary.library_id,
            &rebuilt.database,
            &rebuilt.artwork_cache_dir,
            |_| {},
        )
        .unwrap();
        assert_eq!(rebuilt.database.track_count().unwrap(), 4);
        assert!(rebuilt.root.join(".musiclib/manifest.json").is_file());
        fs::remove_dir_all(base).unwrap();
    }

    fn copy_directory(source: &Path, destination: &Path) {
        fs::create_dir_all(destination).unwrap();
        for entry in fs::read_dir(source).unwrap() {
            let entry = entry.unwrap();
            let target = destination.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() {
                copy_directory(&entry.path(), &target);
            } else {
                fs::copy(entry.path(), target).unwrap();
            }
        }
    }
}

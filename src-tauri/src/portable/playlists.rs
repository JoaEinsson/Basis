use std::{fs, path::Path};

use uuid::Uuid;

use crate::domain::playlist::{Playlist, PlaylistCatalog, PlaylistDraft};

use super::{manifest::MUSICLIB_DIRECTORY, workspace::write_atomic_json};

const MAX_PLAYLIST_FILE_BYTES: u64 = 8 * 1024 * 1024;

pub fn load_playlists(root: &Path) -> Result<PlaylistCatalog, String> {
    let directory = playlist_directory(root);
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

    let mut playlists = Vec::new();
    let mut warnings = Vec::new();
    for path in paths {
        let relative = format!(
            ".musiclib/playlists/{}",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("<invalid filename>")
        );
        let result = (|| -> Result<Playlist, String> {
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("Could not inspect {relative}: {error}"))?;
            if metadata.len() > MAX_PLAYLIST_FILE_BYTES {
                return Err(format!("{relative} exceeds the safety limit"));
            }
            let contents = fs::read_to_string(&path)
                .map_err(|error| format!("Could not read {relative}: {error}"))?;
            let mut playlist: Playlist = serde_json::from_str(&contents)
                .map_err(|error| format!("{relative} is invalid: {error}"))?;
            playlist.normalize_and_validate()?;
            let expected = playlist.id().to_string();
            if path.file_stem().and_then(|stem| stem.to_str()) != Some(expected.as_str()) {
                return Err(format!("{relative} filename does not match its ID"));
            }
            Ok(playlist)
        })();
        match result {
            Ok(playlist) => playlists.push(playlist),
            Err(error) => warnings.push(error),
        }
    }
    playlists.sort_by(|left, right| {
        left.name()
            .to_lowercase()
            .cmp(&right.name().to_lowercase())
            .then_with(|| left.id().cmp(&right.id()))
    });
    Ok(PlaylistCatalog {
        playlists,
        warnings,
    })
}

pub fn create_playlist(root: &Path, draft: PlaylistDraft) -> Result<Playlist, String> {
    let mut playlist = Playlist::from_draft(Uuid::new_v4(), draft);
    playlist.normalize_and_validate()?;
    save_playlist(root, playlist)
}

pub fn save_playlist(root: &Path, mut playlist: Playlist) -> Result<Playlist, String> {
    playlist.normalize_and_validate()?;
    write_atomic_json(&playlist_path(root, playlist.id()), &playlist)?;
    Ok(playlist)
}

pub fn delete_playlist(root: &Path, id: Uuid) -> Result<(), String> {
    let path = playlist_path(root, id);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not delete playlist {id}: {error}"))?;
    }
    Ok(())
}

pub fn find_playlist(root: &Path, id: Uuid) -> Result<Playlist, String> {
    let catalog = load_playlists(root)?;
    catalog
        .playlists
        .into_iter()
        .find(|playlist| playlist.id() == id)
        .ok_or_else(|| format!("Playlist {id} does not exist or is unavailable"))
}

fn playlist_directory(root: &Path) -> std::path::PathBuf {
    root.join(MUSICLIB_DIRECTORY).join("playlists")
}

fn playlist_path(root: &Path, id: Uuid) -> std::path::PathBuf {
    playlist_directory(root).join(format!("{id}.json"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::{
        domain::{
            playlist::{Playlist, PlaylistDraft, StaticPlaylistItem, TrackHint},
            query::{Expr, QueryField, QueryOperator, QuerySort, QueryValue, SortDirection},
        },
        portable::manifest::ensure_layout,
    };

    use super::{create_playlist, delete_playlist, load_playlists, save_playlist};

    #[test]
    fn static_and_smart_playlists_roundtrip_with_only_portable_paths() {
        let root = std::env::temp_dir().join(format!("basis-playlists-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        ensure_layout(&root).unwrap();

        let static_playlist = create_playlist(
            &root,
            PlaylistDraft::Static {
                name: "Night Driving".to_owned(),
                items: vec![StaticPlaylistItem {
                    path: "Artist\\Album\\01 - Song.m4a".to_owned(),
                    hint: hint(),
                }],
            },
        )
        .unwrap();
        let smart_playlist = create_playlist(
            &root,
            PlaylistDraft::Smart {
                name: "Favorites".to_owned(),
                query: Expr::Predicate {
                    field: QueryField::Favorite,
                    op: QueryOperator::Eq,
                    value: QueryValue::Boolean(true),
                },
                sort: vec![QuerySort {
                    field: QueryField::LastPlayed,
                    direction: SortDirection::Desc,
                }],
            },
        )
        .unwrap();

        let catalog = load_playlists(&root).unwrap();
        assert!(catalog.warnings.is_empty());
        assert_eq!(catalog.playlists.len(), 2);
        let loaded = catalog
            .playlists
            .iter()
            .find(|playlist| playlist.id() == static_playlist.id())
            .unwrap();
        let Playlist::Static { items, .. } = loaded else {
            panic!("expected static playlist")
        };
        assert_eq!(items[0].path, "Artist/Album/01 - Song.m4a");
        let source = fs::read_to_string(
            root.join(format!(".musiclib/playlists/{}.json", static_playlist.id())),
        )
        .unwrap();
        assert!(!source.contains(":\\"));
        assert!(matches!(smart_playlist, Playlist::Smart { .. }));

        let mut renamed = static_playlist.clone();
        if let Playlist::Static { name, .. } = &mut renamed {
            *name = "After Midnight".to_owned();
        }
        save_playlist(&root, renamed).unwrap();
        delete_playlist(&root, smart_playlist.id()).unwrap();
        assert_eq!(load_playlists(&root).unwrap().playlists.len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_item_is_left_untouched_and_reported_by_relative_path() {
        let root = std::env::temp_dir().join(format!("basis-playlists-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        ensure_layout(&root).unwrap();
        let id = uuid::Uuid::new_v4();
        let path = root.join(format!(".musiclib/playlists/{id}.json"));
        fs::write(&path, "{ definitely not json }").unwrap();
        let catalog = load_playlists(&root).unwrap();
        assert!(catalog.playlists.is_empty());
        assert!(catalog.warnings[0].contains(&format!("{id}.json")));
        assert_eq!(fs::read_to_string(path).unwrap(), "{ definitely not json }");
        fs::remove_dir_all(root).unwrap();
    }

    fn hint() -> TrackHint {
        TrackHint {
            title: Some("Song".to_owned()),
            artist: Some("Artist".to_owned()),
            album: Some("Album".to_owned()),
            duration_ms: Some(200_000.0),
            disc_no: Some(1),
            track_no: Some(1),
        }
    }
}

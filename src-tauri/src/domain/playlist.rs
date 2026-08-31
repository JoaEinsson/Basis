use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::portable::paths::normalize_relative_path;

use super::query::{validate_expr, Expr, QuerySort, TrackDto};

pub const PLAYLIST_SCHEMA_VERSION: u32 = 1;
const MAX_PLAYLIST_ITEMS: usize = 50_000;
const MAX_PLAYLIST_NAME_BYTES: usize = 16 * 1024;
const MAX_HINT_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
pub struct TrackHint {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: Option<f64>,
    pub disc_no: Option<u32>,
    pub track_no: Option<u32>,
}

impl TrackHint {
    pub fn from_track(track: &TrackDto) -> Self {
        Self {
            title: track.title.clone(),
            artist: track.artist.clone(),
            album: track.album.clone(),
            duration_ms: track.duration_ms,
            disc_no: track.disc_no,
            track_no: track.track_no,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        for (field, value) in [
            ("title", self.title.as_deref()),
            ("artist", self.artist.as_deref()),
            ("album", self.album.as_deref()),
        ] {
            if value.is_some_and(|value| value.len() > MAX_HINT_BYTES) {
                return Err(format!("Playlist {field} hint exceeds the safety limit"));
            }
        }
        if self
            .duration_ms
            .is_some_and(|duration| !duration.is_finite() || duration < 0.0)
        {
            return Err("Playlist duration hint must be finite and non-negative".to_owned());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
pub struct StaticPlaylistItem {
    pub path: String,
    pub hint: TrackHint,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Playlist {
    Static {
        schema_version: u32,
        id: Uuid,
        name: String,
        items: Vec<StaticPlaylistItem>,
    },
    Smart {
        schema_version: u32,
        id: Uuid,
        name: String,
        query: Expr,
        sort: Vec<QuerySort>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlaylistDraft {
    Static {
        name: String,
        items: Vec<StaticPlaylistItem>,
    },
    Smart {
        name: String,
        query: Expr,
        sort: Vec<QuerySort>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
pub struct PlaylistCatalog {
    pub playlists: Vec<Playlist>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
pub struct ResolvedPlaylistItem {
    pub item: StaticPlaylistItem,
    pub track: Option<TrackDto>,
    pub suggested_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
pub struct ResolvedPlaylist {
    pub playlist: Playlist,
    pub items: Vec<ResolvedPlaylistItem>,
}

impl Playlist {
    pub fn from_draft(id: Uuid, draft: PlaylistDraft) -> Self {
        match draft {
            PlaylistDraft::Static { name, items } => Self::Static {
                schema_version: PLAYLIST_SCHEMA_VERSION,
                id,
                name,
                items,
            },
            PlaylistDraft::Smart { name, query, sort } => Self::Smart {
                schema_version: PLAYLIST_SCHEMA_VERSION,
                id,
                name,
                query,
                sort,
            },
        }
    }

    pub fn id(&self) -> Uuid {
        match self {
            Self::Static { id, .. } | Self::Smart { id, .. } => *id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            Self::Static { name, .. } | Self::Smart { name, .. } => name,
        }
    }

    pub fn normalize_and_validate(&mut self) -> Result<(), String> {
        let (schema_version, name) = match self {
            Self::Static {
                schema_version,
                name,
                ..
            }
            | Self::Smart {
                schema_version,
                name,
                ..
            } => (*schema_version, name),
        };
        if schema_version != PLAYLIST_SCHEMA_VERSION {
            return Err(format!(
                "Playlist schema version {schema_version} is unsupported"
            ));
        }
        if name.trim().is_empty() || name.len() > MAX_PLAYLIST_NAME_BYTES {
            return Err("Playlist name is empty or exceeds the safety limit".to_owned());
        }
        match self {
            Self::Static { items, .. } => {
                if items.len() > MAX_PLAYLIST_ITEMS {
                    return Err(format!(
                        "A static playlist may contain at most {MAX_PLAYLIST_ITEMS} items"
                    ));
                }
                for item in items {
                    item.path = normalize_relative_path(&item.path)?;
                    item.hint.validate()?;
                }
            }
            Self::Smart { query, sort, .. } => {
                validate_expr(query)?;
                if sort.len() > 8 {
                    return Err("A smart playlist may contain at most eight sort fields".to_owned());
                }
            }
        }
        Ok(())
    }
}

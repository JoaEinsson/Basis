use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct IndexedTrack {
    pub id: Uuid,
    pub rel_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub artists: Vec<String>,
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i64>,
    pub track_no: Option<i64>,
    pub disc_no: Option<i64>,
    pub genres: Vec<String>,
    pub composer: Option<String>,
    pub duration_ms: Option<i64>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub sample_rate: Option<i64>,
    pub bit_depth: Option<i64>,
    pub channels: Option<i64>,
    pub bitrate: Option<i64>,
    pub file_size: i64,
    pub mtime_ns: i64,
    pub artwork_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySummary {
    pub library_id: Uuid,
    pub root_instance_hash: String,
    pub root_path: String,
    pub track_count: u64,
    pub status: LibraryStatus,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LibraryStatus {
    Ready,
    Scanning,
    Failed,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub discovered: u64,
    pub indexed: u64,
    pub skipped_unchanged: u64,
    pub failed: u64,
    pub current_path: Option<String>,
    pub current_title: Option<String>,
    pub complete: bool,
}

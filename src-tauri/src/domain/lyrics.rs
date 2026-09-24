use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LyricsSource {
    Sidecar,
    Embedded,
    Portable,
    Lrclib,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsLine {
    pub timestamp_ms: u32,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsDocument {
    pub source: LyricsSource,
    pub synced: bool,
    pub instrumental: bool,
    pub lines: Vec<LyricsLine>,
    pub plain_text: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsCandidate {
    pub id: u32,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration_seconds: f64,
    pub has_synced_lyrics: bool,
    pub instrumental: bool,
    pub confidence: LyricsMatchConfidence,
    pub duration_delta_ms: Option<u32>,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSelection {
    pub source: LyricsSource,
    pub provider_id: u32,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsSearchQuery {
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsPreferenceState {
    pub offset_ms: i32,
    pub selection: Option<LyricsSelection>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsPrefetchPolicy {
    pub enabled: bool,
    pub cache_entry_limit: u32,
    pub cache_bytes_limit: u32,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum LyricsMatchConfidence {
    High,
    Review,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResolution {
    pub document: Option<LyricsDocument>,
    pub candidates: Vec<LyricsCandidate>,
    pub message: Option<String>,
    pub offset_ms: i32,
    pub selection: Option<LyricsSelection>,
}

impl LyricsResolution {
    pub fn found(document: LyricsDocument) -> Self {
        Self {
            document: Some(document),
            candidates: Vec::new(),
            message: None,
            offset_ms: 0,
            selection: None,
        }
    }

    pub fn unavailable(message: impl Into<String>) -> Self {
        Self {
            document: None,
            candidates: Vec::new(),
            message: Some(message.into()),
            offset_ms: 0,
            selection: None,
        }
    }

    pub fn with_preference(mut self, preference: LyricsPreferenceState) -> Self {
        self.offset_ms = preference.offset_ms;
        self.selection = preference.selection;
        self
    }
}

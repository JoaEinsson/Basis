use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;
use uuid::Uuid;

use super::query::TrackDto;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackStatus {
    Idle,
    Loading,
    Playing,
    Paused,
    Error,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RepeatMode {
    Off,
    Track,
    Queue,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QueueInsertMode {
    Replace,
    Next,
    Append,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerQueueItem {
    pub queue_id: Uuid,
    pub track: TrackDto,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
    pub status: PlaybackStatus,
    pub queue: Vec<PlayerQueueItem>,
    pub play_order: Vec<Uuid>,
    pub current_index: Option<u32>,
    pub current_track: Option<PlayerQueueItem>,
    pub position_ms: f64,
    pub duration_ms: f64,
    pub volume: u8,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub error: Option<String>,
    pub output_device: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "player://state")]
pub struct PlayerStateEvent {
    pub status: PlaybackStatus,
    pub position_ms: f64,
    pub duration_ms: f64,
    pub volume: u8,
    pub shuffle: bool,
    pub repeat: RepeatMode,
    pub error: Option<String>,
    pub output_device: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "player://track-changed")]
pub struct PlayerTrackChangedEvent {
    pub current_track: Option<PlayerQueueItem>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "player://queue-changed")]
pub struct PlayerQueueChangedEvent {
    pub queue: Vec<PlayerQueueItem>,
    pub play_order: Vec<Uuid>,
    pub current_index: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "player://error")]
pub struct PlayerErrorEvent {
    pub message: String,
    pub recoverable: bool,
}

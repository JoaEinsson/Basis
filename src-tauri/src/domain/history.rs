use serde::{Deserialize, Serialize};
use specta::Type;
use time::{format_description::well_known::Rfc3339, OffsetDateTime, UtcOffset};
use uuid::Uuid;

use crate::portable::paths::normalize_relative_path;

use super::{playlist::TrackHint, query::TrackDto};

const MAX_EVENT_TEXT_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HistoryEventType {
    Played,
    Skipped,
    FavoriteSet,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(untagged)]
pub enum HistoryPayload {
    Seconds { seconds: f64 },
    Favorite { value: bool },
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
pub struct EventTrack {
    pub path: String,
    pub hint: TrackHint,
}

impl EventTrack {
    pub fn from_track(track: &TrackDto) -> Self {
        Self {
            path: track.rel_path.clone(),
            hint: TrackHint::from_track(track),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
pub struct HistoryEvent {
    pub id: Uuid,
    pub ts: String,
    #[serde(rename = "type")]
    pub event_type: HistoryEventType,
    pub track: EventTrack,
    pub payload: HistoryPayload,
}

impl HistoryEvent {
    pub fn favorite(track: &TrackDto, value: bool) -> Result<Self, String> {
        Self::new(
            HistoryEventType::FavoriteSet,
            track,
            HistoryPayload::Favorite { value },
        )
    }

    pub fn played(track: &TrackDto, seconds: f64) -> Result<Self, String> {
        Self::new(
            HistoryEventType::Played,
            track,
            HistoryPayload::Seconds { seconds },
        )
    }

    pub fn skipped(track: &TrackDto, seconds: f64) -> Result<Self, String> {
        Self::new(
            HistoryEventType::Skipped,
            track,
            HistoryPayload::Seconds { seconds },
        )
    }

    fn new(
        event_type: HistoryEventType,
        track: &TrackDto,
        payload: HistoryPayload,
    ) -> Result<Self, String> {
        let ts = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .map_err(|error| format!("Could not format history timestamp: {error}"))?;
        let mut event = Self {
            id: Uuid::new_v4(),
            ts,
            event_type,
            track: EventTrack::from_track(track),
            payload,
        };
        event.normalize_and_validate()?;
        Ok(event)
    }

    pub fn normalize_and_validate(&mut self) -> Result<OffsetDateTime, String> {
        if self.ts.len() > MAX_EVENT_TEXT_BYTES {
            return Err("History timestamp exceeds the safety limit".to_owned());
        }
        let timestamp = OffsetDateTime::parse(&self.ts, &Rfc3339)
            .map_err(|error| format!("History timestamp is not RFC 3339: {error}"))?;
        if timestamp.offset() != UtcOffset::UTC {
            return Err("Portable history timestamps must use UTC".to_owned());
        }
        self.track.path = normalize_relative_path(&self.track.path)?;
        self.track.hint.validate()?;
        match (&self.event_type, &self.payload) {
            (
                HistoryEventType::Played | HistoryEventType::Skipped,
                HistoryPayload::Seconds { seconds },
            ) if seconds.is_finite() && *seconds >= 0.0 => {}
            (HistoryEventType::FavoriteSet, HistoryPayload::Favorite { .. }) => {}
            _ => return Err("History event type and payload do not match".to_owned()),
        }
        Ok(timestamp)
    }
}

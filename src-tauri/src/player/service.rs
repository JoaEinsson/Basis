use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, Weak,
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_specta::Event;
use uuid::Uuid;

use crate::{
    domain::{
        history::HistoryEvent,
        player::{
            PlaybackStatus, PlayerErrorEvent, PlayerQueueChangedEvent, PlayerQueueItem,
            PlayerSnapshot, PlayerStateEvent, PlayerTrackChangedEvent, QueueInsertMode, RepeatMode,
        },
        query::TrackDto,
    },
    index::db::IndexDatabase,
    local_settings::device_id,
    portable::{
        events::{append_event, rebuild_projection},
        paths::resolve_inside_root,
        workspace::write_atomic_json,
    },
};

use super::audio_engine::{
    AudioEngine, AudioEngineEvent, AudioEngineState, EngineEndReason, EngineStartReason,
    VoxioEngine,
};

const SESSION_SCHEMA_VERSION: u32 = 1;
const MAX_QUEUE_ITEMS: usize = 10_000;
const PROGRESS_EVENT_INTERVAL: Duration = Duration::from_millis(250);
const SESSION_WRITE_INTERVAL: Duration = Duration::from_secs(5);

pub struct PlayerService {
    core: Mutex<PlayerCore>,
    engine: Mutex<Option<Arc<dyn AudioEngine>>>,
    engine_generation: AtomicU64,
    library_root: Mutex<Option<PathBuf>>,
    library_database: Mutex<Option<IndexDatabase>>,
    device_id: Uuid,
    sessions_dir: PathBuf,
}

#[derive(Debug)]
struct PlayerCore {
    library_id: Option<Uuid>,
    root_instance_hash: Option<String>,
    queue: Vec<PlayerQueueItem>,
    play_order: Vec<Uuid>,
    cursor: Option<usize>,
    status: PlaybackStatus,
    position_ms: f64,
    duration_ms: f64,
    volume: u8,
    shuffle: bool,
    repeat: RepeatMode,
    shuffle_seed: Uuid,
    primed_queue_id: Option<Uuid>,
    error: Option<String>,
    output_device: Option<String>,
    listened_ms: f64,
    history_closed: bool,
}

#[derive(Debug, Deserialize, Serialize)]
struct PersistedPlayerSession {
    schema_version: u32,
    library_id: Option<Uuid>,
    root_instance_hash: Option<String>,
    queue: Vec<PlayerQueueItem>,
    play_order: Vec<Uuid>,
    cursor: Option<u32>,
    position_ms: f64,
    volume: u8,
    shuffle: bool,
    repeat: RepeatMode,
    shuffle_seed: Uuid,
    #[serde(default)]
    listened_ms: f64,
    #[serde(default)]
    history_closed: bool,
}

impl PlayerService {
    pub fn load(app_data_dir: &Path) -> Result<Arc<Self>, String> {
        Ok(Arc::new(Self {
            core: Mutex::new(PlayerCore::default()),
            engine: Mutex::new(None),
            engine_generation: AtomicU64::new(0),
            library_root: Mutex::new(None),
            library_database: Mutex::new(None),
            device_id: device_id(app_data_dir)?,
            sessions_dir: app_data_dir.join("basis").join("sessions"),
        }))
    }

    pub fn attach_library(
        &self,
        root: PathBuf,
        library_id: Uuid,
        root_instance_hash: String,
        database: Option<IndexDatabase>,
    ) -> Result<(), String> {
        let engine_active = self
            .engine()?
            .as_ref()
            .and_then(|engine| engine.state().ok())
            .is_some_and(|state| state.active);
        let core = self.core()?;
        let same_library = core.library_id == Some(library_id)
            && core.root_instance_hash.as_deref() == Some(&root_instance_hash);
        let fallback_volume = core.volume;
        drop(core);
        if !same_library {
            self.persist()?;
            self.engine_generation.fetch_add(1, Ordering::SeqCst);
            if let Some(engine) = self.engine()?.take() {
                engine.stop()?;
            }
        }
        *self.root()? = Some(root);
        *self.database()? = database;
        let mut core = self.core()?;
        if !same_library {
            let path = self.session_path(library_id, &root_instance_hash);
            let mut restored = load_session(&path).unwrap_or_default();
            let belongs_to_library = restored.library_id == Some(library_id)
                && restored.root_instance_hash.as_deref() == Some(&root_instance_hash);
            if !belongs_to_library {
                restored = PlayerCore::default();
                restored.volume = fallback_volume;
            }
            restored.library_id = Some(library_id);
            restored.root_instance_hash = Some(root_instance_hash);
            if restored.current_item().is_some() {
                restored.status = PlaybackStatus::Paused;
            }
            *core = restored;
        } else if core.current_item().is_some() && !engine_active {
            core.status = PlaybackStatus::Paused;
        }
        drop(core);
        self.persist()
    }

    pub fn snapshot(&self) -> Result<PlayerSnapshot, String> {
        let engine_state = self
            .engine()?
            .as_ref()
            .and_then(|engine| engine.state().ok());
        let mut core = self.core()?;
        if let Some(state) = engine_state {
            core.apply_engine_state(state);
        }
        Ok(core.snapshot())
    }

    pub fn play_collection(
        self: &Arc<Self>,
        app: &AppHandle,
        tracks: Vec<TrackDto>,
        start_track_id: Uuid,
        mode: QueueInsertMode,
    ) -> Result<PlayerSnapshot, String> {
        if tracks.is_empty() {
            return Err("Cannot play an empty track collection".to_owned());
        }
        if tracks.len() > MAX_QUEUE_ITEMS {
            return Err("The requested queue exceeds the safety limit".to_owned());
        }
        let should_start = mode == QueueInsertMode::Replace;
        if should_start {
            self.record_skipped(app);
        }
        {
            let mut core = self.core()?;
            core.insert_tracks(tracks, start_track_id, mode)?;
            core.error = None;
            if should_start {
                core.status = PlaybackStatus::Loading;
                core.position_ms = 0.0;
            }
        }
        self.persist()?;
        self.emit_queue(app);
        if should_start {
            self.start_current(app, 0.0, false)?;
        }
        self.emit_state(app);
        self.snapshot()
    }

    pub fn pause(&self, app: &AppHandle) -> Result<PlayerSnapshot, String> {
        let engine = self
            .engine()?
            .clone()
            .ok_or_else(|| "No track is loaded".to_owned())?;
        engine.pause()?;
        if let Ok(state) = engine.state() {
            let mut core = self.core()?;
            core.apply_engine_state(state);
            core.status = PlaybackStatus::Paused;
        }
        self.persist()?;
        self.emit_state(app);
        self.snapshot()
    }

    pub fn resume(self: &Arc<Self>, app: &AppHandle) -> Result<PlayerSnapshot, String> {
        let engine = self.ensure_engine(app)?;
        let state = engine.state()?;
        if state.active {
            engine.play()?;
        } else {
            let position = self.core()?.position_ms;
            self.start_current(app, position, true)?;
        }
        self.emit_state(app);
        self.snapshot()
    }

    pub fn seek(&self, app: &AppHandle, position_ms: f64) -> Result<PlayerSnapshot, String> {
        if !position_ms.is_finite() {
            return Err("Playback position must be finite".to_owned());
        }
        let engine = self
            .engine()?
            .clone()
            .ok_or_else(|| "No track is loaded".to_owned())?;
        let duration = self.core()?.duration_ms;
        let position_ms =
            position_ms
                .max(0.0)
                .min(if duration > 0.0 { duration } else { f64::MAX });
        engine.seek(position_ms / 1000.0)?;
        self.core()?.position_ms = position_ms;
        self.persist()?;
        self.emit_state(app);
        self.snapshot()
    }

    pub fn next(self: &Arc<Self>, app: &AppHandle) -> Result<PlayerSnapshot, String> {
        self.record_skipped(app);
        let moved = self.core()?.move_next(false);
        if moved {
            self.start_current(app, 0.0, false)?;
            self.emit_track_changed(app);
        } else {
            self.stop_at_queue_end(app)?;
        }
        self.persist()?;
        self.emit_state(app);
        self.snapshot()
    }

    pub fn previous(self: &Arc<Self>, app: &AppHandle) -> Result<PlayerSnapshot, String> {
        let position = self.snapshot()?.position_ms;
        if position > 5_000.0 {
            self.record_skipped(app);
            self.core()?.reset_listening();
            return self.seek(app, 0.0);
        }
        self.record_skipped(app);
        let moved = self.core()?.move_previous();
        if moved {
            self.start_current(app, 0.0, false)?;
            self.emit_track_changed(app);
            self.persist()?;
        } else {
            let engine_active = self
                .engine()?
                .as_ref()
                .and_then(|engine| engine.state().ok())
                .is_some_and(|state| state.active);
            if engine_active {
                self.core()?.reset_listening();
                self.seek(app, 0.0)?;
            } else {
                self.start_current(app, 0.0, false)?;
                self.persist()?;
            }
        }
        self.emit_state(app);
        self.snapshot()
    }

    pub fn set_volume(&self, app: &AppHandle, volume: u8) -> Result<PlayerSnapshot, String> {
        let volume = volume.min(100);
        self.core()?.volume = volume;
        if let Some(engine) = self.engine()?.as_ref() {
            engine.set_volume(volume_to_linear(volume))?;
        }
        self.persist()?;
        self.emit_state(app);
        self.snapshot()
    }

    pub fn set_shuffle(&self, app: &AppHandle, enabled: bool) -> Result<PlayerSnapshot, String> {
        {
            let mut core = self.core()?;
            core.set_shuffle(enabled);
        }
        self.reprime(app);
        self.persist()?;
        self.emit_queue(app);
        self.emit_state(app);
        self.snapshot()
    }

    pub fn set_repeat(
        &self,
        app: &AppHandle,
        repeat: RepeatMode,
    ) -> Result<PlayerSnapshot, String> {
        self.core()?.repeat = repeat;
        self.reprime(app);
        self.persist()?;
        self.emit_state(app);
        self.snapshot()
    }

    fn start_current(
        self: &Arc<Self>,
        app: &AppHandle,
        position_ms: f64,
        preserve_listening: bool,
    ) -> Result<(), String> {
        let engine = self.ensure_engine(app)?;
        let (path, volume) = {
            let core = self.core()?;
            let item = core
                .current_item()
                .ok_or_else(|| "The queue has no current track".to_owned())?;
            (self.resolve_track_path(&item.track.rel_path)?, core.volume)
        };
        engine.set_volume(volume_to_linear(volume))?;
        if let Err(error) = engine.load_and_play(&path) {
            self.fail(app, error.clone(), true);
            return Err(error);
        }
        if position_ms > 0.0 {
            engine.seek(position_ms / 1000.0)?;
        }
        {
            let mut core = self.core()?;
            if !preserve_listening {
                core.reset_listening();
            }
            core.status = PlaybackStatus::Playing;
            core.position_ms = position_ms;
            core.error = None;
        }
        self.reprime(app);
        self.emit_track_changed(app);
        Ok(())
    }

    fn reprime(&self, app: &AppHandle) {
        let engine = match self.engine().ok().and_then(|engine| engine.clone()) {
            Some(engine) => engine,
            None => return,
        };
        let target = self
            .core()
            .ok()
            .and_then(|core| core.automatic_next_item().cloned());
        let path = target
            .as_ref()
            .and_then(|item| self.resolve_track_path(&item.track.rel_path).ok());
        match engine.prime_next(path.as_deref()) {
            Ok(()) => {
                if let Ok(mut core) = self.core() {
                    core.primed_queue_id = target.map(|item| item.queue_id);
                }
            }
            Err(error) => {
                if let Ok(mut core) = self.core() {
                    core.primed_queue_id = None;
                }
                self.fail(app, error, true);
            }
        }
    }

    fn stop_at_queue_end(&self, app: &AppHandle) -> Result<(), String> {
        if let Some(engine) = self.engine()?.as_ref() {
            engine.stop()?;
        }
        let mut core = self.core()?;
        core.status = PlaybackStatus::Idle;
        core.position_ms = core.duration_ms;
        core.primed_queue_id = None;
        drop(core);
        self.emit_track_changed(app);
        Ok(())
    }

    fn ensure_engine(self: &Arc<Self>, app: &AppHandle) -> Result<Arc<dyn AudioEngine>, String> {
        let mut engine_slot = self.engine()?;
        if let Some(engine) = engine_slot.as_ref() {
            return Ok(Arc::clone(engine));
        }
        let engine: Arc<dyn AudioEngine> = match VoxioEngine::open() {
            Ok(engine) => Arc::new(engine),
            Err(error) => {
                self.fail(app, error.clone(), true);
                return Err(error);
            }
        };
        let volume = self.core()?.volume;
        engine.set_volume(volume_to_linear(volume))?;
        *engine_slot = Some(Arc::clone(&engine));
        drop(engine_slot);
        let generation = self.engine_generation.fetch_add(1, Ordering::SeqCst) + 1;
        spawn_engine_events(
            Arc::downgrade(self),
            Arc::clone(&engine),
            app.clone(),
            generation,
        );
        Ok(engine)
    }

    fn handle_engine_event(self: &Arc<Self>, app: &AppHandle, event: AudioEngineEvent) {
        match event {
            AudioEngineEvent::TrackStarted {
                duration_ms,
                reason,
            } => {
                let changed = if let Ok(mut core) = self.core() {
                    let changed = if reason == EngineStartReason::Gapless {
                        let changed = core.accept_primed();
                        core.reset_listening();
                        changed
                    } else {
                        true
                    };
                    core.status = PlaybackStatus::Playing;
                    core.position_ms = 0.0;
                    core.duration_ms = duration_ms;
                    core.error = None;
                    changed
                } else {
                    false
                };
                self.reprime(app);
                if changed {
                    self.emit_track_changed(app);
                }
                let _ = self.persist();
            }
            AudioEngineEvent::TrackEnded { reason } => match reason {
                EngineEndReason::EndOfStream => {
                    self.record_played(app, true);
                    if self
                        .core()
                        .map(|core| core.primed_queue_id.is_none())
                        .unwrap_or(false)
                    {
                        let _ = self.stop_at_queue_end(app);
                    }
                }
                EngineEndReason::Failed => {
                    // A broken file must not loop forever when repeat-track is enabled.
                    let moved = self
                        .core()
                        .map(|mut core| core.move_next(false))
                        .unwrap_or(false);
                    if moved {
                        let _ = self.start_current(app, 0.0, false);
                    } else {
                        let _ = self.stop_at_queue_end(app);
                    }
                }
                EngineEndReason::Interrupted => {}
            },
            AudioEngineEvent::Stopped => {
                if let Ok(mut core) = self.core() {
                    if core.status != PlaybackStatus::Loading {
                        core.status = PlaybackStatus::Idle;
                    }
                }
            }
            AudioEngineEvent::DurationResolved { duration_ms } => {
                if let Ok(mut core) = self.core() {
                    core.duration_ms = duration_ms;
                }
            }
            AudioEngineEvent::Error {
                message,
                recoverable,
            } => self.fail(app, message, recoverable),
            AudioEngineEvent::DeviceChanged { name } => {
                if let Ok(mut core) = self.core() {
                    core.output_device = Some(name);
                    core.error = None;
                }
            }
            AudioEngineEvent::DeviceLost { name, error } => {
                if let Ok(mut core) = self.core() {
                    core.output_device = Some(name.clone());
                }
                self.fail(
                    app,
                    format!("Audio device {name} is unavailable; Basis is retrying: {error}"),
                    true,
                );
            }
            AudioEngineEvent::StateChanged { paused } => {
                if let Ok(mut core) = self.core() {
                    core.status = if paused {
                        PlaybackStatus::Paused
                    } else {
                        PlaybackStatus::Playing
                    };
                }
            }
        }
        self.emit_state(app);
    }

    fn update_progress(&self) {
        let state = self
            .engine()
            .ok()
            .and_then(|engine| engine.as_ref().and_then(|engine| engine.state().ok()));
        if let (Some(state), Ok(mut core)) = (state, self.core()) {
            core.apply_engine_state(state);
        }
    }

    fn account_listened(&self, app: &AppHandle, elapsed: Duration) {
        let event = self.core().ok().and_then(|mut core| {
            if core.status != PlaybackStatus::Playing || core.history_closed {
                return None;
            }
            let elapsed_ms = elapsed.as_secs_f64().mul_add(1_000.0, 0.0).min(1_000.0);
            core.listened_ms += elapsed_ms;
            core.take_played_event(false)
        });
        if let Some((track, seconds)) = event {
            if let Err(error) = self.write_history(HistoryEvent::played(&track, seconds)) {
                self.fail(app, error, true);
            }
        }
    }

    fn record_played(&self, app: &AppHandle, natural_completion: bool) {
        let event = self
            .core()
            .ok()
            .and_then(|mut core| core.take_played_event(natural_completion));
        if let Some((track, seconds)) = event {
            if let Err(error) = self.write_history(HistoryEvent::played(&track, seconds)) {
                self.fail(app, error, true);
            }
        }
    }

    fn record_skipped(&self, app: &AppHandle) {
        let event = self
            .core()
            .ok()
            .and_then(|mut core| core.take_skipped_event());
        if let Some((track, seconds)) = event {
            if let Err(error) = self.write_history(HistoryEvent::skipped(&track, seconds)) {
                self.fail(app, error, true);
            }
        }
    }

    fn write_history(&self, event: Result<HistoryEvent, String>) -> Result<(), String> {
        let root = self
            .root()?
            .clone()
            .ok_or_else(|| "No library is attached to the player".to_owned())?;
        append_event(&root, self.device_id, event?)?;
        if let Some(database) = self.database()?.as_ref() {
            rebuild_projection(&root, database)?;
        }
        Ok(())
    }

    fn fail(&self, app: &AppHandle, message: String, recoverable: bool) {
        if let Ok(mut core) = self.core() {
            core.error = Some(message.clone());
            if !recoverable {
                core.status = PlaybackStatus::Error;
            }
        }
        let _ = PlayerErrorEvent {
            message,
            recoverable,
        }
        .emit(app);
        self.emit_state(app);
    }

    fn emit_state(&self, app: &AppHandle) {
        if let Ok(snapshot) = self.snapshot() {
            let _ = PlayerStateEvent {
                status: snapshot.status,
                position_ms: snapshot.position_ms,
                duration_ms: snapshot.duration_ms,
                volume: snapshot.volume,
                shuffle: snapshot.shuffle,
                repeat: snapshot.repeat,
                error: snapshot.error,
                output_device: snapshot.output_device,
            }
            .emit(app);
        }
    }

    fn emit_track_changed(&self, app: &AppHandle) {
        let current_track = self
            .core()
            .ok()
            .and_then(|core| core.current_item().cloned());
        let _ = PlayerTrackChangedEvent { current_track }.emit(app);
    }

    fn emit_queue(&self, app: &AppHandle) {
        if let Ok(snapshot) = self.snapshot() {
            let _ = PlayerQueueChangedEvent {
                queue: snapshot.queue,
                play_order: snapshot.play_order,
                current_index: snapshot.current_index,
            }
            .emit(app);
        }
    }

    fn resolve_track_path(&self, relative_path: &str) -> Result<PathBuf, String> {
        let root = self
            .root()?
            .clone()
            .ok_or_else(|| "No library is attached to the player".to_owned())?;
        resolve_inside_root(&root, relative_path)
    }

    fn persist(&self) -> Result<(), String> {
        let core = self.core()?;
        let (Some(library_id), Some(root_instance_hash)) =
            (core.library_id, core.root_instance_hash.as_deref())
        else {
            return Ok(());
        };
        let path = self.session_path(library_id, root_instance_hash);
        let session = core.persisted();
        drop(core);
        write_atomic_json(&path, &session)
    }

    fn session_path(&self, library_id: Uuid, root_instance_hash: &str) -> PathBuf {
        self.sessions_dir
            .join(library_id.to_string())
            .join(format!("{root_instance_hash}.json"))
    }

    fn core(&self) -> Result<std::sync::MutexGuard<'_, PlayerCore>, String> {
        self.core
            .lock()
            .map_err(|_| "Player state is unavailable after an internal failure".to_owned())
    }

    fn engine(&self) -> Result<std::sync::MutexGuard<'_, Option<Arc<dyn AudioEngine>>>, String> {
        self.engine
            .lock()
            .map_err(|_| "Audio engine state is unavailable after an internal failure".to_owned())
    }

    fn root(&self) -> Result<std::sync::MutexGuard<'_, Option<PathBuf>>, String> {
        self.library_root
            .lock()
            .map_err(|_| "Player library state is unavailable after an internal failure".to_owned())
    }

    fn database(&self) -> Result<std::sync::MutexGuard<'_, Option<IndexDatabase>>, String> {
        self.library_database
            .lock()
            .map_err(|_| "Player library index is unavailable after an internal failure".to_owned())
    }
}

impl PlayerCore {
    fn reset_listening(&mut self) {
        self.listened_ms = 0.0;
        self.history_closed = false;
    }

    fn take_played_event(&mut self, natural_completion: bool) -> Option<(TrackDto, f64)> {
        if self.history_closed {
            return None;
        }
        let track = self.current_item()?.track.clone();
        let duration_ms = if self.duration_ms > 0.0 {
            self.duration_ms
        } else {
            track.duration_ms.unwrap_or(0.0)
        };
        let reached_threshold =
            duration_ms >= 30_000.0 && self.listened_ms >= (duration_ms * 0.5).min(240_000.0);
        if !natural_completion && !reached_threshold {
            return None;
        }
        self.history_closed = true;
        Some((track, self.listened_ms / 1_000.0))
    }

    fn take_skipped_event(&mut self) -> Option<(TrackDto, f64)> {
        if self.history_closed {
            return None;
        }
        let track = self.current_item()?.track.clone();
        self.history_closed = true;
        Some((track, self.listened_ms / 1_000.0))
    }

    fn insert_tracks(
        &mut self,
        tracks: Vec<TrackDto>,
        start_track_id: Uuid,
        mode: QueueInsertMode,
    ) -> Result<(), String> {
        let resulting_len = if mode == QueueInsertMode::Replace {
            tracks.len()
        } else {
            self.queue.len().saturating_add(tracks.len())
        };
        if resulting_len > MAX_QUEUE_ITEMS {
            return Err("The queue exceeds the safety limit".to_owned());
        }
        let mut items = tracks
            .into_iter()
            .map(|track| PlayerQueueItem {
                queue_id: Uuid::new_v4(),
                track,
            })
            .collect::<Vec<_>>();
        match mode {
            QueueInsertMode::Replace => {
                let start_queue_id = items
                    .iter()
                    .find(|item| item.track.id == start_track_id)
                    .or_else(|| items.first())
                    .map(|item| item.queue_id)
                    .ok_or_else(|| "Cannot start an empty queue".to_owned())?;
                self.queue = items;
                self.play_order = self.queue.iter().map(|item| item.queue_id).collect();
                self.cursor = self.play_order.iter().position(|id| *id == start_queue_id);
                self.shuffle_seed = Uuid::new_v4();
                if self.shuffle {
                    self.rebuild_shuffled_order(Vec::new(), start_queue_id);
                }
            }
            QueueInsertMode::Next => {
                let was_empty = self.queue.is_empty();
                let insertion = self
                    .current_item()
                    .and_then(|current| {
                        self.queue
                            .iter()
                            .position(|item| item.queue_id == current.queue_id)
                    })
                    .map_or(0, |index| index + 1);
                let ids = items.iter().map(|item| item.queue_id).collect::<Vec<_>>();
                self.queue.splice(insertion..insertion, items);
                let play_insertion = self.cursor.map_or(0, |index| index + 1);
                self.play_order.splice(play_insertion..play_insertion, ids);
                if was_empty && !self.play_order.is_empty() {
                    self.cursor = Some(0);
                    self.status = PlaybackStatus::Paused;
                }
            }
            QueueInsertMode::Append => {
                let was_empty = self.queue.is_empty();
                let mut ids = items.iter().map(|item| item.queue_id).collect::<Vec<_>>();
                if self.shuffle {
                    ids.sort_by_key(|id| shuffle_rank(self.shuffle_seed, *id));
                }
                self.queue.append(&mut items);
                self.play_order.extend(ids);
                if was_empty && !self.play_order.is_empty() {
                    self.cursor = Some(0);
                    self.status = PlaybackStatus::Paused;
                }
            }
        }
        Ok(())
    }

    fn set_shuffle(&mut self, enabled: bool) {
        if self.shuffle == enabled {
            return;
        }
        let Some(current) = self.current_item().map(|item| item.queue_id) else {
            self.shuffle = enabled;
            return;
        };
        if enabled {
            let history = self
                .cursor
                .map(|cursor| self.play_order[..cursor].to_vec())
                .unwrap_or_default();
            self.shuffle_seed = Uuid::new_v4();
            self.shuffle = true;
            self.rebuild_shuffled_order(history, current);
        } else {
            self.shuffle = false;
            self.play_order = self.queue.iter().map(|item| item.queue_id).collect();
            self.cursor = self.play_order.iter().position(|id| *id == current);
        }
    }

    fn rebuild_shuffled_order(&mut self, history: Vec<Uuid>, current: Uuid) {
        let excluded = history
            .iter()
            .copied()
            .chain([current])
            .collect::<HashSet<_>>();
        let mut remaining = self
            .queue
            .iter()
            .map(|item| item.queue_id)
            .filter(|id| !excluded.contains(id))
            .collect::<Vec<_>>();
        remaining.sort_by_key(|id| shuffle_rank(self.shuffle_seed, *id));
        self.play_order = history;
        self.play_order.push(current);
        self.cursor = Some(self.play_order.len() - 1);
        self.play_order.extend(remaining);
    }

    fn move_next(&mut self, automatic: bool) -> bool {
        let Some(cursor) = self.cursor else {
            return false;
        };
        if automatic && self.repeat == RepeatMode::Track {
            self.position_ms = 0.0;
            return true;
        }
        if cursor + 1 < self.play_order.len() {
            self.cursor = Some(cursor + 1);
            self.position_ms = 0.0;
            return true;
        }
        if self.repeat == RepeatMode::Queue && !self.play_order.is_empty() {
            self.cursor = Some(0);
            self.position_ms = 0.0;
            return true;
        }
        false
    }

    fn move_previous(&mut self) -> bool {
        let Some(cursor) = self.cursor else {
            return false;
        };
        if cursor > 0 {
            self.cursor = Some(cursor - 1);
            self.position_ms = 0.0;
            true
        } else {
            false
        }
    }

    fn accept_primed(&mut self) -> bool {
        let Some(primed) = self.primed_queue_id.take() else {
            return false;
        };
        if let Some(index) = self.play_order.iter().position(|id| *id == primed) {
            let changed = self.cursor != Some(index);
            self.cursor = Some(index);
            return changed;
        }
        false
    }

    fn automatic_next_item(&self) -> Option<&PlayerQueueItem> {
        let cursor = self.cursor?;
        let queue_id = if self.repeat == RepeatMode::Track {
            *self.play_order.get(cursor)?
        } else if let Some(next) = self.play_order.get(cursor + 1) {
            *next
        } else if self.repeat == RepeatMode::Queue {
            *self.play_order.first()?
        } else {
            return None;
        };
        self.item(queue_id)
    }

    fn current_item(&self) -> Option<&PlayerQueueItem> {
        self.cursor
            .and_then(|index| self.play_order.get(index))
            .and_then(|id| self.item(*id))
    }

    fn item(&self, queue_id: Uuid) -> Option<&PlayerQueueItem> {
        self.queue.iter().find(|item| item.queue_id == queue_id)
    }

    fn apply_engine_state(&mut self, state: AudioEngineState) {
        self.position_ms = finite_nonnegative(state.position_ms);
        if state.duration_ms > 0.0 {
            self.duration_ms = finite_nonnegative(state.duration_ms);
        }
        if state.active {
            self.status = if state.paused {
                PlaybackStatus::Paused
            } else {
                PlaybackStatus::Playing
            };
        }
    }

    fn snapshot(&self) -> PlayerSnapshot {
        PlayerSnapshot {
            status: self.status,
            queue: self.queue.clone(),
            play_order: self.play_order.clone(),
            current_index: self.cursor.and_then(|index| u32::try_from(index).ok()),
            current_track: self.current_item().cloned(),
            position_ms: finite_nonnegative(self.position_ms),
            duration_ms: finite_nonnegative(self.duration_ms),
            volume: self.volume,
            shuffle: self.shuffle,
            repeat: self.repeat,
            error: self.error.clone(),
            output_device: self.output_device.clone(),
        }
    }

    fn persisted(&self) -> PersistedPlayerSession {
        PersistedPlayerSession {
            schema_version: SESSION_SCHEMA_VERSION,
            library_id: self.library_id,
            root_instance_hash: self.root_instance_hash.clone(),
            queue: self.queue.clone(),
            play_order: self.play_order.clone(),
            cursor: self.cursor.and_then(|index| u32::try_from(index).ok()),
            position_ms: finite_nonnegative(self.position_ms),
            volume: self.volume,
            shuffle: self.shuffle,
            repeat: self.repeat,
            shuffle_seed: self.shuffle_seed,
            listened_ms: finite_nonnegative(self.listened_ms),
            history_closed: self.history_closed,
        }
    }
}

impl Default for PlayerCore {
    fn default() -> Self {
        Self {
            library_id: None,
            root_instance_hash: None,
            queue: Vec::new(),
            play_order: Vec::new(),
            cursor: None,
            status: PlaybackStatus::Idle,
            position_ms: 0.0,
            duration_ms: 0.0,
            volume: 80,
            shuffle: false,
            repeat: RepeatMode::Off,
            shuffle_seed: Uuid::new_v4(),
            primed_queue_id: None,
            error: None,
            output_device: None,
            listened_ms: 0.0,
            history_closed: false,
        }
    }
}

impl TryFrom<PersistedPlayerSession> for PlayerCore {
    type Error = String;

    fn try_from(session: PersistedPlayerSession) -> Result<Self, Self::Error> {
        if session.schema_version != SESSION_SCHEMA_VERSION
            || session.queue.len() > MAX_QUEUE_ITEMS
            || session.volume > 100
            || !session.position_ms.is_finite()
            || session.position_ms < 0.0
            || !session.listened_ms.is_finite()
            || session.listened_ms < 0.0
        {
            return Err("Player session is invalid or unsupported".to_owned());
        }
        let queue_ids = session
            .queue
            .iter()
            .map(|item| item.queue_id)
            .collect::<HashSet<_>>();
        let ordered_ids = session.play_order.iter().copied().collect::<HashSet<_>>();
        if queue_ids.len() != session.queue.len()
            || session.play_order.len() != session.queue.len()
            || ordered_ids.len() != session.play_order.len()
            || session.play_order.iter().any(|id| !queue_ids.contains(id))
        {
            return Err("Player session queue order is invalid".to_owned());
        }
        let cursor = session.cursor.and_then(|index| usize::try_from(index).ok());
        if cursor.is_some_and(|index| index >= session.play_order.len()) {
            return Err("Player session cursor is invalid".to_owned());
        }
        Ok(Self {
            library_id: session.library_id,
            root_instance_hash: session.root_instance_hash,
            queue: session.queue,
            play_order: session.play_order,
            cursor,
            status: if cursor.is_some() {
                PlaybackStatus::Paused
            } else {
                PlaybackStatus::Idle
            },
            position_ms: session.position_ms,
            duration_ms: 0.0,
            volume: session.volume,
            shuffle: session.shuffle,
            repeat: session.repeat,
            shuffle_seed: session.shuffle_seed,
            primed_queue_id: None,
            error: None,
            output_device: None,
            listened_ms: session.listened_ms,
            history_closed: session.history_closed,
        })
    }
}

fn load_session(path: &Path) -> Result<PlayerCore, String> {
    if !path.exists() {
        return Ok(PlayerCore::default());
    }
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Could not inspect the local player session: {error}"))?;
    if metadata.len() > 8 * 1024 * 1024 {
        return Err("The local player session exceeds its safety limit".to_owned());
    }
    let source = fs::read_to_string(path)
        .map_err(|error| format!("Could not read the local player session: {error}"))?;
    let session = serde_json::from_str::<PersistedPlayerSession>(&source)
        .map_err(|error| format!("The local player session is invalid JSON: {error}"))?;
    session.try_into()
}

fn spawn_engine_events(
    service: Weak<PlayerService>,
    engine: Arc<dyn AudioEngine>,
    app: AppHandle,
    generation: u64,
) {
    std::thread::spawn(move || {
        let mut last_write = Instant::now();
        let mut last_account = Instant::now();
        loop {
            let Some(service) = service.upgrade() else {
                break;
            };
            if service.engine_generation.load(Ordering::SeqCst) != generation {
                break;
            }
            let event = engine.receive_event(PROGRESS_EVENT_INTERVAL);
            let elapsed = last_account.elapsed();
            last_account = Instant::now();
            if service.engine_generation.load(Ordering::SeqCst) != generation {
                break;
            }
            service.account_listened(&app, elapsed);
            if let Some(event) = event {
                service.handle_engine_event(&app, event);
            } else {
                service.update_progress();
                service.emit_state(&app);
            }
            if last_write.elapsed() >= SESSION_WRITE_INTERVAL {
                let _ = service.persist();
                last_write = Instant::now();
            }
        }
    });
}

fn shuffle_rank(seed: Uuid, queue_id: Uuid) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(seed.as_bytes());
    hasher.update(queue_id.as_bytes());
    *hasher.finalize().as_bytes()
}

fn volume_to_linear(volume: u8) -> f32 {
    let perceptual = f32::from(volume.min(100)) / 100.0;
    perceptual * perceptual
}

fn finite_nonnegative(value: f64) -> f64 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use uuid::Uuid;

    use crate::domain::{
        player::{PlaybackStatus, QueueInsertMode, RepeatMode},
        query::TrackDto,
    };

    use super::{volume_to_linear, PersistedPlayerSession, PlayerCore, PlayerService};

    #[test]
    fn queue_replace_next_append_shuffle_and_repeat_are_deterministic() {
        let tracks = (0..5).map(track).collect::<Vec<_>>();
        let start = tracks[1].id;
        let mut core = PlayerCore::default();
        core.insert_tracks(tracks.clone(), start, QueueInsertMode::Replace)
            .unwrap();
        assert_eq!(core.current_item().unwrap().track.id, start);

        core.set_shuffle(true);
        let stable = core.play_order.clone();
        assert_eq!(core.current_item().unwrap().track.id, start);
        assert!(core.move_next(false));
        core.set_shuffle(true);
        assert_eq!(core.play_order, stable);

        core.repeat = RepeatMode::Track;
        let current = core.current_item().unwrap().queue_id;
        assert!(core.move_next(true));
        assert_eq!(core.current_item().unwrap().queue_id, current);

        core.set_shuffle(false);
        assert_eq!(core.current_item().unwrap().queue_id, current);
        assert_eq!(
            core.play_order,
            core.queue
                .iter()
                .map(|item| item.queue_id)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn previous_threshold_session_restore_and_volume_curve_follow_locked_rules() {
        let tracks = (0..3).map(track).collect::<Vec<_>>();
        let mut core = PlayerCore::default();
        core.insert_tracks(tracks.clone(), tracks[1].id, QueueInsertMode::Replace)
            .unwrap();
        assert!(core.move_previous());
        assert_eq!(core.current_item().unwrap().track.id, tracks[0].id);
        core.position_ms = 4_250.0;
        let session = core.persisted();
        let restored = PlayerCore::try_from(session).unwrap();
        assert_eq!(restored.status, PlaybackStatus::Paused);
        assert_eq!(restored.position_ms, 4_250.0);
        assert_eq!(volume_to_linear(50), 0.25);
    }

    #[test]
    fn corrupt_session_order_is_rejected() {
        let core = PlayerCore::default();
        let mut session: PersistedPlayerSession = core.persisted();
        session.play_order.push(Uuid::new_v4());
        assert!(PlayerCore::try_from(session).is_err());
    }

    #[test]
    fn listened_threshold_short_tracks_and_seeks_follow_history_rules() {
        let source = track(1);
        let mut core = PlayerCore::default();
        core.insert_tracks(vec![source.clone()], source.id, QueueInsertMode::Replace)
            .unwrap();
        core.duration_ms = 180_000.0;
        core.position_ms = 179_000.0;
        assert!(core.take_played_event(false).is_none());
        core.listened_ms = 89_999.0;
        assert!(core.take_played_event(false).is_none());
        core.listened_ms = 90_000.0;
        assert_eq!(core.take_played_event(false).unwrap().1, 90.0);
        assert!(core.take_skipped_event().is_none());

        core.reset_listening();
        core.duration_ms = 20_000.0;
        core.listened_ms = 20_000.0;
        assert!(core.take_played_event(false).is_none());
        assert_eq!(core.take_played_event(true).unwrap().1, 20.0);
    }

    #[test]
    fn copied_library_roots_restore_distinct_paused_sessions() {
        let app_data = tempfile::tempdir().unwrap();
        let library_id = Uuid::new_v4();
        let first_hash = "a".repeat(64);
        let second_hash = "b".repeat(64);
        let first_track = track(1);
        let second_track = track(2);
        let service = PlayerService::load(app_data.path()).unwrap();

        service
            .attach_library(
                PathBuf::from("first-root"),
                library_id,
                first_hash.clone(),
                None,
            )
            .unwrap();
        service
            .core()
            .unwrap()
            .insert_tracks(
                vec![first_track.clone()],
                first_track.id,
                QueueInsertMode::Replace,
            )
            .unwrap();
        service.core().unwrap().position_ms = 3_250.0;
        service.persist().unwrap();

        service
            .attach_library(
                PathBuf::from("second-root"),
                library_id,
                second_hash.clone(),
                None,
            )
            .unwrap();
        assert!(service.core().unwrap().queue.is_empty());
        service
            .core()
            .unwrap()
            .insert_tracks(
                vec![second_track.clone()],
                second_track.id,
                QueueInsertMode::Replace,
            )
            .unwrap();
        service.persist().unwrap();

        let restored = PlayerService::load(app_data.path()).unwrap();
        restored
            .attach_library(PathBuf::from("first-root"), library_id, first_hash, None)
            .unwrap();
        let snapshot = restored.snapshot().unwrap();
        assert_eq!(snapshot.status, PlaybackStatus::Paused);
        assert_eq!(snapshot.current_track.unwrap().track.id, first_track.id);
        assert_eq!(snapshot.position_ms, 3_250.0);
        assert!(app_data
            .path()
            .join("basis/sessions")
            .join(library_id.to_string())
            .join(format!("{second_hash}.json"))
            .is_file());
    }

    fn track(index: usize) -> TrackDto {
        TrackDto {
            id: Uuid::new_v4(),
            rel_path: format!("Album/{index}.flac"),
            title: Some(format!("Track {index}")),
            artist: Some("Artist".to_owned()),
            artists: vec!["Artist".to_owned()],
            album_artist: Some("Artist".to_owned()),
            album: Some("Album".to_owned()),
            year: Some(2026),
            track_no: u32::try_from(index + 1).ok(),
            disc_no: Some(1),
            genres: vec!["Test".to_owned()],
            composer: None,
            duration_ms: Some(1_000.0),
            codec: Some("flac".to_owned()),
            container: Some("flac".to_owned()),
            sample_rate: Some(44_100),
            bit_depth: Some(16),
            channels: Some(2),
            bitrate: None,
            artwork_key: None,
            added_at: 0.0,
            last_played: None,
            play_count: 0,
            favorite: false,
        }
    }
}

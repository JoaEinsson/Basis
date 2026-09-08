//! Native controls only project PlayerService state; callbacks never navigate.
use std::{
    path::{Path, PathBuf},
    sync::{mpsc, Arc},
    time::Duration,
};

use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    SeekDirection,
};
use tauri::{AppHandle, Manager};

use super::service::PlayerService;
use crate::{
    app_state::AppState,
    domain::{player::PlaybackStatus, query::TrackDto},
    library::artwork::read_cached_thumbnail,
};

pub(super) struct MediaState {
    pub track: Option<TrackDto>,
    pub status: PlaybackStatus,
    pub position_ms: f64,
    pub duration_ms: f64,
    pub volume: f64,
}

pub fn start(app: &AppHandle, player: &Arc<PlayerService>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let hwnd = Some(
        app.get_webview_window("main")
            .ok_or("The main window is unavailable")?
            .hwnd()
            .map_err(|e| e.to_string())?
            .0,
    );
    #[cfg(not(target_os = "windows"))]
    let hwnd = None;

    let mut controls = MediaControls::new(PlatformConfig {
        dbus_name: "basis",
        display_name: "Basis",
        hwnd,
    })
    .map_err(|e| e.to_string())?;
    // Bounded callbacks: no filesystem/audio work on the OS event thread.
    let (sender, receiver) = mpsc::sync_channel(32);
    controls
        .attach(move |event| {
            let _ = sender.try_send(event);
        })
        .map_err(|e| e.to_string())?;
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("media-controls");
    let fallback = prepare_fallback(&cache)?;
    let app = app.clone();
    let player = Arc::downgrade(player);
    std::thread::spawn(move || {
        let mut previous_metadata = None;
        let mut cover_key = None;
        let mut cover = fallback.clone();
        #[cfg(target_os = "linux")]
        let mut last_volume = None;
        loop {
            let event = receiver.recv_timeout(Duration::from_millis(500));
            let Some(player) = player.upgrade() else {
                break;
            };
            if let Ok(event) = event {
                if let Err(error) = dispatch(&player, &app, event) {
                    eprintln!("Basis media command failed: {error}");
                }
            }
            let Ok(state) = player.media_state() else {
                continue;
            };
            let track = state.track.as_ref();
            let next_key = track.and_then(|track| track.artwork_key.clone());
            if cover_key != next_key {
                cover = next_key
                    .as_deref()
                    .and_then(|key| cached_cover(&app, &cache, key).ok())
                    .unwrap_or_else(|| fallback.clone());
                cover_key = next_key;
            }
            if let Some(track) = track {
                let metadata = (
                    track
                        .title
                        .clone()
                        .unwrap_or_else(|| track.rel_path.clone()),
                    track.artist.clone().unwrap_or_default(),
                    track.album.clone().unwrap_or_default(),
                    cover.clone(),
                    duration(state.duration_ms),
                );
                if previous_metadata.as_ref() != Some(&metadata) {
                    let result = controls.set_metadata(MediaMetadata {
                        title: Some(&metadata.0),
                        artist: Some(&metadata.1),
                        album: Some(&metadata.2),
                        cover_url: Some(&metadata.3),
                        duration: Some(metadata.4),
                    });
                    if result.is_ok() {
                        previous_metadata = Some(metadata);
                    }
                }
            }
            let progress = Some(MediaPosition(duration(state.position_ms)));
            let playback = match state.status {
                PlaybackStatus::Playing => MediaPlayback::Playing { progress },
                PlaybackStatus::Paused | PlaybackStatus::Loading => {
                    MediaPlayback::Paused { progress }
                }
                _ => MediaPlayback::Stopped,
            };
            if let Err(error) = controls.set_playback(playback) {
                eprintln!("Basis media controls disconnected: {error}");
                break;
            }
            #[cfg(target_os = "linux")]
            if last_volume != Some(state.volume) && controls.set_volume(state.volume).is_ok() {
                last_volume = Some(state.volume);
            }
            #[cfg(not(target_os = "linux"))]
            let _ = state.volume; // SMTC has no per-player volume property.
        }
    });
    Ok(())
}

fn dispatch(
    player: &Arc<PlayerService>,
    app: &AppHandle,
    event: MediaControlEvent,
) -> Result<(), String> {
    let state = player.media_state()?;
    if state.track.is_none() {
        return Ok(());
    }
    match event {
        MediaControlEvent::Play if state.status != PlaybackStatus::Playing => {
            player.resume(app)?;
        }
        MediaControlEvent::Pause if state.status == PlaybackStatus::Playing => {
            player.pause(app)?;
        }
        MediaControlEvent::Toggle => {
            if state.status == PlaybackStatus::Playing {
                player.pause(app)?;
            } else {
                player.resume(app)?;
            }
        }
        MediaControlEvent::Next => {
            player.next(app)?;
        }
        MediaControlEvent::Previous => {
            player.previous(app)?;
        }
        MediaControlEvent::Stop => {
            player.stop(app)?;
        }
        MediaControlEvent::SetVolume(volume) if volume.is_finite() => {
            player.set_volume(app, (volume.clamp(0.0, 1.0) * 100.0).round() as u8)?;
            if volume > 0.0 {
                player.set_muted(app, false)?;
            }
        }
        event => {
            if let Some(position) = seek_target(&event, state.position_ms, state.duration_ms) {
                player.seek(app, position)?;
            }
            // Raise/Quit/OpenUri are not playback commands. No implicit focus,
            // app termination, library switch, or untrusted URI opening.
        }
    }
    Ok(())
}

fn seek_target(event: &MediaControlEvent, position: f64, total: f64) -> Option<f64> {
    let target = match event {
        MediaControlEvent::SetPosition(position) => position.0.as_secs_f64() * 1000.0,
        MediaControlEvent::Seek(direction) => {
            position + signed_delta(*direction, Duration::from_secs(10))
        }
        MediaControlEvent::SeekBy(direction, delta) => position + signed_delta(*direction, *delta),
        _ => return None,
    };
    Some(target.clamp(0.0, total.max(0.0)))
}

fn signed_delta(direction: SeekDirection, delta: Duration) -> f64 {
    delta.as_secs_f64()
        * if direction == SeekDirection::Forward {
            1000.0
        } else {
            -1000.0
        }
}

fn duration(ms: f64) -> Duration {
    Duration::from_secs_f64(if ms.is_finite() {
        ms.clamp(0.0, 86_400_000.0) / 1000.0
    } else {
        0.0
    })
}

fn prepare_fallback(cache: &Path) -> Result<String, String> {
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let path = cache.join("basis.png");
    if !path.exists() {
        std::fs::write(&path, include_bytes!("../../icons/128x128.png"))
            .map_err(|e| e.to_string())?;
    }
    cover_url(path)
}

fn cached_cover(app: &AppHandle, cache: &Path, key: &str) -> Result<String, String> {
    let active = app
        .state::<AppState>()
        .active_library()?
        .ok_or("No active library")?;
    // Validates the key, dimensions, and byte limit before deriving any path.
    let bytes = read_cached_thumbnail(&active.artwork_cache_dir, key, 256)?.ok_or("No artwork")?;
    let path = cache.join(format!("{key}.png"));
    if !path.exists() {
        let mut reader =
            image::io::Reader::with_format(std::io::Cursor::new(bytes), image::ImageFormat::WebP);
        let mut limits = image::io::Limits::default();
        limits.max_image_width = Some(256);
        limits.max_image_height = Some(256);
        limits.max_alloc = Some(4 * 1024 * 1024);
        reader.limits(limits);
        reader
            .decode()
            .map_err(|e| e.to_string())?
            .save(&path)
            .map_err(|e| e.to_string())?;
        prune_covers(cache, &path);
    }
    cover_url(path)
}

fn prune_covers(cache: &Path, current: &Path) {
    // Only derived, hash-named PNGs owned by this adapter are eligible.
    let Ok(entries) = std::fs::read_dir(cache) else {
        return;
    };
    let mut candidates = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let stem = path.file_stem()?.to_str()?;
            if path == current
                || path.extension()? != "png"
                || stem.len() != 64
                || !stem.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() {
                return None;
            }
            Some((metadata.modified().ok()?, path))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|(modified, _)| *modified);
    let excess = candidates.len().saturating_sub(31);
    for (_, path) in candidates.into_iter().take(excess) {
        let _ = std::fs::remove_file(path);
    }
}

fn cover_url(path: PathBuf) -> Result<String, String> {
    // Souvlaki's Windows backend strips file:// and passes a raw native path to
    // StorageFile; MPRIS instead requires a properly escaped file URI.
    #[cfg(target_os = "windows")]
    {
        Ok(format!("file://{}", path.display()))
    }
    #[cfg(not(target_os = "windows"))]
    {
        reqwest::Url::from_file_path(path)
            .map(|url| url.to_string())
            .map_err(|_| "Invalid artwork path".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_seek_is_bounded_and_nonplayback_events_do_not_seek() {
        assert_eq!(
            seek_target(
                &MediaControlEvent::Seek(SeekDirection::Backward),
                2000.0,
                60000.0
            ),
            Some(0.0)
        );
        assert_eq!(
            seek_target(
                &MediaControlEvent::SetPosition(MediaPosition(Duration::from_secs(90))),
                0.0,
                60000.0
            ),
            Some(60000.0)
        );
        assert_eq!(seek_target(&MediaControlEvent::Raise, 0.0, 60000.0), None);
        assert_eq!(duration(f64::NAN), Duration::ZERO);
    }
}

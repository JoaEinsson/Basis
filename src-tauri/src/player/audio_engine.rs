use std::{path::Path, sync::Mutex, time::Duration};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineStartReason {
    Play,
    Gapless,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineEndReason {
    EndOfStream,
    Interrupted,
    Failed,
}

#[derive(Debug, Clone)]
pub enum AudioEngineEvent {
    TrackStarted {
        duration_ms: f64,
        reason: EngineStartReason,
    },
    TrackEnded {
        reason: EngineEndReason,
    },
    Stopped,
    DurationResolved {
        duration_ms: f64,
    },
    Error {
        message: String,
        recoverable: bool,
    },
    DeviceChanged {
        name: String,
    },
    DeviceLost {
        name: String,
        error: String,
    },
    StateChanged {
        paused: bool,
    },
}

#[derive(Debug, Clone, Copy, Default)]
pub struct AudioEngineState {
    pub active: bool,
    pub paused: bool,
    pub position_ms: f64,
    pub duration_ms: f64,
}

pub trait AudioEngine: Send + Sync {
    fn load_and_play(&self, path: &Path) -> Result<(), String>;
    fn prime_next(&self, path: Option<&Path>) -> Result<(), String>;
    fn play(&self) -> Result<(), String>;
    fn pause(&self) -> Result<(), String>;
    fn stop(&self) -> Result<(), String>;
    fn seek(&self, seconds: f64) -> Result<(), String>;
    fn set_volume(&self, linear: f32) -> Result<(), String>;
    fn state(&self) -> Result<AudioEngineState, String>;
    fn receive_event(&self, timeout: Duration) -> Option<AudioEngineEvent>;
}

pub struct VoxioEngine {
    vox: Mutex<voxio::Vox>,
    events: voxio::VoxEvents,
}

impl VoxioEngine {
    pub fn open() -> Result<Self, String> {
        let (vox, events) = voxio::Vox::new()
            .map_err(|error| format!("Could not initialize the default audio device: {error}"))?;
        Ok(Self {
            vox: Mutex::new(vox),
            events,
        })
    }

    fn vox(&self) -> Result<std::sync::MutexGuard<'_, voxio::Vox>, String> {
        self.vox
            .lock()
            .map_err(|_| "The audio engine is unavailable after an internal failure".to_owned())
    }
}

impl AudioEngine for VoxioEngine {
    fn load_and_play(&self, path: &Path) -> Result<(), String> {
        let path = path
            .to_str()
            .ok_or_else(|| "The audio path cannot be represented for playback".to_owned())?;
        self.vox()?
            .play(path)
            .map_err(|error| format!("Could not play the selected track: {error}"))
    }

    fn prime_next(&self, path: Option<&Path>) -> Result<(), String> {
        let vox = self.vox()?;
        if let Some(path) = path {
            let path = path.to_str().ok_or_else(|| {
                "The next audio path cannot be represented for playback".to_owned()
            })?;
            vox.set_next(path)
                .map_err(|error| format!("Could not prime the next track: {error}"))
        } else {
            vox.clear_next();
            Ok(())
        }
    }

    fn play(&self) -> Result<(), String> {
        self.vox()?.resume();
        Ok(())
    }

    fn pause(&self) -> Result<(), String> {
        self.vox()?.pause();
        Ok(())
    }

    fn stop(&self) -> Result<(), String> {
        self.vox()?.stop();
        Ok(())
    }

    fn seek(&self, seconds: f64) -> Result<(), String> {
        if !seconds.is_finite() {
            return Err("Playback position must be finite".to_owned());
        }
        self.vox()?.seek_to(seconds.max(0.0));
        Ok(())
    }

    fn set_volume(&self, linear: f32) -> Result<(), String> {
        if !linear.is_finite() {
            return Err("Playback volume must be finite".to_owned());
        }
        // Voxio exposes a perceptual control and applies its own square-law taper.
        // Convert the domain-level linear gain back to that input so D43 has one
        // perceptual curve rather than two stacked curves.
        self.vox()?.set_volume(linear.clamp(0.0, 1.0).sqrt());
        Ok(())
    }

    fn state(&self) -> Result<AudioEngineState, String> {
        let vox = self.vox()?;
        Ok(AudioEngineState {
            active: vox.is_active(),
            paused: vox.is_paused(),
            position_ms: vox.position().as_secs_f64() * 1000.0,
            duration_ms: vox.duration().as_secs_f64() * 1000.0,
        })
    }

    fn receive_event(&self, timeout: Duration) -> Option<AudioEngineEvent> {
        self.events.recv_timeout(timeout).and_then(map_event)
    }
}

fn map_event(event: voxio::VoxEvent) -> Option<AudioEngineEvent> {
    match event {
        voxio::VoxEvent::TrackStarted {
            duration, reason, ..
        } => Some(AudioEngineEvent::TrackStarted {
            duration_ms: duration.as_secs_f64() * 1000.0,
            reason: match reason {
                voxio::StartReason::Play => EngineStartReason::Play,
                voxio::StartReason::Gapless => EngineStartReason::Gapless,
            },
        }),
        voxio::VoxEvent::TrackEnded { reason, .. } => Some(AudioEngineEvent::TrackEnded {
            reason: match reason {
                voxio::EndReason::EndOfStream => EngineEndReason::EndOfStream,
                voxio::EndReason::Interrupted => EngineEndReason::Interrupted,
                voxio::EndReason::Failed => EngineEndReason::Failed,
            },
        }),
        voxio::VoxEvent::Stopped => Some(AudioEngineEvent::Stopped),
        voxio::VoxEvent::DurationResolved { duration, .. } => {
            Some(AudioEngineEvent::DurationResolved {
                duration_ms: duration.as_secs_f64() * 1000.0,
            })
        }
        voxio::VoxEvent::Error { error, recoverable } => Some(AudioEngineEvent::Error {
            message: error.to_string(),
            recoverable,
        }),
        voxio::VoxEvent::DeviceChanged { name, .. } => {
            Some(AudioEngineEvent::DeviceChanged { name })
        }
        voxio::VoxEvent::DeviceLost { name, error } => {
            Some(AudioEngineEvent::DeviceLost { name, error })
        }
        voxio::VoxEvent::StateChanged { paused } => Some(AudioEngineEvent::StateChanged { paused }),
        // NextReady is acknowledged synchronously by `set_next`; no domain
        // transition is required. Future non-exhaustive events are ignored
        // until the adapter assigns them explicit semantics.
        voxio::VoxEvent::NextReady { .. } | _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::{path::Path, time::Duration};

    use super::{AudioEngine, AudioEngineEvent, EngineStartReason, VoxioEngine};

    #[test]
    #[ignore = "requires a real system default audio output; run explicitly for the M4 smoke test"]
    fn real_default_device_starts_every_target_codec_fixture() {
        let engine = VoxioEngine::open().expect("the system default audio device must open");
        let fixture_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("the Tauri crate must have a repository parent")
            .join("fixtures/library-a");
        let fixtures = [
            "Loose/one.mp3",
            "Odd Structure/two.flac",
            "Compilation/three.m4a",
            "Codecs/five-alac.m4a",
            "Codecs/six-vorbis.ogg",
            "Café/four.wav",
            "Codecs/seven-opus.opus",
        ];

        for relative_path in fixtures {
            engine
                .load_and_play(&fixture_root.join(relative_path))
                .unwrap_or_else(|error| panic!("{relative_path} could not be submitted: {error}"));
            wait_until_started(&engine, relative_path);
            engine
                .stop()
                .unwrap_or_else(|error| panic!("{relative_path} could not stop: {error}"));
        }
    }

    #[test]
    #[ignore = "requires a real system default audio output; run explicitly for the M4 smoke test"]
    fn real_transport_controls_and_gapless_advance_work() {
        let engine = VoxioEngine::open().expect("the system default audio device must open");
        let fixture_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("the Tauri crate must have a repository parent")
            .join("fixtures/library-a");
        engine
            .load_and_play(&fixture_root.join("Loose/one.mp3"))
            .unwrap();
        wait_until_started(&engine, "Loose/one.mp3");
        engine.set_volume(0.25).unwrap();
        engine.pause().unwrap();
        for _ in 0..10 {
            if engine.state().unwrap().paused {
                break;
            }
            let _ = engine.receive_event(Duration::from_millis(50));
        }
        assert!(engine.state().unwrap().paused, "pause did not settle");
        engine.seek(0.5).unwrap();
        engine
            .prime_next(Some(&fixture_root.join("Odd Structure/two.flac")))
            .unwrap();
        engine.play().unwrap();

        for _ in 0..20 {
            match engine.receive_event(Duration::from_millis(250)) {
                Some(AudioEngineEvent::TrackStarted {
                    reason: EngineStartReason::Gapless,
                    ..
                }) => {
                    engine.stop().unwrap();
                    return;
                }
                Some(AudioEngineEvent::Error { message, .. }) => {
                    panic!("transport/gapless smoke produced an error: {message}")
                }
                Some(_) | None => {}
            }
        }
        panic!("the primed FLAC did not start gaplessly within the smoke-test timeout");
    }

    fn wait_until_started(engine: &VoxioEngine, relative_path: &str) {
        for _ in 0..20 {
            match engine.receive_event(Duration::from_millis(250)) {
                Some(AudioEngineEvent::TrackStarted { .. }) => return,
                Some(AudioEngineEvent::Error { message, .. }) => {
                    panic!("{relative_path} produced a decoder/device error: {message}")
                }
                Some(_) | None => {}
            }
        }
        panic!("{relative_path} did not start within the smoke-test timeout");
    }
}

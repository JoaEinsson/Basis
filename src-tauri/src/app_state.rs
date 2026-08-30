use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

use crate::{
    domain::track::{LibraryStatus, LibrarySummary, ScanProgress},
    index::db::IndexDatabase,
};

#[derive(Clone, Default)]
pub struct AppState {
    inner: Arc<Mutex<Option<ActiveLibrary>>>,
    scan_generation: Arc<AtomicU64>,
}

#[derive(Clone)]
pub struct ActiveLibrary {
    pub root: PathBuf,
    pub database: IndexDatabase,
    pub artwork_cache_dir: PathBuf,
    pub summary: LibrarySummary,
    pub progress: ScanProgress,
}

impl AppState {
    pub fn set_active_library(&self, library: ActiveLibrary) -> Result<(), String> {
        self.scan_generation.fetch_add(1, Ordering::SeqCst);
        let mut guard = self.lock()?;
        *guard = Some(library);
        Ok(())
    }

    pub fn active_library(&self) -> Result<Option<ActiveLibrary>, String> {
        Ok(self.lock()?.clone())
    }

    pub fn begin_scan(&self) -> Result<u64, String> {
        let generation = self.scan_generation.fetch_add(1, Ordering::SeqCst) + 1;
        let mut guard = self.lock()?;
        let library = guard
            .as_mut()
            .ok_or_else(|| "No library is selected".to_owned())?;
        library.summary.status = LibraryStatus::Scanning;
        library.progress = ScanProgress::default();
        Ok(generation)
    }

    pub fn update_progress(
        &self,
        generation: u64,
        progress: ScanProgress,
    ) -> Result<Option<LibrarySummary>, String> {
        if self.scan_generation.load(Ordering::SeqCst) != generation {
            return Ok(None);
        }
        let mut guard = self.lock()?;
        let Some(library) = guard.as_mut() else {
            return Ok(None);
        };
        let complete = progress.complete;
        library.summary.status = if complete {
            LibraryStatus::Ready
        } else {
            LibraryStatus::Scanning
        };
        library.progress = progress;
        if complete {
            library.summary.track_count = ui_count(library.database.track_count()?);
        }
        Ok(Some(library.summary.clone()))
    }

    pub fn mark_failed(&self, generation: u64) -> Result<Option<LibrarySummary>, String> {
        if self.scan_generation.load(Ordering::SeqCst) != generation {
            return Ok(None);
        }
        let mut guard = self.lock()?;
        let Some(library) = guard.as_mut() else {
            return Ok(None);
        };
        library.summary.status = LibraryStatus::Failed;
        Ok(Some(library.summary.clone()))
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Option<ActiveLibrary>>, String> {
        self.inner
            .lock()
            .map_err(|_| "Basis library state is unavailable after an internal failure".to_owned())
    }
}

fn ui_count(count: u64) -> u32 {
    u32::try_from(count).unwrap_or(u32::MAX)
}

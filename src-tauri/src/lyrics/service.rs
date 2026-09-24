use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use lofty::{file::TaggedFileExt, tag::ItemKey};
use reqwest::{blocking::Client, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    domain::{
        lyrics::{
            LyricsCandidate, LyricsDocument, LyricsMatchConfidence, LyricsPreferenceState,
            LyricsResolution, LyricsSearchQuery, LyricsSelection, LyricsSource,
        },
        query::TrackDto,
    },
    portable::{paths::resolve_inside_root, workspace::write_atomic_bytes},
};

use super::{
    lrc::parse_lrc,
    matcher::{
        evaluate_candidate, has_plain_lyrics, has_synced_lyrics, select_remote_match,
        EvaluatedCandidate, LrclibTrack, RemoteMatch,
    },
};

const LRCLIB_BASE_URL: &str = "https://lrclib.net";
const MAX_LYRICS_BYTES: usize = 1024 * 1024;
const REQUEST_INTERVAL: Duration = Duration::from_millis(250);
const PREFERENCE_SCHEMA_VERSION: u32 = 1;
const PROVIDER_CACHE_SCHEMA_VERSION: u32 = 1;
const MAX_PREFERENCE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_PROVIDER_CACHE_BYTES: usize = 8 * 1024 * 1024;
const MAX_PROVIDER_CACHE_ENTRIES: usize = 64;
const MAX_REMOTE_RESULTS: usize = 50;
pub const MAX_OFFSET_MS: i32 = 15_000;

#[derive(Debug, Clone, Deserialize, Serialize)]
struct LyricsPreferenceFile {
    schema_version: u32,
    track_id: Uuid,
    rel_path: String,
    recording: RecordingIdentity,
    offset_ms: i32,
    selected: Option<SelectedLyrics>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct RecordingIdentity {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct SelectedLyrics {
    source: LyricsSource,
    provider_id: u32,
    track_name: String,
    artist_name: String,
    album_name: String,
    duration_seconds: f64,
    document: LyricsDocument,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct ProviderCache {
    schema_version: u32,
    entries: Vec<ProviderCacheEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct ProviderCacheEntry {
    key: String,
    stored_at: i64,
    primary: Option<LrclibTrack>,
    results: Vec<LrclibTrack>,
}

pub struct LyricsService {
    client: Client,
    base_url: String,
    network_gate: Mutex<Option<Instant>>,
    provider_cache_path: PathBuf,
    provider_cache_gate: Mutex<()>,
    prefetch_generation: AtomicU64,
}

impl LyricsService {
    pub fn new(app_data_dir: &Path) -> Result<Self, String> {
        Self::with_paths(
            LRCLIB_BASE_URL,
            app_data_dir.join("basis/lyrics/provider-cache.json"),
        )
    }

    #[cfg(test)]
    fn with_base_url(base_url: &str) -> Result<Self, String> {
        Self::with_paths(
            base_url,
            std::env::temp_dir().join(format!("basis-lyrics-cache-{}.json", Uuid::new_v4())),
        )
    }

    fn with_paths(base_url: &str, provider_cache_path: PathBuf) -> Result<Self, String> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .user_agent(format!(
                "Basis/{} (https://github.com/JoaEinsson/Basis)",
                env!("CARGO_PKG_VERSION")
            ))
            .build()
            .map_err(|error| format!("Could not initialize the lyrics provider: {error}"))?;
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_owned(),
            network_gate: Mutex::new(None),
            provider_cache_path,
            provider_cache_gate: Mutex::new(()),
            prefetch_generation: AtomicU64::new(0),
        })
    }

    pub fn resolve(
        &self,
        root: &Path,
        track: &TrackDto,
        allow_network: bool,
    ) -> Result<LyricsResolution, String> {
        let audio_path = resolve_inside_root(root, &track.rel_path)?;
        let (preference, preference_warning) = match read_preference(root, track) {
            Ok(preference) => (preference, None),
            Err(error) => (
                None,
                Some(format!(
                    "The saved lyric preference was ignored without changing it: {error}"
                )),
            ),
        };
        if let Some(selected) = preference
            .as_ref()
            .and_then(|value| value.selected.as_ref())
        {
            return Ok(decorate_resolution(
                LyricsResolution::found(selected.document.clone()),
                preference.as_ref(),
                preference_warning.as_deref(),
            ));
        }
        if let Some(document) = resolve_local(root, &audio_path, &track.rel_path)? {
            return Ok(decorate_resolution(
                LyricsResolution::found(document),
                preference.as_ref(),
                preference_warning.as_deref(),
            ));
        }
        let cache_key = match automatic_cache_key(track) {
            Ok(key) => key,
            Err(message) => {
                return Ok(decorate_resolution(
                    LyricsResolution::unavailable(message),
                    preference.as_ref(),
                    preference_warning.as_deref(),
                ))
            }
        };
        if let Some(entry) = self.cached_entry(&cache_key)? {
            return self
                .resolve_provider_entry(root, &audio_path, track, entry, true)
                .map(|resolution| {
                    decorate_resolution(
                        resolution,
                        preference.as_ref(),
                        preference_warning.as_deref(),
                    )
                });
        }
        if !allow_network {
            return Ok(decorate_resolution(
                LyricsResolution::unavailable(
                    "Lyrics are not stored locally. Connect to the internet and retry.",
                ),
                preference.as_ref(),
                preference_warning.as_deref(),
            ));
        }
        let entry = self.fetch_automatic(track, None)?;
        let _ = self.store_cache_entry(entry.clone());
        self.resolve_provider_entry(root, &audio_path, track, entry, true)
            .map(|resolution| {
                decorate_resolution(
                    resolution,
                    preference.as_ref(),
                    preference_warning.as_deref(),
                )
            })
    }

    pub fn choose_candidate(
        &self,
        root: &Path,
        track: &TrackDto,
        candidate_id: u32,
    ) -> Result<LyricsResolution, String> {
        let _audio_path = resolve_inside_root(root, &track.rel_path)?;
        let result = match self.cached_candidate(candidate_id)? {
            Some(result) => result,
            None => {
                let endpoint = format!("{}/api/get/{candidate_id}", self.base_url);
                let Some(result) = self.request_json::<LrclibTrack>(&endpoint, &[])? else {
                    return Ok(LyricsResolution::unavailable(
                        "That LRCLIB result is no longer available.",
                    ));
                };
                result
            }
        };
        let Some(document) = document_from_result(&result)? else {
            return Ok(LyricsResolution::unavailable(
                "The selected LRCLIB result does not contain usable lyrics.",
            ));
        };
        let current = read_preference(root, track)?;
        let offset_ms = current.as_ref().map_or(0, |value| value.offset_ms);
        let selected = SelectedLyrics::new(&result, document.clone());
        let preference = preference_file(track, offset_ms, Some(selected));
        write_preference(root, track, &preference)?;
        Ok(LyricsResolution::found(document).with_preference(preference_state(Some(&preference))))
    }

    pub fn search(
        &self,
        root: &Path,
        track: &TrackDto,
        query: LyricsSearchQuery,
    ) -> Result<LyricsResolution, String> {
        let query = validate_manual_query(query)?;
        let key = manual_cache_key(&query)?;
        let results = if let Some(entry) = self.cached_entry(&key)? {
            entry.results
        } else {
            let request = manual_query_parameters(&query);
            let search_endpoint = format!("{}/api/search", self.base_url);
            let mut results = self
                .request_json::<Vec<LrclibTrack>>(&search_endpoint, &request)?
                .unwrap_or_default();
            results.truncate(MAX_REMOTE_RESULTS);
            let _ = self.store_cache_entry(ProviderCacheEntry {
                key,
                stored_at: now_timestamp(),
                primary: None,
                results: results.clone(),
            });
            results
        };
        let mut candidates = results
            .into_iter()
            .filter(|candidate| {
                candidate.instrumental
                    || has_synced_lyrics(candidate)
                    || has_plain_lyrics(candidate)
            })
            .map(|candidate| {
                manual_candidate_from(
                    track,
                    query.duration_seconds.map(|seconds| seconds * 1000.0),
                    candidate,
                )
            })
            .collect::<Vec<_>>();
        candidates.sort_by(|left, right| {
            left.duration_delta_ms
                .cmp(&right.duration_delta_ms)
                .then_with(|| right.has_synced_lyrics.cmp(&left.has_synced_lyrics))
                .then_with(|| left.id.cmp(&right.id))
        });
        let preference = read_preference(root, track)?;
        if candidates.is_empty() {
            return Ok(LyricsResolution::unavailable(
                "No LRCLIB results matched that manual search.",
            )
            .with_preference(preference_state(preference.as_ref())));
        }
        Ok(LyricsResolution {
            document: None,
            candidates,
            message: Some(
                "Manual results are not selected automatically. Confirm the recording you want."
                    .to_owned(),
            ),
            offset_ms: preference.as_ref().map_or(0, |value| value.offset_ms),
            selection: preference.as_ref().and_then(selection_from_preference),
        })
    }

    pub fn set_offset(
        &self,
        root: &Path,
        track: &TrackDto,
        offset_ms: i32,
    ) -> Result<LyricsPreferenceState, String> {
        if !(-MAX_OFFSET_MS..=MAX_OFFSET_MS).contains(&offset_ms) {
            return Err(format!(
                "Lyrics offset must stay between -{} and +{} milliseconds",
                MAX_OFFSET_MS, MAX_OFFSET_MS
            ));
        }
        let existing = read_preference(root, track)?;
        let selected = existing.and_then(|value| value.selected);
        let preference = preference_file(track, offset_ms, selected);
        write_preference(root, track, &preference)?;
        Ok(preference_state(Some(&preference)))
    }

    pub fn clear_selection(
        &self,
        root: &Path,
        track: &TrackDto,
    ) -> Result<LyricsResolution, String> {
        let existing = read_preference(root, track)?;
        let offset_ms = existing.as_ref().map_or(0, |value| value.offset_ms);
        write_preference(root, track, &preference_file(track, offset_ms, None))?;
        self.resolve(root, track, true)
    }

    pub fn begin_prefetch(&self) -> u64 {
        self.prefetch_generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn cancel_prefetch(&self) {
        self.prefetch_generation.fetch_add(1, Ordering::SeqCst);
    }

    pub fn prefetch(&self, root: &Path, track: &TrackDto, generation: u64) -> Result<bool, String> {
        let audio_path = resolve_inside_root(root, &track.rel_path)?;
        if read_preference(root, track)?
            .and_then(|value| value.selected)
            .is_some()
            || resolve_local(root, &audio_path, &track.rel_path)?.is_some()
        {
            return Ok(false);
        }
        let key = automatic_cache_key(track)?;
        if self.cached_entry(&key)?.is_some() {
            return Ok(false);
        }
        let entry = self.fetch_automatic(track, Some(generation))?;
        if !self.prefetch_is_current(generation) {
            return Ok(false);
        }
        self.store_cache_entry(entry)?;
        Ok(true)
    }

    fn fetch_automatic(
        &self,
        track: &TrackDto,
        generation: Option<u64>,
    ) -> Result<ProviderCacheEntry, String> {
        let (title, artist) = automatic_identity(track)?;
        let key = automatic_cache_key(track)?;
        let exact_query = automatic_query_parameters(track, title, artist);
        let get_endpoint = format!("{}/api/get", self.base_url);
        let primary = self.request_json::<LrclibTrack>(&get_endpoint, &exact_query)?;
        self.ensure_prefetch_current(generation)?;
        if matches!(
            select_remote_match(track, primary.clone(), Vec::new()),
            RemoteMatch::Selected(_)
        ) {
            return Ok(ProviderCacheEntry {
                key,
                stored_at: now_timestamp(),
                primary,
                results: Vec::new(),
            });
        }
        let search_endpoint = format!("{}/api/search", self.base_url);
        let search_query = vec![
            ("track_name", title.to_owned()),
            ("artist_name", artist.to_owned()),
        ];
        let mut results =
            match self.request_json::<Vec<LrclibTrack>>(&search_endpoint, &search_query) {
                Ok(results) => results.unwrap_or_default(),
                Err(error) => {
                    if let Some(fallback) = primary.as_ref().filter(|item| {
                        (has_plain_lyrics(item) || item.instrumental)
                            && evaluate_candidate(track, (*item).clone()).is_some()
                    }) {
                        let _ = fallback;
                        return Ok(ProviderCacheEntry {
                            key,
                            stored_at: now_timestamp(),
                            primary,
                            results: Vec::new(),
                        });
                    }
                    return Err(error);
                }
            };
        self.ensure_prefetch_current(generation)?;
        results.truncate(MAX_REMOTE_RESULTS);
        Ok(ProviderCacheEntry {
            key,
            stored_at: now_timestamp(),
            primary,
            results,
        })
    }

    fn resolve_provider_entry(
        &self,
        root: &Path,
        audio_path: &Path,
        track: &TrackDto,
        entry: ProviderCacheEntry,
        persist: bool,
    ) -> Result<LyricsResolution, String> {
        match select_remote_match(track, entry.primary, entry.results) {
            RemoteMatch::Selected(candidate) => {
                self.finish_remote(root, audio_path, track, candidate.record, persist)
            }
            RemoteMatch::Candidates(matching) => Ok(LyricsResolution {
                document: None,
                candidates: matching.into_iter().map(candidate_from).collect(),
                message: Some(
                    "More than one LRCLIB result is plausible. Review the match evidence."
                        .to_owned(),
                ),
                offset_ms: 0,
                selection: None,
            }),
            RemoteMatch::Fallback {
                fallback,
                alternatives,
            } => {
                let mut resolution =
                    self.finish_remote(root, audio_path, track, fallback, persist)?;
                resolution.candidates = alternatives.into_iter().map(candidate_from).collect();
                resolution.message = Some(
                    "Plain lyrics are shown. Synchronized alternatives need confirmation."
                        .to_owned(),
                );
                Ok(resolution)
            }
            RemoteMatch::Unavailable => Ok(LyricsResolution::unavailable(
                "No matching lyrics were found on LRCLIB.",
            )),
        }
    }

    fn finish_remote(
        &self,
        root: &Path,
        audio_path: &Path,
        track: &TrackDto,
        result: LrclibTrack,
        persist: bool,
    ) -> Result<LyricsResolution, String> {
        let Some(document) = document_from_result(&result)? else {
            return Ok(LyricsResolution::unavailable(
                "The matching LRCLIB entry does not contain lyrics.",
            ));
        };
        let mut resolution = LyricsResolution::found(document.clone());
        if persist && document.synced {
            if let Some(contents) = result.synced_lyrics.as_deref() {
                if let Err(error) = persist_synced(root, audio_path, &track.rel_path, contents) {
                    resolution.message = Some(format!(
                        "Lyrics are available, but could not be saved for offline use: {error}"
                    ));
                }
            }
        }
        Ok(resolution)
    }

    fn ensure_prefetch_current(&self, generation: Option<u64>) -> Result<(), String> {
        if generation.is_some_and(|value| !self.prefetch_is_current(value)) {
            return Err("Lyrics prefetch was superseded".to_owned());
        }
        Ok(())
    }

    fn prefetch_is_current(&self, generation: u64) -> bool {
        self.prefetch_generation.load(Ordering::SeqCst) == generation
    }

    fn cached_entry(&self, key: &str) -> Result<Option<ProviderCacheEntry>, String> {
        let _guard = self
            .provider_cache_gate
            .lock()
            .map_err(|_| "The lyric cache is unavailable after an internal failure".to_owned())?;
        Ok(read_provider_cache(&self.provider_cache_path)?
            .entries
            .into_iter()
            .find(|entry| entry.key == key))
    }

    fn cached_candidate(&self, id: u32) -> Result<Option<LrclibTrack>, String> {
        let _guard = self
            .provider_cache_gate
            .lock()
            .map_err(|_| "The lyric cache is unavailable after an internal failure".to_owned())?;
        Ok(read_provider_cache(&self.provider_cache_path)?
            .entries
            .into_iter()
            .flat_map(|entry| entry.primary.into_iter().chain(entry.results))
            .find(|candidate| candidate.id == id))
    }

    fn store_cache_entry(&self, entry: ProviderCacheEntry) -> Result<(), String> {
        let _guard = self
            .provider_cache_gate
            .lock()
            .map_err(|_| "The lyric cache is unavailable after an internal failure".to_owned())?;
        let mut cache = read_provider_cache(&self.provider_cache_path)?;
        cache.entries.retain(|candidate| candidate.key != entry.key);
        cache.entries.push(entry);
        cache.entries.sort_by_key(|candidate| candidate.stored_at);
        while cache.entries.len() > MAX_PROVIDER_CACHE_ENTRIES {
            cache.entries.remove(0);
        }
        write_bounded_provider_cache(&self.provider_cache_path, &mut cache)
    }

    fn request_json<T: DeserializeOwned>(
        &self,
        endpoint: &str,
        query: &[(&str, String)],
    ) -> Result<Option<T>, String> {
        {
            let mut last_started = self.network_gate.lock().map_err(|_| {
                "The lyrics provider is unavailable after an internal failure".to_owned()
            })?;
            if let Some(last) = *last_started {
                let elapsed = last.elapsed();
                if elapsed < REQUEST_INTERVAL {
                    thread::sleep(REQUEST_INTERVAL - elapsed);
                }
            }
            *last_started = Some(Instant::now());
        }

        (|| {
            let response = self
                .client
                .get(endpoint)
                .query(query)
                .send()
                .map_err(|error| format!("LRCLIB request failed: {error}"))?;
            if response.status() == StatusCode::NOT_FOUND {
                return Ok(None);
            }
            if response.status() == StatusCode::TOO_MANY_REQUESTS {
                let retry_after = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or("a short delay");
                return Err(format!(
                    "LRCLIB is rate limiting requests. Retry after {retry_after}."
                ));
            }
            if !response.status().is_success() {
                return Err(format!("LRCLIB returned HTTP status {}", response.status()));
            }
            if response
                .content_length()
                .is_some_and(|length| length > MAX_LYRICS_BYTES as u64)
            {
                return Err("LRCLIB response exceeds the 1 MiB safety limit".to_owned());
            }
            let mut bytes = Vec::new();
            response
                .take((MAX_LYRICS_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|error| format!("Could not read LRCLIB response: {error}"))?;
            if bytes.len() > MAX_LYRICS_BYTES {
                return Err("LRCLIB response exceeds the 1 MiB safety limit".to_owned());
            }
            serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|error| format!("LRCLIB returned invalid data: {error}"))
        })()
    }
}

impl SelectedLyrics {
    fn new(result: &LrclibTrack, document: LyricsDocument) -> Self {
        Self {
            source: LyricsSource::Lrclib,
            provider_id: result.id,
            track_name: result.track_name.clone(),
            artist_name: result.artist_name.clone(),
            album_name: result.album_name.clone(),
            duration_seconds: result.duration,
            document,
        }
    }
}

fn automatic_identity(track: &TrackDto) -> Result<(&str, &str), String> {
    let title = track
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let artist = track
        .artist
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match (title, artist) {
        (Some(title), Some(artist)) => Ok((title, artist)),
        _ => Err("LRCLIB matching requires embedded title and artist metadata.".to_owned()),
    }
}

fn automatic_query_parameters<'a>(
    track: &TrackDto,
    title: &'a str,
    artist: &'a str,
) -> Vec<(&'static str, String)> {
    let mut query = vec![
        ("track_name", title.to_owned()),
        ("artist_name", artist.to_owned()),
    ];
    if let Some(album) = track
        .album
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        query.push(("album_name", album.to_owned()));
    }
    if let Some(duration_ms) = track
        .duration_ms
        .filter(|value| value.is_finite() && *value >= 0.0)
    {
        query.push(("duration", format!("{:.3}", duration_ms / 1000.0)));
    }
    query
}

fn validate_manual_query(mut query: LyricsSearchQuery) -> Result<LyricsSearchQuery, String> {
    query.track_name = bounded_query_value("Track title", query.track_name)?;
    query.artist_name = bounded_query_value("Artist", query.artist_name)?;
    query.album_name = query
        .album_name
        .map(|value| bounded_optional_query_value("Album", value))
        .transpose()?
        .flatten();
    if query
        .duration_seconds
        .is_some_and(|value| !value.is_finite() || !(0.0..=86_400.0).contains(&value))
    {
        return Err("Duration must be between 0 and 86400 seconds".to_owned());
    }
    Ok(query)
}

fn bounded_query_value(label: &str, value: String) -> Result<String, String> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(format!("{label} is required"));
    }
    if value.chars().count() > 256 {
        return Err(format!("{label} exceeds 256 characters"));
    }
    Ok(value)
}

fn bounded_optional_query_value(label: &str, value: String) -> Result<Option<String>, String> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > 256 {
        return Err(format!("{label} exceeds 256 characters"));
    }
    Ok(Some(value))
}

fn manual_query_parameters(query: &LyricsSearchQuery) -> Vec<(&'static str, String)> {
    let mut request = vec![
        ("track_name", query.track_name.clone()),
        ("artist_name", query.artist_name.clone()),
    ];
    if let Some(album) = query.album_name.as_ref() {
        request.push(("album_name", album.clone()));
    }
    request
}

fn automatic_cache_key(track: &TrackDto) -> Result<String, String> {
    let (title, artist) = automatic_identity(track)?;
    cache_key(
        "automatic",
        &serde_json::json!({
            "title": title,
            "artist": artist,
            "album": track.album,
            "durationMs": track.duration_ms,
        }),
    )
}

fn manual_cache_key(query: &LyricsSearchQuery) -> Result<String, String> {
    cache_key("manual", query)
}

fn cache_key(kind: &str, value: &impl Serialize) -> Result<String, String> {
    let serialized = serde_json::to_vec(value)
        .map_err(|error| format!("Could not encode lyrics cache identity: {error}"))?;
    Ok(format!("{kind}:{}", blake3::hash(&serialized).to_hex()))
}

fn now_timestamp() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn read_provider_cache(path: &Path) -> Result<ProviderCache, String> {
    if !path.is_file() {
        return Ok(ProviderCache {
            schema_version: PROVIDER_CACHE_SCHEMA_VERSION,
            entries: Vec::new(),
        });
    }
    let Ok(metadata) = fs::metadata(path) else {
        return Ok(ProviderCache::default());
    };
    if metadata.len() > MAX_PROVIDER_CACHE_BYTES as u64 {
        return Ok(ProviderCache {
            schema_version: PROVIDER_CACHE_SCHEMA_VERSION,
            entries: Vec::new(),
        });
    }
    let Ok(contents) = fs::read(path) else {
        return Ok(ProviderCache::default());
    };
    let Ok(mut cache) = serde_json::from_slice::<ProviderCache>(&contents) else {
        return Ok(ProviderCache {
            schema_version: PROVIDER_CACHE_SCHEMA_VERSION,
            entries: Vec::new(),
        });
    };
    if cache.schema_version != PROVIDER_CACHE_SCHEMA_VERSION {
        cache = ProviderCache {
            schema_version: PROVIDER_CACHE_SCHEMA_VERSION,
            entries: Vec::new(),
        };
    }
    cache.entries.truncate(MAX_PROVIDER_CACHE_ENTRIES);
    Ok(cache)
}

fn write_bounded_provider_cache(path: &Path, cache: &mut ProviderCache) -> Result<(), String> {
    cache.schema_version = PROVIDER_CACHE_SCHEMA_VERSION;
    loop {
        let mut bytes = serde_json::to_vec(cache)
            .map_err(|error| format!("Could not serialize lyric provider cache: {error}"))?;
        if bytes.len() <= MAX_PROVIDER_CACHE_BYTES {
            bytes.push(b'\n');
            return write_atomic_bytes(path, &bytes);
        }
        if cache.entries.is_empty() {
            return Err("A lyric provider result exceeds the cache safety limit".to_owned());
        }
        cache.entries.remove(0);
    }
}

fn preference_file(
    track: &TrackDto,
    offset_ms: i32,
    selected: Option<SelectedLyrics>,
) -> LyricsPreferenceFile {
    LyricsPreferenceFile {
        schema_version: PREFERENCE_SCHEMA_VERSION,
        track_id: track.id,
        rel_path: track.rel_path.clone(),
        recording: recording_identity(track),
        offset_ms,
        selected,
    }
}

fn recording_identity(track: &TrackDto) -> RecordingIdentity {
    RecordingIdentity {
        title: track.title.clone(),
        artist: track.artist.clone(),
        album: track.album.clone(),
        duration_ms: track.duration_ms,
    }
}

fn preference_state(preference: Option<&LyricsPreferenceFile>) -> LyricsPreferenceState {
    LyricsPreferenceState {
        offset_ms: preference.map_or(0, |value| value.offset_ms),
        selection: preference.and_then(selection_from_preference),
    }
}

fn decorate_resolution(
    mut resolution: LyricsResolution,
    preference: Option<&LyricsPreferenceFile>,
    warning: Option<&str>,
) -> LyricsResolution {
    resolution = resolution.with_preference(preference_state(preference));
    if let Some(warning) = warning {
        resolution.message = Some(match resolution.message.take() {
            Some(message) => format!("{message} {warning}"),
            None => warning.to_owned(),
        });
    }
    resolution
}

fn selection_from_preference(preference: &LyricsPreferenceFile) -> Option<LyricsSelection> {
    preference
        .selected
        .as_ref()
        .map(|selected| LyricsSelection {
            source: selected.source,
            provider_id: selected.provider_id,
            track_name: selected.track_name.clone(),
            artist_name: selected.artist_name.clone(),
            album_name: selected.album_name.clone(),
            duration_seconds: selected.duration_seconds,
        })
}

fn read_preference(root: &Path, track: &TrackDto) -> Result<Option<LyricsPreferenceFile>, String> {
    let path = preference_path(root, &track.rel_path)?;
    if !path.is_file() {
        return Ok(None);
    }
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Could not inspect the saved lyric choice: {error}"))?;
    if metadata.len() > MAX_PREFERENCE_BYTES {
        return Err("The saved lyric choice exceeds the safety limit".to_owned());
    }
    let contents = fs::read(&path)
        .map_err(|error| format!("Could not read the saved lyric choice: {error}"))?;
    let preference: LyricsPreferenceFile = serde_json::from_slice(&contents)
        .map_err(|error| format!("The saved lyric choice is invalid: {error}"))?;
    validate_preference(&preference)?;
    if preference.rel_path != track.rel_path || preference.recording != recording_identity(track) {
        return Ok(None);
    }
    Ok(Some(preference))
}

fn validate_preference(preference: &LyricsPreferenceFile) -> Result<(), String> {
    if preference.schema_version != PREFERENCE_SCHEMA_VERSION {
        return Err(format!(
            "Saved lyric choice schema version {} is unsupported",
            preference.schema_version
        ));
    }
    if !(-MAX_OFFSET_MS..=MAX_OFFSET_MS).contains(&preference.offset_ms) {
        return Err("Saved lyric offset is outside the supported range".to_owned());
    }
    if preference.rel_path.len() > 16 * 1024 {
        return Err("Saved lyric track path exceeds the safety limit".to_owned());
    }
    if let Some(selected) = preference.selected.as_ref() {
        if selected.source != LyricsSource::Lrclib
            || selected.track_name.chars().count() > 512
            || selected.artist_name.chars().count() > 512
            || selected.album_name.chars().count() > 512
            || selected.document.lines.len() > 20_000
            || selected
                .document
                .plain_text
                .as_ref()
                .is_some_and(|value| value.len() > MAX_LYRICS_BYTES)
        {
            return Err("Saved lyric selection exceeds the safety limit".to_owned());
        }
    }
    Ok(())
}

fn write_preference(
    root: &Path,
    track: &TrackDto,
    preference: &LyricsPreferenceFile,
) -> Result<(), String> {
    validate_preference(preference)?;
    let path = preference_path(root, &track.rel_path)?;
    let mut bytes = serde_json::to_vec_pretty(preference)
        .map_err(|error| format!("Could not serialize the saved lyric choice: {error}"))?;
    if bytes.len() > MAX_PREFERENCE_BYTES as usize {
        return Err("Saved lyric choice exceeds the safety limit".to_owned());
    }
    bytes.push(b'\n');
    write_atomic_bytes(&path, &bytes)
}

fn preference_path(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let _ = resolve_inside_root(root, rel_path)?;
    let relative = Path::new(rel_path);
    let filename = relative
        .file_name()
        .ok_or_else(|| "Track path has no filename".to_owned())?
        .to_string_lossy();
    let mut path = root.join(".musiclib/lyrics/preferences");
    if let Some(parent) = relative.parent() {
        path.push(parent);
    }
    path.push(format!("{filename}.json"));
    Ok(path)
}

fn manual_candidate_from(
    track: &TrackDto,
    requested_duration_ms: Option<f64>,
    candidate: LrclibTrack,
) -> LyricsCandidate {
    let evaluated = evaluate_candidate(track, candidate.clone());
    let duration_delta_ms = duration_delta(
        requested_duration_ms.or(track.duration_ms),
        candidate.duration,
    );
    let has_synced = has_synced_lyrics(&candidate);
    let mut reasons = evaluated.map(|value| value.reasons).unwrap_or_else(|| {
        vec![
            "Manual search result; metadata was not accepted automatically".to_owned(),
            "Confirm the title, artist, version, and duration before selecting".to_owned(),
        ]
    });
    if candidate.instrumental {
        reasons.push("Marked instrumental by LRCLIB".to_owned());
    }
    LyricsCandidate {
        id: candidate.id,
        track_name: candidate.track_name,
        artist_name: candidate.artist_name,
        album_name: candidate.album_name,
        duration_seconds: candidate.duration,
        has_synced_lyrics: has_synced,
        instrumental: candidate.instrumental,
        confidence: LyricsMatchConfidence::Review,
        duration_delta_ms,
        reasons,
    }
}

fn duration_delta(local_duration_ms: Option<f64>, remote_seconds: f64) -> Option<u32> {
    let local = local_duration_ms.filter(|value| value.is_finite())?;
    if !remote_seconds.is_finite() {
        return None;
    }
    Some(
        (local - remote_seconds * 1000.0)
            .abs()
            .round()
            .min(f64::from(u32::MAX)) as u32,
    )
}

fn resolve_local(
    root: &Path,
    audio_path: &Path,
    rel_path: &str,
) -> Result<Option<LyricsDocument>, String> {
    let sidecar = audio_path.with_extension("lrc");
    if sidecar.is_file() {
        if let Ok(document) = read_document(&sidecar, LyricsSource::Sidecar) {
            return Ok(Some(document));
        }
    }
    if let Some(document) = read_embedded(audio_path) {
        return Ok(Some(document));
    }
    let mirror = portable_lyrics_path(root, rel_path)?;
    if mirror.is_file() {
        if let Ok(document) = read_document(&mirror, LyricsSource::Portable) {
            return Ok(Some(document));
        }
    }
    Ok(None)
}

fn read_document(path: &Path, source: LyricsSource) -> Result<LyricsDocument, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Could not inspect local lyrics: {error}"))?;
    if metadata.len() > MAX_LYRICS_BYTES as u64 {
        return Err("Local lyrics exceed the 1 MiB safety limit".to_owned());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read local lyrics: {error}"))?;
    document_from_text(source, &contents, false)
}

fn read_embedded(audio_path: &Path) -> Option<LyricsDocument> {
    let tagged = lofty::read_from_path(audio_path).ok()?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    if let Some(value) = tag.get_string(ItemKey::Lyrics) {
        if value.len() <= MAX_LYRICS_BYTES {
            if let Ok(document) = document_from_text(LyricsSource::Embedded, value, false) {
                return Some(document);
            }
        }
    }
    let value = tag.get_string(ItemKey::UnsyncLyrics)?;
    if value.len() > MAX_LYRICS_BYTES {
        return None;
    }
    Some(LyricsDocument {
        source: LyricsSource::Embedded,
        synced: false,
        instrumental: false,
        lines: Vec::new(),
        plain_text: Some(value.trim().to_owned()),
    })
}

fn document_from_result(result: &LrclibTrack) -> Result<Option<LyricsDocument>, String> {
    if result.instrumental {
        return Ok(Some(LyricsDocument {
            source: LyricsSource::Lrclib,
            synced: false,
            instrumental: true,
            lines: Vec::new(),
            plain_text: None,
        }));
    }
    if let Some(synced) = result
        .synced_lyrics
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        if let Ok(document) = document_from_text(LyricsSource::Lrclib, synced, false) {
            if document.synced {
                return Ok(Some(document));
            }
        }
    }
    Ok(result
        .plain_lyrics
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|plain| LyricsDocument {
            source: LyricsSource::Lrclib,
            synced: false,
            instrumental: false,
            lines: Vec::new(),
            plain_text: Some(plain.trim().to_owned()),
        }))
}

fn document_from_text(
    source: LyricsSource,
    contents: &str,
    instrumental: bool,
) -> Result<LyricsDocument, String> {
    let lines = parse_lrc(contents)?;
    let synced = !lines.is_empty();
    Ok(LyricsDocument {
        source,
        synced,
        instrumental,
        lines,
        plain_text: (!synced).then(|| contents.trim().to_owned()),
    })
}

fn persist_synced(
    root: &Path,
    audio_path: &Path,
    rel_path: &str,
    contents: &str,
) -> Result<(), String> {
    let sidecar = audio_path.with_extension("lrc");
    if sidecar.is_file() {
        return Ok(());
    }
    let mut bytes = contents.as_bytes().to_vec();
    if !bytes.ends_with(b"\n") {
        bytes.push(b'\n');
    }
    if write_atomic_bytes(&sidecar, &bytes).is_ok() {
        return Ok(());
    }
    let mirror = portable_lyrics_path(root, rel_path)?;
    if mirror.is_file() {
        return Ok(());
    }
    write_atomic_bytes(&mirror, &bytes)
}

fn portable_lyrics_path(root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(rel_path);
    let stem = relative
        .file_stem()
        .ok_or_else(|| "Track path has no filename".to_owned())?;
    let mut path = root.join(".musiclib").join("lyrics");
    if let Some(parent) = relative.parent() {
        path.push(parent);
    }
    path.push(stem);
    path.set_extension("lrc");
    Ok(path)
}

fn candidate_from(candidate: EvaluatedCandidate) -> LyricsCandidate {
    let has_synced_lyrics = has_synced_lyrics(&candidate.record);
    let instrumental = candidate.record.instrumental;
    LyricsCandidate {
        id: candidate.record.id,
        track_name: candidate.record.track_name,
        artist_name: candidate.record.artist_name,
        album_name: candidate.record.album_name,
        duration_seconds: candidate.record.duration,
        has_synced_lyrics,
        instrumental,
        confidence: candidate.confidence,
        duration_delta_ms: candidate.duration_delta_ms,
        reasons: candidate.reasons,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        document_from_result, manual_candidate_from, portable_lyrics_path, preference_path,
        LrclibTrack, LyricsService, ProviderCacheEntry, MAX_OFFSET_MS,
    };
    use crate::domain::{lyrics::LyricsSource, query::TrackDto};
    use uuid::Uuid;

    fn track() -> TrackDto {
        TrackDto {
            id: Uuid::new_v4(),
            rel_path: "Artist/Album/Track.flac".to_owned(),
            title: Some("Café Song".to_owned()),
            artist: Some("The Artist".to_owned()),
            artists: vec!["The Artist".to_owned()],
            album_artist: None,
            album: Some("Album".to_owned()),
            year: None,
            track_no: None,
            disc_no: None,
            genres: Vec::new(),
            composer: None,
            duration_ms: Some(120_000.0),
            codec: None,
            container: None,
            sample_rate: None,
            bit_depth: None,
            channels: None,
            bitrate: None,
            artwork_key: None,
            added_at: 0.0,
            last_played: None,
            play_count: 0,
            favorite: false,
        }
    }

    fn result() -> LrclibTrack {
        LrclibTrack {
            id: 1,
            track_name: "Cafe\u{301} Song".to_owned(),
            artist_name: "the artist".to_owned(),
            album_name: "Album".to_owned(),
            duration: 122.9,
            instrumental: false,
            plain_lyrics: Some("Plain".to_owned()),
            synced_lyrics: Some("[00:01.00]Synced".to_owned()),
        }
    }

    #[test]
    fn synced_provider_result_is_preferred_over_plain_text() {
        let document = document_from_result(&result()).unwrap().unwrap();
        assert_eq!(document.source, LyricsSource::Lrclib);
        assert!(document.synced);
        assert_eq!(document.lines[0].text, "Synced");
    }

    #[test]
    fn local_sidecar_and_portable_mirror_resolve_without_network() {
        let root = std::env::temp_dir().join(format!("basis-lyrics-{}", Uuid::new_v4()));
        let audio = root.join("Artist/Album/Track.flac");
        fs::create_dir_all(audio.parent().unwrap()).unwrap();
        fs::write(&audio, b"not parsed when a sidecar exists").unwrap();
        let sidecar = audio.with_extension("lrc");
        fs::write(&sidecar, b"[00:01.00]Sidecar").unwrap();
        let service = LyricsService::with_base_url("http://127.0.0.1:1").unwrap();

        let sidecar_result = service.resolve(&root, &track(), false).unwrap();
        assert_eq!(
            sidecar_result.document.unwrap().source,
            LyricsSource::Sidecar
        );

        fs::remove_file(sidecar).unwrap();
        let mirror = portable_lyrics_path(&root, "Artist/Album/Track.flac").unwrap();
        fs::create_dir_all(mirror.parent().unwrap()).unwrap();
        fs::write(mirror, b"[00:02.00]Portable").unwrap();
        let portable_result = service.resolve(&root, &track(), false).unwrap();
        assert_eq!(
            portable_result.document.unwrap().source,
            LyricsSource::Portable
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn manual_selection_and_offset_survive_restart_identity_and_index_id_changes() {
        let root = std::env::temp_dir().join(format!("basis-lyrics-choice-{}", Uuid::new_v4()));
        let audio = root.join("Artist/Album/Track.flac");
        fs::create_dir_all(audio.parent().unwrap()).unwrap();
        fs::write(&audio, b"audio fixture").unwrap();
        let service = LyricsService::with_base_url("http://127.0.0.1:1").unwrap();
        service
            .store_cache_entry(ProviderCacheEntry {
                key: "manual:test".to_owned(),
                stored_at: 1,
                primary: None,
                results: vec![result()],
            })
            .unwrap();

        let first_track = track();
        let chosen = service.choose_candidate(&root, &first_track, 1).unwrap();
        assert_eq!(chosen.selection.as_ref().unwrap().provider_id, 1);
        assert_eq!(chosen.document.unwrap().lines[0].text, "Synced");
        assert!(!audio.with_extension("lrc").exists());

        let reindexed_track = track();
        assert_ne!(reindexed_track.id, first_track.id);
        let preference = service.set_offset(&root, &reindexed_track, 1_500).unwrap();
        assert_eq!(preference.offset_ms, 1_500);
        let offline = service.resolve(&root, &reindexed_track, false).unwrap();
        assert_eq!(offline.offset_ms, 1_500);
        assert_eq!(offline.selection.unwrap().provider_id, 1);
        assert_eq!(offline.document.unwrap().lines[0].text, "Synced");
        assert!(preference_path(&root, &first_track.rel_path)
            .unwrap()
            .is_file());

        assert!(service
            .set_offset(&root, &reindexed_track, MAX_OFFSET_MS + 1)
            .is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn malformed_or_newer_portable_preferences_are_not_overwritten() {
        let root = std::env::temp_dir().join(format!("basis-lyrics-invalid-{}", Uuid::new_v4()));
        let audio = root.join("Artist/Album/Track.flac");
        fs::create_dir_all(audio.parent().unwrap()).unwrap();
        fs::write(&audio, b"audio fixture").unwrap();
        let current = track();
        let path = preference_path(&root, &current.rel_path).unwrap();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let original = serde_json::to_vec_pretty(&serde_json::json!({
            "schema_version": 999,
            "track_id": current.id,
            "rel_path": current.rel_path.clone(),
            "recording": {
                "title": current.title.clone(),
                "artist": current.artist.clone(),
                "album": current.album.clone(),
                "duration_ms": current.duration_ms,
            },
            "offset_ms": 0,
            "selected": null,
        }))
        .unwrap();
        fs::write(&path, &original).unwrap();
        let service = LyricsService::with_base_url("http://127.0.0.1:1").unwrap();

        assert!(service.set_offset(&root, &current, 500).is_err());
        let resolution = service.resolve(&root, &current, false).unwrap();
        assert!(resolution
            .message
            .as_deref()
            .is_some_and(|message| message.contains("ignored without changing it")));
        assert_eq!(fs::read(&path).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn manual_search_can_present_a_version_automatic_matching_rejects() {
        let mut live = result();
        live.track_name = "Café Song (Live)".to_owned();
        live.album_name = "Live at Home".to_owned();
        let candidate = manual_candidate_from(&track(), None, live);

        assert_eq!(
            candidate.confidence,
            crate::domain::lyrics::LyricsMatchConfidence::Review
        );
        assert!(candidate.has_synced_lyrics);
        assert!(candidate
            .reasons
            .iter()
            .any(|reason| reason.contains("not accepted automatically")));
    }

    #[test]
    fn disposable_provider_cache_is_bounded_and_recovers_from_invalid_json() {
        let cache =
            std::env::temp_dir().join(format!("basis-provider-cache-{}.json", Uuid::new_v4()));
        let service = LyricsService::with_paths("http://127.0.0.1:1", cache.clone()).unwrap();
        for index in 0..70 {
            service
                .store_cache_entry(ProviderCacheEntry {
                    key: format!("entry:{index}"),
                    stored_at: index,
                    primary: None,
                    results: vec![result()],
                })
                .unwrap();
        }
        assert_eq!(
            super::read_provider_cache(&cache).unwrap().entries.len(),
            64
        );
        fs::write(&cache, b"not json").unwrap();
        assert!(service.cached_entry("entry:69").unwrap().is_none());
        fs::remove_file(cache).unwrap();
    }

    #[test]
    fn prefetched_provider_data_resolves_offline_then_becomes_a_local_sidecar() {
        let root = std::env::temp_dir().join(format!("basis-prefetch-cache-{}", Uuid::new_v4()));
        let audio = root.join("Artist/Album/Track.flac");
        fs::create_dir_all(audio.parent().unwrap()).unwrap();
        fs::write(&audio, b"audio fixture").unwrap();
        let current = track();
        let mut cached = result();
        cached.duration = 120.4;
        cached.synced_lyrics =
            Some("[00:10.00]First\n[00:50.00]Second\n[01:40.00]Third".to_owned());
        let service = LyricsService::with_base_url("http://127.0.0.1:1").unwrap();
        service
            .store_cache_entry(ProviderCacheEntry {
                key: super::automatic_cache_key(&current).unwrap(),
                stored_at: 1,
                primary: Some(cached),
                results: Vec::new(),
            })
            .unwrap();

        let resolved = service.resolve(&root, &current, false).unwrap();
        assert!(resolved.document.unwrap().synced);
        assert!(audio.with_extension("lrc").is_file());
        assert!(!preference_path(&root, &current.rel_path).unwrap().exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stale_prefetch_generations_are_rejected_before_cache_commit() {
        let service = LyricsService::with_base_url("http://127.0.0.1:1").unwrap();
        let first = service.begin_prefetch();
        let second = service.begin_prefetch();
        assert!(!service.prefetch_is_current(first));
        assert!(service.prefetch_is_current(second));
        service.cancel_prefetch();
        assert!(!service.prefetch_is_current(second));
    }
}

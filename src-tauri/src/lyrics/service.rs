use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use lofty::{file::TaggedFileExt, tag::ItemKey};
use reqwest::{blocking::Client, StatusCode};
use serde::de::DeserializeOwned;
use serde::Deserialize;

use crate::{
    domain::{
        lyrics::{LyricsCandidate, LyricsDocument, LyricsResolution, LyricsSource},
        metadata::comparison_key,
        query::TrackDto,
    },
    portable::{paths::resolve_inside_root, workspace::write_atomic_bytes},
};

use super::lrc::parse_lrc;

const LRCLIB_BASE_URL: &str = "https://lrclib.net";
const MAX_LYRICS_BYTES: usize = 1024 * 1024;
const REQUEST_INTERVAL: Duration = Duration::from_millis(250);

pub struct LyricsService {
    client: Client,
    base_url: String,
    network_gate: Mutex<Option<Instant>>,
}

impl LyricsService {
    pub fn new() -> Result<Self, String> {
        Self::with_base_url(LRCLIB_BASE_URL)
    }

    fn with_base_url(base_url: &str) -> Result<Self, String> {
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
        })
    }

    pub fn resolve(
        &self,
        root: &Path,
        track: &TrackDto,
        allow_network: bool,
    ) -> Result<LyricsResolution, String> {
        let audio_path = resolve_inside_root(root, &track.rel_path)?;
        if let Some(document) = resolve_local(root, &audio_path, &track.rel_path)? {
            return Ok(LyricsResolution::found(document));
        }
        if !allow_network {
            return Ok(LyricsResolution::unavailable(
                "Lyrics are not stored locally. Connect to the internet and retry.",
            ));
        }
        self.resolve_remote(root, &audio_path, track)
    }

    pub fn choose_candidate(
        &self,
        root: &Path,
        track: &TrackDto,
        candidate_id: u32,
    ) -> Result<LyricsResolution, String> {
        let audio_path = resolve_inside_root(root, &track.rel_path)?;
        if let Some(document) = resolve_local(root, &audio_path, &track.rel_path)? {
            return Ok(LyricsResolution::found(document));
        }
        let endpoint = format!("{}/api/get/{candidate_id}", self.base_url);
        let Some(result) = self.request_json::<LrclibTrack>(&endpoint, &[])? else {
            return Ok(LyricsResolution::unavailable(
                "That LRCLIB result is no longer available.",
            ));
        };
        if !matches_track(track, &result) {
            return Err("The selected lyric no longer matches this track".to_owned());
        }
        self.finish_remote(root, &audio_path, track, result)
    }

    fn resolve_remote(
        &self,
        root: &Path,
        audio_path: &Path,
        track: &TrackDto,
    ) -> Result<LyricsResolution, String> {
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
        let (Some(title), Some(artist)) = (title, artist) else {
            return Ok(LyricsResolution::unavailable(
                "LRCLIB matching requires embedded title and artist metadata.",
            ));
        };

        let mut query = vec![
            ("track_name", title.to_owned()),
            ("artist_name", artist.to_owned()),
        ];
        if let Some(album) = track
            .album
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            query.push(("album_name", album.to_owned()));
        }
        if let Some(duration_ms) = track.duration_ms.filter(|value| value.is_finite()) {
            query.push(("duration", format!("{:.3}", duration_ms / 1000.0)));
        }

        let get_endpoint = format!("{}/api/get", self.base_url);
        if let Some(result) = self.request_json::<LrclibTrack>(&get_endpoint, &query)? {
            if matches_track(track, &result) {
                return self.finish_remote(root, audio_path, track, result);
            }
        }

        let search_endpoint = format!("{}/api/search", self.base_url);
        let search_query = vec![
            ("track_name", title.to_owned()),
            ("artist_name", artist.to_owned()),
        ];
        let results = self
            .request_json::<Vec<LrclibTrack>>(&search_endpoint, &search_query)?
            .unwrap_or_default();
        let mut matching = results
            .into_iter()
            .filter(|candidate| matches_track(track, candidate))
            .collect::<Vec<_>>();
        prefer_album_match(track, &mut matching);
        if matching.len() == 1 {
            return self.finish_remote(root, audio_path, track, matching.remove(0));
        }
        if matching.is_empty() {
            return Ok(LyricsResolution::unavailable(
                "No matching lyrics were found on LRCLIB.",
            ));
        }
        matching.sort_by_key(|candidate| candidate.synced_lyrics.is_none());
        Ok(LyricsResolution {
            document: None,
            candidates: matching.into_iter().map(candidate_from).collect(),
            message: Some("Choose the matching LRCLIB result.".to_owned()),
        })
    }

    fn finish_remote(
        &self,
        root: &Path,
        audio_path: &Path,
        track: &TrackDto,
        result: LrclibTrack,
    ) -> Result<LyricsResolution, String> {
        let Some(document) = document_from_result(&result)? else {
            return Ok(LyricsResolution::unavailable(
                "The matching LRCLIB entry does not contain lyrics.",
            ));
        };
        let mut resolution = LyricsResolution::found(document.clone());
        if document.synced {
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

    fn request_json<T: DeserializeOwned>(
        &self,
        endpoint: &str,
        query: &[(&str, String)],
    ) -> Result<Option<T>, String> {
        let mut last_completed = self.network_gate.lock().map_err(|_| {
            "The lyrics provider is unavailable after an internal failure".to_owned()
        })?;
        if let Some(last) = *last_completed {
            let elapsed = last.elapsed();
            if elapsed < REQUEST_INTERVAL {
                thread::sleep(REQUEST_INTERVAL - elapsed);
            }
        }

        let result = (|| {
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
        })();
        *last_completed = Some(Instant::now());
        result
    }
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
        let document = document_from_text(LyricsSource::Lrclib, synced, false)?;
        if document.synced {
            return Ok(Some(document));
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

fn matches_track(track: &TrackDto, candidate: &LrclibTrack) -> bool {
    let title_matches = track
        .title
        .as_deref()
        .is_some_and(|title| comparison_key(title) == comparison_key(&candidate.track_name));
    let artist_matches = track
        .artist
        .as_deref()
        .is_some_and(|artist| comparison_key(artist) == comparison_key(&candidate.artist_name));
    let duration_matches = match (track.duration_ms, candidate.duration) {
        (Some(local), remote) if local.is_finite() && remote.is_finite() => {
            (local - remote * 1000.0).abs() <= 3_000.0
        }
        _ => true,
    };
    title_matches && artist_matches && duration_matches
}

fn prefer_album_match(track: &TrackDto, candidates: &mut Vec<LrclibTrack>) {
    let Some(album) = track
        .album
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    else {
        return;
    };
    let album_key = comparison_key(album);
    let matching = candidates
        .iter()
        .filter(|candidate| comparison_key(&candidate.album_name) == album_key)
        .cloned()
        .collect::<Vec<_>>();
    if !matching.is_empty() {
        *candidates = matching;
    }
}

fn candidate_from(candidate: LrclibTrack) -> LyricsCandidate {
    LyricsCandidate {
        id: candidate.id,
        track_name: candidate.track_name,
        artist_name: candidate.artist_name,
        album_name: candidate.album_name,
        duration_seconds: candidate.duration,
        has_synced_lyrics: candidate
            .synced_lyrics
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty()),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibTrack {
    id: u32,
    track_name: String,
    artist_name: String,
    album_name: String,
    duration: f64,
    #[serde(default)]
    instrumental: bool,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{
        document_from_result, matches_track, portable_lyrics_path, LrclibTrack, LyricsService,
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
    fn matching_normalizes_metadata_and_enforces_three_second_duration() {
        assert!(matches_track(&track(), &result()));
        let mut far = result();
        far.duration = 123.1;
        assert!(!matches_track(&track(), &far));
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
}

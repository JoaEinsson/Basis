use std::collections::BTreeSet;

use serde::Deserialize;
use unicode_normalization::UnicodeNormalization;

use crate::domain::{lyrics::LyricsMatchConfidence, query::TrackDto};

use super::lrc::parse_lrc;

const AUTO_DURATION_MS: f64 = 3_000.0;
const REVIEW_DURATION_MS: f64 = 15_000.0;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LrclibTrack {
    pub id: u32,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration: f64,
    #[serde(default)]
    pub instrumental: bool,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct EvaluatedCandidate {
    pub record: LrclibTrack,
    pub confidence: LyricsMatchConfidence,
    pub duration_delta_ms: Option<u32>,
    pub reasons: Vec<String>,
    album_rank: u8,
    release_distance: u8,
    synced_quality: SyncedQuality,
}

#[derive(Debug)]
pub(super) enum RemoteMatch {
    Selected(EvaluatedCandidate),
    Candidates(Vec<EvaluatedCandidate>),
    Fallback {
        fallback: LrclibTrack,
        alternatives: Vec<EvaluatedCandidate>,
    },
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum SyncedQuality {
    None,
    Review,
    Valid,
}

pub(super) fn select_remote_match(
    track: &TrackDto,
    primary: Option<LrclibTrack>,
    mut results: Vec<LrclibTrack>,
) -> RemoteMatch {
    if let Some(primary) = primary.as_ref() {
        if let Some(evaluated) = evaluate_candidate(track, primary.clone()) {
            if evaluated.confidence == LyricsMatchConfidence::High
                && evaluated.synced_quality == SyncedQuality::Valid
            {
                return RemoteMatch::Selected(evaluated);
            }
        }
    }

    if let Some(primary) = primary.clone() {
        results.push(primary);
    }
    results.sort_by_key(|candidate| candidate.id);
    results.dedup_by_key(|candidate| candidate.id);

    let mut evaluated = results
        .into_iter()
        .filter_map(|candidate| evaluate_candidate(track, candidate))
        .collect::<Vec<_>>();
    let mut automatic_synced = evaluated
        .iter()
        .filter(|candidate| {
            candidate.confidence == LyricsMatchConfidence::High
                && candidate.synced_quality == SyncedQuality::Valid
        })
        .cloned()
        .collect::<Vec<_>>();

    if !automatic_synced.is_empty() {
        retain_best_identity_group(&mut automatic_synced);
        if automatic_synced.len() == 1 {
            return RemoteMatch::Selected(automatic_synced.remove(0));
        }
        append_plain_fallback(track, &mut automatic_synced, primary.as_ref());
        return RemoteMatch::Candidates(automatic_synced);
    }

    let mut review_synced = evaluated
        .iter()
        .filter(|candidate| candidate.synced_quality != SyncedQuality::None)
        .cloned()
        .collect::<Vec<_>>();
    review_synced.sort_by(candidate_order);

    if let Some((fallback, evaluated_fallback)) =
        primary.filter(has_plain_lyrics).and_then(|fallback| {
            evaluate_candidate(track, fallback.clone()).map(|evaluated| (fallback, evaluated))
        })
    {
        if review_synced.is_empty() {
            return RemoteMatch::Selected(evaluated_fallback);
        }
        return RemoteMatch::Fallback {
            fallback,
            alternatives: review_synced,
        };
    }

    evaluated.sort_by(candidate_order);
    match evaluated.len() {
        0 => RemoteMatch::Unavailable,
        1 if evaluated[0].confidence == LyricsMatchConfidence::High
            && evaluated[0].synced_quality != SyncedQuality::Review =>
        {
            RemoteMatch::Selected(evaluated.remove(0))
        }
        _ => RemoteMatch::Candidates(evaluated),
    }
}

pub(super) fn evaluate_candidate(
    track: &TrackDto,
    candidate: LrclibTrack,
) -> Option<EvaluatedCandidate> {
    let local_title = SemanticText::new(track.title.as_deref()?);
    let remote_title = SemanticText::new(&candidate.track_name);
    let local_artist = canonical_text(track.artist.as_deref()?);
    let remote_artist = canonical_text(&candidate.artist_name);
    if local_artist.is_empty()
        || local_artist != remote_artist
        || local_title.base.is_empty()
        || local_title.base != remote_title.base
    {
        return None;
    }

    let local_album = track.album.as_deref().map(SemanticText::new);
    let remote_album = SemanticText::new(&candidate.album_name);
    let local_recording = combined_recording_tags(&local_title, local_album.as_ref());
    let remote_recording = combined_recording_tags(&remote_title, Some(&remote_album));
    if local_recording != remote_recording {
        return None;
    }

    let duration_delta = duration_delta_ms(track.duration_ms, candidate.duration);
    if duration_delta.is_some_and(|delta| f64::from(delta) > REVIEW_DURATION_MS) {
        return None;
    }
    let mut confidence = if duration_delta.is_some_and(|delta| f64::from(delta) > AUTO_DURATION_MS)
    {
        LyricsMatchConfidence::Review
    } else {
        LyricsMatchConfidence::High
    };
    let album_rank = album_rank(local_album.as_ref(), &remote_album);
    if local_album.is_some() && album_rank == 0 {
        confidence = LyricsMatchConfidence::Review;
    }
    let local_release = combined_release_tags(&local_title, local_album.as_ref());
    let remote_release = combined_release_tags(&remote_title, Some(&remote_album));
    let release_distance = tag_distance(&local_release, &remote_release);
    let synced_quality = synced_quality(&candidate, track.duration_ms);
    if synced_quality == SyncedQuality::None
        && !has_plain_lyrics(&candidate)
        && !candidate.instrumental
    {
        return None;
    }
    let mut reasons = vec!["Title and artist match".to_owned()];
    match album_rank {
        3 => reasons.push("Album matches after semantic normalization".to_owned()),
        2 => reasons.push("Album base matches; release edition differs".to_owned()),
        1 => reasons.push("Album metadata is incomplete".to_owned()),
        _ => reasons.push("Album differs; confirmation is required".to_owned()),
    }
    if let Some(delta) = duration_delta {
        reasons.push(format!(
            "Duration differs by {:.1} seconds",
            f64::from(delta) / 1000.0
        ));
    }
    match synced_quality {
        SyncedQuality::Valid => reasons.push("Synchronized timing passed validation".to_owned()),
        SyncedQuality::Review => reasons.push("Synchronized timing requires review".to_owned()),
        SyncedQuality::None => reasons.push("Plain lyrics fallback".to_owned()),
    }
    if confidence == LyricsMatchConfidence::Review {
        if duration_delta.is_some_and(|delta| f64::from(delta) > AUTO_DURATION_MS) {
            reasons.push("Automatic duration tolerance was exceeded".to_owned());
        }
        if local_album.is_some() && album_rank == 0 {
            reasons.push("Album identity requires confirmation".to_owned());
        }
    }

    Some(EvaluatedCandidate {
        record: candidate,
        confidence,
        duration_delta_ms: duration_delta,
        reasons,
        album_rank,
        release_distance,
        synced_quality,
    })
}

pub(super) fn has_synced_lyrics(candidate: &LrclibTrack) -> bool {
    candidate
        .synced_lyrics
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
}

pub(super) fn has_plain_lyrics(candidate: &LrclibTrack) -> bool {
    candidate
        .plain_lyrics
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
}

fn retain_best_identity_group(candidates: &mut Vec<EvaluatedCandidate>) {
    let best_album = candidates
        .iter()
        .map(|candidate| candidate.album_rank)
        .max()
        .unwrap_or_default();
    candidates.retain(|candidate| candidate.album_rank == best_album);
    let best_release_distance = candidates
        .iter()
        .map(|candidate| candidate.release_distance)
        .min()
        .unwrap_or_default();
    candidates.retain(|candidate| candidate.release_distance == best_release_distance);
    candidates.sort_by(candidate_order);
}

fn append_plain_fallback(
    track: &TrackDto,
    candidates: &mut Vec<EvaluatedCandidate>,
    primary: Option<&LrclibTrack>,
) {
    let Some(primary) = primary.filter(|candidate| has_plain_lyrics(candidate)) else {
        return;
    };
    if candidates
        .iter()
        .any(|candidate| candidate.record.id == primary.id)
    {
        return;
    }
    if let Some(evaluated) = evaluate_candidate(track, primary.clone()) {
        candidates.push(evaluated);
    }
}

fn candidate_order(left: &EvaluatedCandidate, right: &EvaluatedCandidate) -> std::cmp::Ordering {
    left.confidence
        .cmp(&right.confidence)
        .then_with(|| right.album_rank.cmp(&left.album_rank))
        .then_with(|| left.release_distance.cmp(&right.release_distance))
        .then_with(|| right.synced_quality.cmp(&left.synced_quality))
        .then_with(|| left.duration_delta_ms.cmp(&right.duration_delta_ms))
        .then_with(|| left.record.id.cmp(&right.record.id))
}

fn duration_delta_ms(local_duration_ms: Option<f64>, remote_seconds: f64) -> Option<u32> {
    let local = local_duration_ms.filter(|value| value.is_finite())?;
    if !remote_seconds.is_finite() {
        return None;
    }
    let delta = (local - remote_seconds * 1000.0).abs().round();
    Some(delta.min(f64::from(u32::MAX)) as u32)
}

fn synced_quality(candidate: &LrclibTrack, local_duration_ms: Option<f64>) -> SyncedQuality {
    let Some(contents) = candidate
        .synced_lyrics
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    else {
        return SyncedQuality::None;
    };
    let Ok(lines) = parse_lrc(contents) else {
        return SyncedQuality::None;
    };
    let non_empty = lines
        .iter()
        .filter(|line| !line.text.trim().is_empty())
        .collect::<Vec<_>>();
    if non_empty.len() < 2 {
        return SyncedQuality::Review;
    }
    let suspicious_bursts = non_empty
        .windows(2)
        .filter(|pair| pair[1].timestamp_ms.saturating_sub(pair[0].timestamp_ms) < 250)
        .count();
    if suspicious_bursts > 3 && suspicious_bursts * 5 > non_empty.len() {
        return SyncedQuality::Review;
    }
    let Some(last) = non_empty.last() else {
        return SyncedQuality::Review;
    };
    if let Some(local) = local_duration_ms.filter(|value| value.is_finite() && *value > 0.0) {
        if f64::from(last.timestamp_ms) > local + REVIEW_DURATION_MS {
            return SyncedQuality::Review;
        }
        if f64::from(last.timestamp_ms) / local < 0.30 {
            return SyncedQuality::Review;
        }
    }
    SyncedQuality::Valid
}

#[derive(Debug)]
struct SemanticText {
    full: String,
    base: String,
    recording_tags: BTreeSet<String>,
    release_tags: BTreeSet<String>,
}

impl SemanticText {
    fn new(value: &str) -> Self {
        let full = canonical_text(value);
        let (base_text, qualifier_texts) = split_qualifiers(value);
        let mut recording_tags = BTreeSet::new();
        let mut release_tags = BTreeSet::new();
        let mut recognized = false;
        for qualifier in &qualifier_texts {
            let tags = classify_qualifier(qualifier);
            recognized |= !tags.0.is_empty() || !tags.1.is_empty();
            recording_tags.extend(tags.0);
            release_tags.extend(tags.1);
        }
        let base = if recognized {
            canonical_text(&base_text)
        } else {
            full.clone()
        };
        Self {
            full,
            base,
            recording_tags,
            release_tags,
        }
    }
}

fn canonical_text(value: &str) -> String {
    let normalized = value
        .nfkc()
        .flat_map(char::to_lowercase)
        .collect::<String>();
    let mut words = Vec::new();
    let mut current = String::new();
    for character in normalized.chars() {
        if character.is_alphanumeric() {
            current.push(character);
        } else {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            if character == '&' {
                words.push("and".to_owned());
            }
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    if words
        .first()
        .is_some_and(|word| word.chars().all(|char| char.is_ascii_digit()))
    {
        words.remove(0);
    }
    words.join(" ")
}

fn split_qualifiers(value: &str) -> (String, Vec<String>) {
    let mut base = String::new();
    let mut qualifiers = Vec::new();
    let mut qualifier = String::new();
    let mut depth = 0_u8;
    for character in value.chars() {
        match character {
            '(' | '[' | '{' => {
                if depth > 0 {
                    qualifier.push(character);
                }
                depth = depth.saturating_add(1);
            }
            ')' | ']' | '}' if depth > 0 => {
                depth -= 1;
                if depth == 0 && !qualifier.trim().is_empty() {
                    qualifiers.push(std::mem::take(&mut qualifier));
                } else if depth > 0 {
                    qualifier.push(character);
                }
            }
            _ if depth > 0 => qualifier.push(character),
            _ => base.push(character),
        }
    }
    if !qualifier.trim().is_empty() {
        qualifiers.push(qualifier);
    }
    for separator in [" - ", " – ", " — "] {
        if let Some((prefix, suffix)) = base.rsplit_once(separator) {
            let tags = classify_qualifier(suffix);
            if !tags.0.is_empty() || !tags.1.is_empty() {
                qualifiers.push(suffix.to_owned());
                base = prefix.to_owned();
                break;
            }
        }
    }
    (base.trim().to_owned(), qualifiers)
}

fn classify_qualifier(value: &str) -> (BTreeSet<String>, BTreeSet<String>) {
    let words = canonical_text(value)
        .split_whitespace()
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();
    let mut recording = BTreeSet::new();
    let mut release = BTreeSet::new();
    for tag in [
        "live",
        "acoustic",
        "demo",
        "instrumental",
        "karaoke",
        "redux",
        "unplugged",
        "stripped",
        "bare",
        "nightcore",
        "rerecorded",
    ] {
        if words.contains(tag) {
            recording.insert(tag.to_owned());
        }
    }
    if words.contains("remix") || words.contains("remixed") {
        recording.insert("remix".to_owned());
    }
    if words.contains("radio") && words.contains("edit") {
        recording.insert("radio-edit".to_owned());
    }
    if words.contains("sped") && words.contains("up") {
        recording.insert("sped-up".to_owned());
    }
    if words.contains("slowed") {
        recording.insert("slowed".to_owned());
    }
    for tag in [
        "deluxe",
        "explicit",
        "anniversary",
        "expanded",
        "bonus",
        "exclusive",
        "edition",
        "flac",
    ] {
        if words.contains(tag) {
            release.insert(tag.to_owned());
        }
    }
    if words.contains("remaster") || words.contains("remastered") {
        release.insert("remaster".to_owned());
    }
    if words.contains("hot") && words.contains("topic") {
        release.insert("hot-topic".to_owned());
    }
    if words.contains("best") && words.contains("buy") {
        release.insert("best-buy".to_owned());
    }
    (recording, release)
}

fn combined_recording_tags(title: &SemanticText, album: Option<&SemanticText>) -> BTreeSet<String> {
    let mut tags = title.recording_tags.clone();
    if let Some(album) = album {
        tags.extend(album.recording_tags.iter().cloned());
    }
    tags
}

fn combined_release_tags(title: &SemanticText, album: Option<&SemanticText>) -> BTreeSet<String> {
    let mut tags = title.release_tags.clone();
    if let Some(album) = album {
        tags.extend(album.release_tags.iter().cloned());
    }
    tags
}

fn album_rank(local: Option<&SemanticText>, remote: &SemanticText) -> u8 {
    let Some(local) = local else { return 1 };
    if local.full == remote.full {
        3
    } else if local.base == remote.base {
        2
    } else {
        0
    }
}

fn tag_distance(left: &BTreeSet<String>, right: &BTreeSet<String>) -> u8 {
    u8::try_from(left.symmetric_difference(right).count()).unwrap_or(u8::MAX)
}

#[cfg(test)]
mod tests {
    use super::{evaluate_candidate, select_remote_match, LrclibTrack, RemoteMatch};
    use crate::domain::{lyrics::LyricsMatchConfidence, query::TrackDto};
    use uuid::Uuid;

    const VALID_SYNCED: &str = "[00:10.00]First line\n[00:50.00]Second line\n[01:40.00]Third line";

    fn track() -> TrackDto {
        TrackDto {
            id: Uuid::new_v4(),
            rel_path: "Artist/Album/Track.flac".to_owned(),
            title: Some("Café Song".to_owned()),
            artist: Some("The Artist".to_owned()),
            artists: vec!["The Artist".to_owned()],
            album_artist: None,
            album: Some("Album And More".to_owned()),
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

    fn result(id: u32) -> LrclibTrack {
        LrclibTrack {
            id,
            track_name: "Cafe\u{301} Song".to_owned(),
            artist_name: "the artist".to_owned(),
            album_name: "Album & More".to_owned(),
            duration: 120.4,
            instrumental: false,
            plain_lyrics: Some("Plain".to_owned()),
            synced_lyrics: Some(VALID_SYNCED.to_owned()),
        }
    }

    #[test]
    fn semantic_identity_normalizes_unicode_ampersands_and_track_prefixes() {
        let mut candidate = result(1);
        candidate.track_name = "05. Cafe\u{301} Song [Explicit]".to_owned();
        let evaluated = evaluate_candidate(&track(), candidate).unwrap();
        assert_eq!(evaluated.confidence, LyricsMatchConfidence::High);
        assert_eq!(evaluated.album_rank, 3);
        assert_eq!(evaluated.duration_delta_ms, Some(400));
    }

    #[test]
    fn recording_versions_are_never_crossed_automatically() {
        for title in [
            "Café Song (Acoustic Version)",
            "Café Song (Live)",
            "Café Song (Bare Remix)",
        ] {
            let mut candidate = result(2);
            candidate.track_name = title.to_owned();
            assert!(evaluate_candidate(&track(), candidate).is_none());
        }
    }

    #[test]
    fn duration_outside_automatic_tolerance_is_review_only() {
        let mut plain = result(10);
        plain.synced_lyrics = None;
        plain.duration = 120.0;
        let mut candidate = result(11);
        candidate.duration = 126.0;

        let RemoteMatch::Fallback {
            fallback,
            alternatives,
        } = select_remote_match(&track(), Some(plain), vec![candidate])
        else {
            panic!("expected plain fallback with a review-only alternative")
        };
        assert_eq!(fallback.id, 10);
        assert_eq!(alternatives.len(), 1);
        assert_eq!(alternatives[0].confidence, LyricsMatchConfidence::Review);
    }

    #[test]
    fn malformed_or_sparse_timing_is_not_selected_automatically() {
        let mut plain = result(20);
        plain.synced_lyrics = None;
        let mut sparse = result(21);
        sparse.synced_lyrics = Some("[00:01.00]Only one timestamp".to_owned());

        let RemoteMatch::Fallback { alternatives, .. } =
            select_remote_match(&track(), Some(plain), vec![sparse])
        else {
            panic!("expected a safe plain fallback")
        };
        assert_eq!(alternatives.len(), 1);
        assert!(alternatives[0]
            .reasons
            .iter()
            .any(|reason| reason.contains("requires review")));
    }

    #[test]
    fn ambiguous_equally_safe_results_require_confirmation() {
        let first = result(30);
        let second = result(31);
        let mut plain = result(32);
        plain.synced_lyrics = None;

        let RemoteMatch::Candidates(candidates) =
            select_remote_match(&track(), Some(plain), vec![first, second])
        else {
            panic!("expected multiple candidates")
        };
        assert_eq!(candidates.len(), 3);
        assert_eq!(candidates[0].record.id, 30);
        assert_eq!(candidates[1].record.id, 31);
        assert_eq!(candidates[2].record.id, 32);
    }

    #[test]
    fn real_world_and_ampersand_regression_selects_the_generic_best_match() {
        let mut local = track();
        local.title = Some("To The Stage".to_owned());
        local.artist = Some("Asking Alexandria".to_owned());
        local.artists = vec!["Asking Alexandria".to_owned()];
        local.album = Some("Reckless And Relentless".to_owned());
        local.duration_ms = Some(210_613.0);

        let make = |id, title: &str, album: &str, duration, synced: bool| LrclibTrack {
            id,
            track_name: title.to_owned(),
            artist_name: "Asking Alexandria".to_owned(),
            album_name: album.to_owned(),
            duration,
            instrumental: false,
            plain_lyrics: Some("Plain fallback".to_owned()),
            synced_lyrics: synced.then(|| {
                "[00:10.00]First line\n[01:40.00]Second line\n[03:20.00]Third line".to_owned()
            }),
        };
        let primary = make(
            2_074_586,
            "To The Stage",
            "Reckless And Relentless",
            211.0,
            false,
        );
        let expected = make(
            2_591_022,
            "To The Stage",
            "Reckless & Relentless",
            211.0,
            true,
        );
        let wrong_album = make(
            19_989_022,
            "To The Stage",
            "Stand Up And Scream",
            212.0,
            true,
        );
        let edition = make(
            11_217_261,
            "05. To The Stage [Explicit]",
            "Reckless & Relentless (Hot Topic Exclusive Edition)",
            210.0,
            true,
        );
        let remix = make(
            99,
            "To The Stage (Bare Remix)",
            "Reckless & Relentless",
            211.0,
            true,
        );

        let RemoteMatch::Selected(selected) = select_remote_match(
            &local,
            Some(primary),
            vec![wrong_album, edition, remix, expected],
        ) else {
            panic!("expected one semantically equivalent synchronized match")
        };
        assert_eq!(selected.record.id, 2_591_022);
    }
}

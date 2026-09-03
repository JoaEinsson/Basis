use std::collections::{BTreeMap, BTreeSet};

use unicode_normalization::UnicodeNormalization;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlbumCreditObservation {
    pub rel_path: String,
    pub raw_album_artist: Option<String>,
    pub artists: Vec<String>,
    pub album: Option<String>,
    pub year: Option<i64>,
    pub compilation: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedAlbumIdentity {
    pub rel_path: String,
    pub album_key: Uuid,
    pub album_artist: Option<String>,
}

pub fn comparison_key(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .nfkc()
        .flat_map(char::to_lowercase)
        .collect()
}

pub fn album_key(
    library_id: Uuid,
    rel_path: &str,
    album_artist: Option<&str>,
    primary_artist: Option<&str>,
    album: Option<&str>,
    year: Option<i64>,
    compilation: bool,
) -> Uuid {
    let Some(album) = album else {
        return Uuid::new_v5(
            &library_id,
            format!("unknown-album\0{}", comparison_key(rel_path)).as_bytes(),
        );
    };
    let effective_artist = if compilation {
        "Various Artists"
    } else {
        album_artist.or(primary_artist).unwrap_or_default()
    };
    let identity = format!(
        "{}\0{}\0{}",
        comparison_key(effective_artist),
        comparison_key(album),
        year.map(|value| value.to_string()).unwrap_or_default()
    );
    Uuid::new_v5(&library_id, identity.as_bytes())
}

pub fn artist_key(library_id: Uuid, artist: &str) -> Uuid {
    Uuid::new_v5(
        &library_id,
        format!("artist\0{}", comparison_key(artist)).as_bytes(),
    )
}

pub fn resolve_album_identities(
    library_id: Uuid,
    observations: &[AlbumCreditObservation],
) -> Vec<ResolvedAlbumIdentity> {
    let mut groups = BTreeMap::<(String, Option<i64>, bool), Vec<&AlbumCreditObservation>>::new();
    let mut resolved = Vec::with_capacity(observations.len());

    for observation in observations {
        let Some(album) = observation.album.as_deref() else {
            resolved.push(resolve_individually(library_id, observation));
            continue;
        };
        groups
            .entry((
                comparison_key(album),
                observation.year,
                observation.compilation,
            ))
            .or_default()
            .push(observation);
    }

    for (_, mut group) in groups {
        group.sort_by(|left, right| left.rel_path.cmp(&right.rel_path));
        if group[0].compilation {
            for observation in group {
                resolved.push(resolve_with_credit(
                    library_id,
                    observation,
                    "Various Artists".to_owned(),
                ));
            }
            continue;
        }

        let candidates = group
            .iter()
            .filter_map(|observation| {
                credit_candidate(observation).map(|credit| (*observation, credit))
            })
            .collect::<Vec<_>>();
        let identities = candidates
            .iter()
            .map(|(_, candidate)| candidate.identity.clone())
            .collect::<BTreeSet<_>>();
        let requires_corroboration = candidates
            .iter()
            .any(|(_, candidate)| candidate.requires_corroboration);
        let can_resolve = candidates.len() == group.len()
            && identities.len() == 1
            && (!requires_corroboration || group.len() > 1);

        if can_resolve {
            let display = candidates
                .iter()
                .min_by_key(|(observation, candidate)| {
                    (
                        candidate.requires_corroboration,
                        observation.rel_path.as_str(),
                    )
                })
                .map(|(_, candidate)| candidate.display.clone())
                .unwrap_or_default();
            for observation in group {
                resolved.push(resolve_with_credit(
                    library_id,
                    observation,
                    display.clone(),
                ));
            }
        } else {
            resolved.extend(
                group
                    .into_iter()
                    .map(|observation| resolve_individually(library_id, observation)),
            );
        }
    }

    resolved.sort_by(|left, right| left.rel_path.cmp(&right.rel_path));
    resolved
}

#[derive(Debug)]
struct CreditCandidate {
    display: String,
    identity: String,
    requires_corroboration: bool,
}

fn credit_candidate(observation: &AlbumCreditObservation) -> Option<CreditCandidate> {
    let source = observation
        .raw_album_artist
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| observation.artists.first().map(String::as_str))?;
    let (display, stripped) = strip_trailing_feature(source)
        .map(|base| (base.to_owned(), true))
        .unwrap_or_else(|| (source.trim().to_owned(), false));
    if display.is_empty() {
        return None;
    }
    Some(CreditCandidate {
        identity: comparison_key(&display),
        display,
        requires_corroboration: stripped,
    })
}

fn strip_trailing_feature(value: &str) -> Option<&str> {
    const MARKERS: &[&str] = &[
        " feat. ",
        " feat ",
        " ft. ",
        " ft ",
        " featuring ",
        " (feat. ",
        " (feat ",
        " (ft. ",
        " (ft ",
        " (featuring ",
    ];
    for (index, _) in value.char_indices() {
        let tail = value[index..].to_ascii_lowercase();
        let Some(marker) = MARKERS.iter().find(|marker| tail.starts_with(**marker)) else {
            continue;
        };
        let base = value[..index].trim();
        let suffix = value[index + marker.len()..]
            .trim()
            .trim_end_matches([')', ']']);
        if !base.is_empty() && !suffix.is_empty() {
            return Some(base);
        }
    }
    None
}

fn resolve_with_credit(
    library_id: Uuid,
    observation: &AlbumCreditObservation,
    credit: String,
) -> ResolvedAlbumIdentity {
    ResolvedAlbumIdentity {
        rel_path: observation.rel_path.clone(),
        album_key: album_key(
            library_id,
            &observation.rel_path,
            Some(&credit),
            observation.artists.first().map(String::as_str),
            observation.album.as_deref(),
            observation.year,
            observation.compilation,
        ),
        album_artist: Some(credit),
    }
}

fn resolve_individually(
    library_id: Uuid,
    observation: &AlbumCreditObservation,
) -> ResolvedAlbumIdentity {
    ResolvedAlbumIdentity {
        rel_path: observation.rel_path.clone(),
        album_key: album_key(
            library_id,
            &observation.rel_path,
            observation.raw_album_artist.as_deref(),
            observation.artists.first().map(String::as_str),
            observation.album.as_deref(),
            observation.year,
            observation.compilation,
        ),
        album_artist: observation.raw_album_artist.clone(),
    }
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{album_key, comparison_key, resolve_album_identities, AlbumCreditObservation};

    #[test]
    fn identity_normalization_is_local_and_deterministic() {
        assert_eq!(comparison_key("  Sleep   Token "), "sleep token");
        let library_id = Uuid::new_v4();
        assert_eq!(
            album_key(
                library_id,
                "one.flac",
                Some("SLEEP TOKEN"),
                None,
                Some("Even in Arcadia"),
                Some(2025),
                false,
            ),
            album_key(
                library_id,
                "two.flac",
                Some("Sleep Token"),
                None,
                Some("Even  in Arcadia"),
                Some(2025),
                false,
            )
        );
    }

    #[test]
    fn tracks_without_an_album_never_share_a_pseudo_album() {
        let library_id = Uuid::new_v4();
        let first = album_key(library_id, "one.flac", None, None, None, None, false);
        let second = album_key(library_id, "two.flac", None, None, None, None, false);
        assert_ne!(first, second);
    }

    #[test]
    fn album_credit_projection_handles_structured_featured_ambiguous_and_year_cases() {
        let library_id = Uuid::new_v4();
        let observations = vec![
            observation(
                "Fever/01.flac",
                Some("Bullet For My Valentine"),
                &["Bullet For My Valentine"],
                "Fever",
                2010,
            ),
            observation(
                "Fever/02.flac",
                Some("Bullet For My Valentine ft. Lindemann"),
                &["Bullet For My Valentine ft. Lindemann"],
                "Fever",
                2010,
            ),
            observation(
                "Poison/01.flac",
                None,
                &["Bullet For My Valentine", "Apocalyptica"],
                "The Poison",
                2006,
            ),
            observation("Conflict/a.flac", None, &["Artist A"], "Shared", 2020),
            observation("Conflict/b.flac", None, &["Artist B"], "Shared", 2020),
            observation("Year/a.flac", None, &["Artist A"], "Dated", 2020),
            observation("Year/b.flac", None, &["Artist A"], "Dated", 2021),
        ];

        let resolved = resolve_album_identities(library_id, &observations);
        let find = |path: &str| resolved.iter().find(|item| item.rel_path == path).unwrap();

        assert_eq!(
            find("Fever/01.flac").album_key,
            find("Fever/02.flac").album_key
        );
        assert_eq!(
            find("Fever/02.flac").album_artist.as_deref(),
            Some("Bullet For My Valentine")
        );
        assert_eq!(
            find("Poison/01.flac").album_artist.as_deref(),
            Some("Bullet For My Valentine")
        );
        assert_ne!(
            find("Conflict/a.flac").album_key,
            find("Conflict/b.flac").album_key
        );
        assert_ne!(find("Year/a.flac").album_key, find("Year/b.flac").album_key);
        assert_eq!(
            observations[1].artists,
            vec!["Bullet For My Valentine ft. Lindemann"]
        );
    }

    fn observation(
        rel_path: &str,
        raw_album_artist: Option<&str>,
        artists: &[&str],
        album: &str,
        year: i64,
    ) -> AlbumCreditObservation {
        AlbumCreditObservation {
            rel_path: rel_path.to_owned(),
            raw_album_artist: raw_album_artist.map(str::to_owned),
            artists: artists.iter().map(|value| (*value).to_owned()).collect(),
            album: Some(album.to_owned()),
            year: Some(year),
            compilation: false,
        }
    }
}

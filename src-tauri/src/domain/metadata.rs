use unicode_normalization::UnicodeNormalization;
use uuid::Uuid;

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

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{album_key, comparison_key};

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
}

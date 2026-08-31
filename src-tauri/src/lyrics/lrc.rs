use crate::domain::lyrics::LyricsLine;

const MAX_LYRICS_BYTES: usize = 1024 * 1024;

pub fn parse_lrc(input: &str) -> Result<Vec<LyricsLine>, String> {
    if input.len() > MAX_LYRICS_BYTES {
        return Err("Lyrics exceed the 1 MiB safety limit".to_owned());
    }

    let offset_ms = input
        .lines()
        .find_map(|line| {
            line.trim_end_matches('\r')
                .strip_prefix("[offset:")
                .and_then(|value| value.strip_suffix(']'))
                .and_then(|value| value.parse::<f64>().ok())
        })
        .filter(|value| value.is_finite())
        .unwrap_or(0.0);
    let mut lines = Vec::new();
    for raw_line in input.lines() {
        let line = raw_line.trim_end_matches('\r');
        if line.starts_with("[offset:") {
            continue;
        }

        let mut rest = line;
        let mut timestamps = Vec::new();
        while let Some(value) = rest.strip_prefix('[') {
            let Some(end) = value.find(']') else { break };
            let tag = &value[..end];
            let Some(timestamp) = parse_timestamp(tag) else {
                break;
            };
            timestamps.push(timestamp);
            rest = &value[end + 1..];
        }
        for timestamp_ms in timestamps {
            let adjusted = (timestamp_ms + offset_ms).max(0.0).round();
            if adjusted > f64::from(u32::MAX) {
                continue;
            }
            lines.push(LyricsLine {
                timestamp_ms: adjusted as u32,
                text: rest.trim().to_owned(),
            });
        }
    }
    lines.sort_by_key(|line| line.timestamp_ms);
    Ok(lines)
}

fn parse_timestamp(value: &str) -> Option<f64> {
    let (minutes, seconds) = value.split_once(':')?;
    let minutes = minutes.parse::<f64>().ok()?;
    let seconds = seconds.parse::<f64>().ok()?;
    if !minutes.is_finite()
        || !seconds.is_finite()
        || minutes < 0.0
        || !(0.0..60.0).contains(&seconds)
    {
        return None;
    }
    Some((minutes * 60.0 + seconds) * 1000.0)
}

#[cfg(test)]
mod tests {
    use super::parse_lrc;

    #[test]
    fn parses_multiple_timestamps_offset_and_orders_lines() {
        let parsed = parse_lrc(
            "[ar:Artist]\n[offset:100]\n[00:02.50][00:04.000]Line two\n[00:01.25]Line one",
        )
        .unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].timestamp_ms, 1_350);
        assert_eq!(parsed[0].text, "Line one");
        assert_eq!(parsed[2].timestamp_ms, 4_100);
    }

    #[test]
    fn ignores_metadata_and_rejects_oversized_input() {
        assert!(parse_lrc("[ti:Title]\nplain text").unwrap().is_empty());
        assert!(parse_lrc(&"x".repeat(1024 * 1024 + 1)).is_err());
    }
}

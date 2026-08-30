use std::{
    fs,
    io::{Cursor, Write},
    path::{Path, PathBuf},
};

use image::{
    imageops::FilterType,
    io::{Limits, Reader as ImageReader},
    DynamicImage, ImageOutputFormat,
};
use palette::{FromColor, Oklab, Oklch, Srgb};

const THUMBNAIL_DIMENSIONS: [u32; 4] = [64, 128, 256, 512];
const MAX_DECODED_DIMENSION: u32 = 16_384;
const MAX_DECODED_BYTES: u64 = 256 * 1024 * 1024;

pub fn cache_embedded_artwork(
    bytes: &[u8],
    relative_path: &str,
    file_size: i64,
    mtime_ns: i64,
    cache_dir: &Path,
) -> Result<String, String> {
    let image = decode_sanitized(bytes)?;
    let key = artwork_key(bytes, relative_path, file_size, mtime_ns);
    fs::create_dir_all(cache_dir)
        .map_err(|error| format!("Could not create the artwork cache: {error}"))?;

    for dimension in THUMBNAIL_DIMENSIONS {
        let path = thumbnail_path(cache_dir, &key, dimension);
        if path.exists() {
            continue;
        }
        let thumbnail = image.resize_to_fill(dimension, dimension, FilterType::Lanczos3);
        let mut encoded = Cursor::new(Vec::new());
        thumbnail
            .write_to(&mut encoded, ImageOutputFormat::WebP)
            .map_err(|error| format!("Could not encode a safe artwork thumbnail: {error}"))?;
        write_atomic_bytes(&path, encoded.get_ref())
            .map_err(|error| format!("Could not cache artwork: {error}"))?;
    }

    let accent_path = accent_path(cache_dir, &key);
    if !accent_path.exists() {
        let accent = extract_accent(&image);
        write_atomic_bytes(&accent_path, accent.as_bytes())
            .map_err(|error| format!("Could not cache the artwork accent: {error}"))?;
    }
    Ok(key)
}

pub fn read_cached_accent(cache_dir: &Path, key: &str) -> Result<Option<String>, String> {
    validate_key(key)?;
    let path = accent_path(cache_dir, key);
    if !path.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Could not inspect the artwork accent: {error}"))?;
    if metadata.len() > 128 {
        return Err("Artwork accent cache entry exceeds its safety limit".to_owned());
    }
    let accent = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the artwork accent: {error}"))?;
    crate::theme_engine::registry::canonical_color(accent.trim()).map(Some)
}

pub fn read_cached_thumbnail(
    cache_dir: &Path,
    key: &str,
    dimension: u32,
) -> Result<Option<Vec<u8>>, String> {
    validate_key(key)?;
    if !THUMBNAIL_DIMENSIONS.contains(&dimension) {
        return Err("Artwork thumbnail dimension is not allowed".to_owned());
    }
    let path = thumbnail_path(cache_dir, key, dimension);
    if !path.exists() {
        return Ok(None);
    }
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Could not inspect the artwork thumbnail: {error}"))?;
    if metadata.len() > 4 * 1024 * 1024 {
        return Err("Artwork thumbnail exceeds its safety limit".to_owned());
    }
    fs::read(path)
        .map(Some)
        .map_err(|error| format!("Could not read the artwork thumbnail: {error}"))
}

pub fn thumbnail_path(cache_dir: &Path, key: &str, dimension: u32) -> PathBuf {
    cache_dir.join(format!("{key}-{dimension}.webp"))
}

fn decode_sanitized(bytes: &[u8]) -> Result<DynamicImage, String> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("Artwork format is not recognized: {error}"))?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DECODED_DIMENSION);
    limits.max_image_height = Some(MAX_DECODED_DIMENSION);
    limits.max_alloc = Some(MAX_DECODED_BYTES);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|error| format!("Artwork could not be decoded safely: {error}"))
}

fn artwork_key(bytes: &[u8], relative_path: &str, file_size: i64, mtime_ns: i64) -> String {
    let mut hasher = blake3::Hasher::new();
    hasher.update(relative_path.as_bytes());
    hasher.update(&file_size.to_le_bytes());
    hasher.update(&mtime_ns.to_le_bytes());
    hasher.update(blake3::hash(bytes).as_bytes());
    hasher.finalize().to_hex().to_string()
}

fn extract_accent(image: &DynamicImage) -> String {
    let sample = image
        .resize_to_fill(64, 64, FilterType::Triangle)
        .to_rgba8();
    let mut total_weight = 0.0_f32;
    let mut lightness = 0.0_f32;
    let mut a = 0.0_f32;
    let mut b = 0.0_f32;
    for pixel in sample.pixels() {
        let alpha = f32::from(pixel[3]) / 255.0;
        if alpha <= 0.05 {
            continue;
        }
        let source = Srgb::new(
            f32::from(pixel[0]) / 255.0,
            f32::from(pixel[1]) / 255.0,
            f32::from(pixel[2]) / 255.0,
        )
        .into_linear();
        let lab = Oklab::from_color(source);
        lightness += lab.l * alpha;
        a += lab.a * alpha;
        b += lab.b * alpha;
        total_weight += alpha;
    }
    if total_weight <= f32::EPSILON {
        return "oklch(0.65 0.12 285)".to_owned();
    }
    let average = Oklab::new(lightness / total_weight, a / total_weight, b / total_weight);
    let accent = Oklch::from_color(average);
    let lightness = accent.l.clamp(0.55, 0.74);
    let chroma = accent.chroma.clamp(0.06, 0.22);
    let hue = accent.hue.into_positive_degrees();
    format!("oklch({lightness:.4} {chroma:.4} {hue:.2})")
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Artwork key is invalid".to_owned());
    }
    Ok(())
}

fn accent_path(cache_dir: &Path, key: &str) -> PathBuf {
    cache_dir.join(format!("{key}.accent"))
}

fn write_atomic_bytes(path: &Path, bytes: &[u8]) -> Result<(), std::io::Error> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Artwork cache has no parent",
        )
    })?;
    fs::create_dir_all(parent)?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".basis-artwork-")
        .tempfile_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    temporary
        .persist(path)
        .map_err(|error| error.error)
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use image::{ImageBuffer, ImageOutputFormat, Rgba};

    use super::{cache_embedded_artwork, read_cached_accent, thumbnail_path};

    #[test]
    fn sanitized_artwork_generates_all_webp_sizes_and_a_deterministic_accent() {
        let root = std::env::temp_dir().join(format!("basis-artwork-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let image = ImageBuffer::from_pixel(90, 60, Rgba([220_u8, 45, 90, 255]));
        let mut encoded = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut encoded, ImageOutputFormat::Png)
            .unwrap();

        let first =
            cache_embedded_artwork(encoded.get_ref(), "Album/song.flac", 100, 200, &root).unwrap();
        let second =
            cache_embedded_artwork(encoded.get_ref(), "Album/song.flac", 100, 200, &root).unwrap();
        assert_eq!(first, second);
        for size in [64, 128, 256, 512] {
            let thumbnail = image::open(thumbnail_path(&root, &first, size)).unwrap();
            assert_eq!((thumbnail.width(), thumbnail.height()), (size, size));
        }
        let accent = read_cached_accent(&root, &first).unwrap().unwrap();
        assert!(accent.starts_with("oklch("));
        std::fs::remove_dir_all(root).unwrap();
    }
}

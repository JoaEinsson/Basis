use serde_json::Value;

use crate::domain::theme::{ThemeTokenDescriptor, ThemeTokenKind, ThemeTokenValue};

#[derive(Debug, Clone, Copy)]
enum Validation {
    Color,
    Number { minimum: f64, maximum: f64 },
    Text,
    Boolean,
}

struct Definition {
    id: &'static str,
    label: &'static str,
    category: &'static str,
    validation: Validation,
    default: ThemeTokenValue,
}

pub fn descriptors() -> Vec<ThemeTokenDescriptor> {
    definitions()
        .into_iter()
        .map(|definition| {
            let (kind, minimum, maximum) = match definition.validation {
                Validation::Color => (ThemeTokenKind::Color, None, None),
                Validation::Number { minimum, maximum } => {
                    (ThemeTokenKind::Number, Some(minimum), Some(maximum))
                }
                Validation::Text => (ThemeTokenKind::Text, None, None),
                Validation::Boolean => (ThemeTokenKind::Boolean, None, None),
            };
            ThemeTokenDescriptor {
                id: definition.id.to_owned(),
                label: definition.label.to_owned(),
                category: definition.category.to_owned(),
                kind,
                minimum,
                maximum,
                default_value: definition.default,
            }
        })
        .collect()
}

pub fn hard_defaults() -> std::collections::BTreeMap<String, ThemeTokenValue> {
    definitions()
        .into_iter()
        .map(|definition| (definition.id.to_owned(), definition.default))
        .collect()
}

pub fn is_registered(id: &str) -> bool {
    definitions().iter().any(|definition| definition.id == id)
}

pub fn validate_and_canonicalize(
    id: &str,
    value: &Value,
) -> Result<Option<ThemeTokenValue>, String> {
    let Some(definition) = definitions()
        .into_iter()
        .find(|definition| definition.id == id)
    else {
        validate_unknown_value(value)?;
        return Ok(None);
    };
    let value = match definition.validation {
        Validation::Color => {
            let raw = value
                .as_str()
                .ok_or_else(|| format!("Theme token {id} must be a color string"))?;
            ThemeTokenValue::Text(canonical_color(raw)?)
        }
        Validation::Number { minimum, maximum } => {
            let number = value
                .as_f64()
                .filter(|number| number.is_finite())
                .ok_or_else(|| format!("Theme token {id} must be a finite number"))?;
            if !(minimum..=maximum).contains(&number) {
                return Err(format!(
                    "Theme token {id} must be between {minimum} and {maximum}"
                ));
            }
            ThemeTokenValue::Number(number)
        }
        Validation::Text => {
            let text = value
                .as_str()
                .ok_or_else(|| format!("Theme token {id} must be text"))?;
            validate_safe_text(text)?;
            ThemeTokenValue::Text(text.trim().to_owned())
        }
        Validation::Boolean => ThemeTokenValue::Boolean(
            value
                .as_bool()
                .ok_or_else(|| format!("Theme token {id} must be true or false"))?,
        ),
    };
    Ok(Some(value))
}

pub fn canonical_color(input: &str) -> Result<String, String> {
    let value = input.trim();
    if matches!(value.len(), 7 | 9)
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Ok(value.to_ascii_lowercase());
    }
    let Some(body) = value
        .strip_prefix("oklch(")
        .and_then(|value| value.strip_suffix(')'))
    else {
        return Err("Colors accept only #RRGGBB, #RRGGBBAA, or oklch(...)".to_owned());
    };
    if body.contains(',') {
        return Err("oklch colors use space-separated components".to_owned());
    }
    let parts = body.split_whitespace().collect::<Vec<_>>();
    let slash = parts.iter().position(|part| *part == "/");
    let color_parts = slash.map_or(parts.as_slice(), |index| &parts[..index]);
    if color_parts.len() != 3 {
        return Err("oklch requires lightness, chroma, and hue".to_owned());
    }
    let lightness = parse_percent_or_number(color_parts[0], 0.0, 1.0, 100.0)?;
    let chroma = parse_number(color_parts[1], 0.0, 0.5)?;
    let hue = parse_number(color_parts[2], -360.0, 360.0)?;
    let alpha = if let Some(index) = slash {
        if parts.len() != index + 2 {
            return Err("oklch alpha must follow a single slash".to_owned());
        }
        Some(parse_percent_or_number(parts[index + 1], 0.0, 1.0, 100.0)?)
    } else {
        None
    };
    let mut canonical = format!(
        "oklch({} {} {}",
        compact_number(lightness),
        compact_number(chroma),
        compact_number(hue)
    );
    if let Some(alpha) = alpha {
        canonical.push_str(&format!(" / {}", compact_number(alpha)));
    }
    canonical.push(')');
    Ok(canonical)
}

pub fn safe_on_accent(accent: &str) -> String {
    if let Some(rgb) = parse_hex_rgb(accent) {
        let luminance = relative_luminance(rgb);
        let white_ratio = (1.0 + 0.05) / (luminance + 0.05);
        let black_ratio = (luminance + 0.05) / 0.05;
        return if black_ratio >= white_ratio {
            "#000000".to_owned()
        } else {
            "#ffffff".to_owned()
        };
    }
    let lightness = accent
        .strip_prefix("oklch(")
        .and_then(|body| body.split_whitespace().next())
        .and_then(|part| part.parse::<f64>().ok())
        .unwrap_or(0.5);
    if lightness >= 0.62 {
        "#000000".to_owned()
    } else {
        "#ffffff".to_owned()
    }
}

pub fn contrast_ratio(foreground: &str, background: &str) -> Option<f64> {
    let foreground = relative_luminance(parse_hex_rgb(foreground)?);
    let background = relative_luminance(parse_hex_rgb(background)?);
    let (lighter, darker) = if foreground >= background {
        (foreground, background)
    } else {
        (background, foreground)
    };
    Some((lighter + 0.05) / (darker + 0.05))
}

fn definitions() -> Vec<Definition> {
    let mut result = vec![
        color("color.background.canvas", "Canvas", "Color", "#0c0d10"),
        color("color.background.surface", "Surface", "Color", "#15171c"),
        color("color.background.overlay", "Overlay", "Color", "#1c1f26"),
        color("color.background.input", "Input", "Color", "#15171c"),
        color("color.interaction.hover", "Hover", "Color", "#24262d"),
        color("color.text.primary", "Primary text", "Color", "#f4f5f7"),
        color("color.text.secondary", "Secondary text", "Color", "#a9afbd"),
        color("color.text.tertiary", "Tertiary text", "Color", "#747b8d"),
        color("color.text.disabled", "Disabled text", "Color", "#747b8d"),
        color("color.accent.primary", "Accent", "Color", "#49d9c7"),
        color("color.accent.onAccent", "On accent", "Color", "#0c0d10"),
        color(
            "color.selection.background",
            "Selection",
            "Color",
            "#123734",
        ),
        color(
            "color.selection.foreground",
            "Selection text",
            "Color",
            "#f4f5f7",
        ),
        color("color.border.default", "Border", "Color", "#2d3039"),
        color("color.focus.ring", "Focus ring", "Color", "#a5f4e6"),
        color("color.status.error", "Error", "Color", "#ff9b9b"),
        color("color.favorite", "Favorite", "Color", "#ff87ae"),
        color(
            "color.artwork.fallbackStart",
            "Artwork start",
            "Artwork",
            "#282c38",
        ),
        color(
            "color.artwork.fallbackEnd",
            "Artwork end",
            "Artwork",
            "#161820",
        ),
        text(
            "type.family.ui",
            "UI font",
            "Typography",
            "Inter, ui-sans-serif, system-ui, sans-serif",
        ),
        text(
            "type.family.display",
            "Display font",
            "Typography",
            "Inter, ui-sans-serif, system-ui, sans-serif",
        ),
        text(
            "type.family.mono",
            "Monospace font",
            "Typography",
            "ui-monospace, monospace",
        ),
        number(
            "type.weight.regular",
            "Regular weight",
            "Typography",
            400.0,
            100.0,
            900.0,
        ),
        number(
            "type.weight.medium",
            "Medium weight",
            "Typography",
            560.0,
            100.0,
            900.0,
        ),
        number(
            "type.weight.semibold",
            "Semibold weight",
            "Typography",
            680.0,
            100.0,
            900.0,
        ),
        number(
            "type.size.caption",
            "Caption size",
            "Typography",
            11.5,
            8.0,
            32.0,
        ),
        number(
            "type.size.bodySmall",
            "Small body size",
            "Typography",
            13.5,
            8.0,
            40.0,
        ),
        number("type.size.body", "Body size", "Typography", 15.2, 8.0, 48.0),
        number(
            "type.size.bodyLarge",
            "Large body size",
            "Typography",
            18.4,
            10.0,
            64.0,
        ),
        number(
            "type.size.title",
            "Title size",
            "Typography",
            36.0,
            16.0,
            72.0,
        ),
        number(
            "type.size.display",
            "Display size",
            "Typography",
            64.0,
            20.0,
            96.0,
        ),
        number(
            "type.lineHeight.body",
            "Body line height",
            "Typography",
            1.5,
            0.8,
            2.5,
        ),
        number(
            "type.letterSpacing.kicker",
            "Kicker spacing",
            "Typography",
            0.09,
            0.0,
            0.3,
        ),
        number(
            "type.scale",
            "Typography scale",
            "Typography",
            1.0,
            0.8,
            1.4,
        ),
        number("density.scale", "Density", "Density", 1.0, 0.75, 1.5),
        number(
            "density.trackRowHeight",
            "Track row height",
            "Density",
            54.0,
            28.0,
            72.0,
        ),
        number(
            "density.controlHeight",
            "Control height",
            "Density",
            36.0,
            28.0,
            72.0,
        ),
        number(
            "density.sidebarItemHeight",
            "Legacy sidebar item height",
            "Density",
            40.0,
            28.0,
            72.0,
        ),
        number(
            "shape.radius.control",
            "Control radius",
            "Shape",
            7.0,
            0.0,
            64.0,
        ),
        number(
            "shape.radius.surface",
            "Surface radius",
            "Shape",
            12.0,
            0.0,
            64.0,
        ),
        number(
            "shape.radius.artwork",
            "Artwork radius",
            "Shape",
            6.0,
            0.0,
            64.0,
        ),
        number(
            "shape.radius.pill",
            "Pill radius",
            "Shape",
            999.0,
            0.0,
            999.0,
        ),
        number("stroke.thin", "Thin stroke", "Shape", 1.0, 0.0, 4.0),
        text(
            "elevation.surface",
            "Surface elevation",
            "Effects",
            "0 18px 50px #0000004d",
        ),
        number(
            "effects.backdropBlur",
            "Backdrop blur",
            "Effects",
            18.0,
            0.0,
            40.0,
        ),
        number(
            "effects.surfaceOpacity",
            "Surface opacity",
            "Effects",
            1.0,
            0.4,
            1.0,
        ),
        number(
            "effects.artworkSaturation",
            "Artwork saturation",
            "Artwork",
            1.0,
            0.0,
            2.0,
        ),
        number(
            "effects.artworkBrightness",
            "Artwork brightness",
            "Artwork",
            1.0,
            0.5,
            1.5,
        ),
        number(
            "effects.ambientGlowStrength",
            "Ambient glow",
            "Effects",
            0.0,
            0.0,
            1.0,
        ),
        number(
            "effects.hoverScale",
            "Hover scale",
            "Effects",
            1.0,
            0.9,
            1.1,
        ),
        number(
            "effects.disabledOpacity",
            "Disabled opacity",
            "Effects",
            0.48,
            0.4,
            1.0,
        ),
        number(
            "motion.duration.fast",
            "Fast motion",
            "Motion",
            120.0,
            0.0,
            1000.0,
        ),
        number(
            "motion.duration.normal",
            "Normal motion",
            "Motion",
            190.0,
            0.0,
            1000.0,
        ),
        text(
            "motion.easing.standard",
            "Standard easing",
            "Motion",
            "ease",
        ),
        boolean(
            "motion.reduceWhenOsRequestsReducedMotion",
            "Reduce with OS",
            "Motion",
            true,
        ),
        number(
            "layout.sidebarWidth",
            "Legacy sidebar width",
            "Layout",
            260.0,
            180.0,
            420.0,
        ),
        number(
            "layout.sidebarCompactWidth",
            "Legacy compact sidebar",
            "Layout",
            72.0,
            40.0,
            120.0,
        ),
        number(
            "layout.playerBarHeight",
            "Player height",
            "Layout",
            84.0,
            52.0,
            160.0,
        ),
        number(
            "layout.contentMaxWidth",
            "Content maximum",
            "Layout",
            1600.0,
            640.0,
            2400.0,
        ),
        number(
            "layout.gridMinCardWidth",
            "Grid minimum",
            "Layout",
            160.0,
            96.0,
            480.0,
        ),
        number("layout.gridGap", "Grid gap", "Layout", 20.0, 0.0, 64.0),
        number(
            "layout.artworkHeroSize",
            "Hero artwork",
            "Layout",
            384.0,
            160.0,
            800.0,
        ),
    ];
    result.extend([
        color(
            "color.background.surfaceRaised",
            "Raised surface",
            "Color · Surfaces",
            "#1c1f26",
        ),
        color(
            "color.background.surfaceSunken",
            "Sunken surface",
            "Color · Surfaces",
            "#090a0c",
        ),
        color(
            "color.background.sidebar",
            "Legacy sidebar",
            "Color · Surfaces",
            "#15171c",
        ),
        color(
            "color.background.player",
            "Player",
            "Color · Surfaces",
            "#15171c",
        ),
        color(
            "color.background.titlebar",
            "Titlebar",
            "Color · Surfaces",
            "#15171c",
        ),
        color(
            "color.background.menu",
            "Menu",
            "Color · Surfaces",
            "#1c1f26",
        ),
        color(
            "color.background.tooltip",
            "Tooltip",
            "Color · Surfaces",
            "#24262d",
        ),
        color(
            "color.background.scrim",
            "Modal scrim",
            "Color · Surfaces",
            "#00000099",
        ),
        color(
            "color.interaction.pressed",
            "Pressed",
            "Color · Interaction",
            "#123734",
        ),
        color(
            "color.interaction.dragInsertion",
            "Drag insertion",
            "Color · Interaction",
            "#49d9c7",
        ),
        color(
            "color.windowControl.hover",
            "Window control hover",
            "Color · Window",
            "#24262d",
        ),
        color(
            "color.windowControl.closeHover",
            "Close control hover",
            "Color · Window",
            "#c42b1c",
        ),
        color(
            "color.windowControl.closeForeground",
            "Close control foreground",
            "Color · Window",
            "#ffffff",
        ),
        color(
            "color.text.inverse",
            "Inverse text",
            "Color · Text",
            "#0c0d10",
        ),
        color(
            "color.icon.primary",
            "Primary icon",
            "Color · Text",
            "#f4f5f7",
        ),
        color(
            "color.icon.secondary",
            "Secondary icon",
            "Color · Text",
            "#a9afbd",
        ),
        color(
            "color.icon.disabled",
            "Disabled icon",
            "Color · Text",
            "#747b8d",
        ),
        color(
            "color.border.subtle",
            "Subtle border",
            "Color · Borders",
            "#23262d",
        ),
        color(
            "color.border.strong",
            "Strong border",
            "Color · Borders",
            "#474b56",
        ),
        color(
            "color.border.menu",
            "Menu border",
            "Color · Borders",
            "#3a3d46",
        ),
        color("color.divider", "Divider", "Color · Borders", "#2d3039"),
        color(
            "color.accent.hover",
            "Accent hover",
            "Color · Accent",
            "#5de1d0",
        ),
        color(
            "color.accent.active",
            "Accent active",
            "Color · Accent",
            "#20afc8",
        ),
        color(
            "color.accent.muted",
            "Muted accent",
            "Color · Accent",
            "#123734",
        ),
        color(
            "color.status.success",
            "Success",
            "Color · Status",
            "#73d69a",
        ),
        color(
            "color.status.onSuccess",
            "On success",
            "Color · Status",
            "#071a0f",
        ),
        color(
            "color.status.warning",
            "Warning",
            "Color · Status",
            "#f1c75b",
        ),
        color(
            "color.status.onWarning",
            "On warning",
            "Color · Status",
            "#201700",
        ),
        color(
            "color.status.onError",
            "On error",
            "Color · Status",
            "#240606",
        ),
        color(
            "color.status.info",
            "Information",
            "Color · Status",
            "#7ec7ff",
        ),
        color(
            "color.status.onInfo",
            "On information",
            "Color · Status",
            "#061725",
        ),
        color(
            "color.player.progress",
            "Player progress",
            "Color · Music",
            "#49d9c7",
        ),
        color(
            "color.player.progressTrack",
            "Progress track",
            "Color · Music",
            "#3a3d46",
        ),
        color(
            "color.player.buffered",
            "Buffered progress",
            "Color · Music",
            "#666b78",
        ),
        color(
            "color.waveform.active",
            "Active waveform",
            "Color · Music",
            "#49d9c7",
        ),
        color(
            "color.waveform.inactive",
            "Inactive waveform",
            "Color · Music",
            "#4d515d",
        ),
        color("color.lyrics.active", "Active lyric", "Lyrics", "#f4f5f7"),
        color("color.lyrics.past", "Past lyric", "Lyrics", "#747b8d"),
        color(
            "color.lyrics.upcoming",
            "Upcoming lyric",
            "Lyrics",
            "#a9afbd",
        ),
        color(
            "color.lyrics.translation",
            "Lyric translation",
            "Lyrics",
            "#8b91a0",
        ),
        number(
            "type.weight.bold",
            "Bold weight",
            "Typography",
            760.0,
            100.0,
            900.0,
        ),
        number(
            "type.size.subtitle",
            "Subtitle size",
            "Typography",
            22.0,
            10.0,
            72.0,
        ),
        number(
            "type.lineHeight.caption",
            "Caption line height",
            "Typography",
            1.35,
            0.8,
            2.5,
        ),
        number(
            "type.lineHeight.bodySmall",
            "Small body line height",
            "Typography",
            1.45,
            0.8,
            2.5,
        ),
        number(
            "type.lineHeight.bodyLarge",
            "Large body line height",
            "Typography",
            1.4,
            0.8,
            2.5,
        ),
        number(
            "type.lineHeight.subtitle",
            "Subtitle line height",
            "Typography",
            1.25,
            0.8,
            2.5,
        ),
        number(
            "type.lineHeight.title",
            "Title line height",
            "Typography",
            1.12,
            0.8,
            2.5,
        ),
        number(
            "type.lineHeight.display",
            "Display line height",
            "Typography",
            1.05,
            0.8,
            2.5,
        ),
        number(
            "type.letterSpacing.caption",
            "Caption spacing",
            "Typography",
            0.01,
            -0.1,
            0.3,
        ),
        number(
            "type.letterSpacing.body",
            "Body spacing",
            "Typography",
            0.0,
            -0.1,
            0.3,
        ),
        number(
            "type.letterSpacing.subtitle",
            "Subtitle spacing",
            "Typography",
            -0.01,
            -0.1,
            0.3,
        ),
        number(
            "type.letterSpacing.title",
            "Title spacing",
            "Typography",
            -0.02,
            -0.1,
            0.3,
        ),
        number(
            "type.letterSpacing.display",
            "Display spacing",
            "Typography",
            -0.025,
            -0.1,
            0.3,
        ),
        number("shape.radius.none", "No radius", "Shape", 0.0, 0.0, 0.0),
        number(
            "shape.radius.xs",
            "Extra-small radius",
            "Shape",
            2.0,
            0.0,
            64.0,
        ),
        number("shape.radius.sm", "Small radius", "Shape", 4.0, 0.0, 64.0),
        number("shape.radius.md", "Medium radius", "Shape", 8.0, 0.0, 64.0),
        number("shape.radius.lg", "Large radius", "Shape", 12.0, 0.0, 64.0),
        number(
            "shape.radius.xl",
            "Extra-large radius",
            "Shape",
            18.0,
            0.0,
            64.0,
        ),
        number(
            "shape.radius.2xl",
            "Double-extra-large radius",
            "Shape",
            28.0,
            0.0,
            64.0,
        ),
        number("shape.radius.card", "Card radius", "Shape", 10.0, 0.0, 64.0),
        number("stroke.strong", "Strong stroke", "Shape", 2.0, 0.0, 8.0),
        text("elevation.0", "Elevation 0", "Effects", "none"),
        text(
            "elevation.1",
            "Elevation 1",
            "Effects",
            "0 2px 8px #00000024",
        ),
        text(
            "elevation.2",
            "Elevation 2",
            "Effects",
            "0 8px 22px #00000033",
        ),
        text(
            "elevation.3",
            "Elevation 3",
            "Effects",
            "0 14px 36px #00000040",
        ),
        text(
            "elevation.4",
            "Elevation 4",
            "Effects",
            "0 24px 64px #00000059",
        ),
        text(
            "effects.artworkShadow",
            "Artwork shadow",
            "Artwork",
            "0 12px 36px #0000004d",
        ),
        number(
            "motion.duration.instant",
            "Instant motion",
            "Motion",
            0.0,
            0.0,
            1000.0,
        ),
        number(
            "motion.duration.slow",
            "Slow motion",
            "Motion",
            320.0,
            0.0,
            1000.0,
        ),
        number(
            "motion.duration.route",
            "Route motion",
            "Motion",
            240.0,
            0.0,
            1000.0,
        ),
        number(
            "motion.duration.overlay",
            "Overlay motion",
            "Motion",
            180.0,
            0.0,
            1000.0,
        ),
        number(
            "motion.duration.sharedArtwork",
            "Shared artwork motion",
            "Motion",
            320.0,
            0.0,
            1000.0,
        ),
        number(
            "motion.duration.dragSettlement",
            "Drag settlement",
            "Motion",
            180.0,
            0.0,
            1000.0,
        ),
        number(
            "motion.delay.staggerStep",
            "Short-list stagger step",
            "Motion",
            24.0,
            0.0,
            120.0,
        ),
        text(
            "motion.easing.emphasized",
            "Emphasized easing",
            "Motion",
            "cubic-bezier(0.2, 0, 0, 1)",
        ),
        text(
            "motion.easing.exit",
            "Exit easing",
            "Motion",
            "cubic-bezier(0.4, 0, 1, 1)",
        ),
        text(
            "motion.easing.springSoft",
            "Soft spring easing",
            "Motion",
            "cubic-bezier(0.22, 1, 0.36, 1)",
        ),
        text(
            "motion.easing.springFirm",
            "Firm spring easing",
            "Motion",
            "cubic-bezier(0.16, 1, 0.3, 1)",
        ),
        number(
            "motion.distance.route",
            "Route distance",
            "Motion",
            18.0,
            0.0,
            64.0,
        ),
        number(
            "motion.distance.overlay",
            "Overlay distance",
            "Motion",
            8.0,
            0.0,
            48.0,
        ),
        number(
            "motion.distance.dragLift",
            "Drag lift",
            "Motion",
            4.0,
            0.0,
            24.0,
        ),
        number(
            "motion.scale.pressed",
            "Pressed scale",
            "Motion",
            0.97,
            0.8,
            1.0,
        ),
        number(
            "motion.scale.popoverFrom",
            "Popover entry scale",
            "Motion",
            0.98,
            0.8,
            1.0,
        ),
        number(
            "motion.scale.artworkHover",
            "Artwork hover scale",
            "Motion",
            1.025,
            1.0,
            1.12,
        ),
        number(
            "component.albumCard.radius",
            "Album card radius",
            "Components",
            10.0,
            0.0,
            64.0,
        ),
        number(
            "component.albumCard.borderWidth",
            "Album card border",
            "Components",
            0.0,
            0.0,
            4.0,
        ),
        number(
            "component.albumCard.hoverLift",
            "Album card hover lift",
            "Components",
            0.0,
            0.0,
            16.0,
        ),
        number(
            "component.sidebar.activeIndicatorWidth",
            "Legacy sidebar indicator",
            "Components",
            3.0,
            0.0,
            12.0,
        ),
        number(
            "component.trackRow.stripedOpacity",
            "Track stripe opacity",
            "Components",
            0.0,
            0.0,
            0.5,
        ),
        number(
            "component.nowPlaying.surfaceOpacity",
            "Now Playing opacity",
            "Components",
            1.0,
            0.4,
            1.0,
        ),
        number(
            "component.lyrics.activeScale",
            "Active lyric scale",
            "Lyrics",
            1.04,
            0.8,
            1.4,
        ),
        number(
            "component.lyrics.inactiveOpacity",
            "Inactive lyric opacity",
            "Lyrics",
            0.62,
            0.4,
            1.0,
        ),
    ]);
    for (id, label, default) in [
        ("space.1", "Space 1", 4.0),
        ("space.2", "Space 2", 8.0),
        ("space.3", "Space 3", 12.0),
        ("space.4", "Space 4", 16.0),
        ("space.5", "Space 5", 20.0),
        ("space.6", "Space 6", 24.0),
        ("space.7", "Space 7", 32.0),
        ("space.8", "Space 8", 40.0),
        ("space.9", "Space 9", 48.0),
        ("space.10", "Space 10", 56.0),
        ("space.11", "Space 11", 64.0),
        ("space.12", "Space 12", 72.0),
    ] {
        result.push(number(id, label, "Spacing", default, 0.0, 96.0));
    }
    result
}

fn color(
    id: &'static str,
    label: &'static str,
    category: &'static str,
    default: &str,
) -> Definition {
    Definition {
        id,
        label,
        category,
        validation: Validation::Color,
        default: ThemeTokenValue::Text(default.to_owned()),
    }
}

fn number(
    id: &'static str,
    label: &'static str,
    category: &'static str,
    default: f64,
    minimum: f64,
    maximum: f64,
) -> Definition {
    Definition {
        id,
        label,
        category,
        validation: Validation::Number { minimum, maximum },
        default: ThemeTokenValue::Number(default),
    }
}

fn text(
    id: &'static str,
    label: &'static str,
    category: &'static str,
    default: &str,
) -> Definition {
    Definition {
        id,
        label,
        category,
        validation: Validation::Text,
        default: ThemeTokenValue::Text(default.to_owned()),
    }
}

fn boolean(
    id: &'static str,
    label: &'static str,
    category: &'static str,
    default: bool,
) -> Definition {
    Definition {
        id,
        label,
        category,
        validation: Validation::Boolean,
        default: ThemeTokenValue::Boolean(default),
    }
}

fn validate_unknown_value(value: &Value) -> Result<(), String> {
    let encoded = serde_json::to_string(value)
        .map_err(|error| format!("Unknown theme value is not serializable: {error}"))?;
    if encoded.len() > 16 * 1024 {
        return Err("Unknown theme token exceeds the safety limit".to_owned());
    }
    validate_safe_json_value(value)
}

fn validate_safe_json_value(value: &Value) -> Result<(), String> {
    match value {
        Value::String(value) => {
            if contains_forbidden_content(value) {
                return Err("Theme token contains executable or remote content".to_owned());
            }
        }
        Value::Array(values) => {
            for value in values {
                validate_safe_json_value(value)?;
            }
        }
        Value::Object(values) => {
            for (key, value) in values {
                if contains_forbidden_content(key) {
                    return Err("Theme token contains an unsafe property name".to_owned());
                }
                validate_safe_json_value(value)?;
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
    Ok(())
}

fn validate_safe_text(text: &str) -> Result<(), String> {
    if text.is_empty() || text.len() > 16 * 1024 || contains_forbidden_content(text) {
        return Err("Theme text is empty, too long, or contains unsafe CSS content".to_owned());
    }
    Ok(())
}

fn contains_forbidden_content(text: &str) -> bool {
    let normalized = text.to_ascii_lowercase();
    normalized.contains("url(")
        || normalized.contains("http://")
        || normalized.contains("https://")
        || normalized.contains("javascript:")
        || normalized.contains("file://")
        || normalized.contains("<script")
        || text.contains('/')
        || text.contains('\\')
        || text.contains(';')
        || text.contains('{')
        || text.contains('}')
        || text.contains('\n')
        || text.contains('\r')
}

fn parse_percent_or_number(
    value: &str,
    minimum: f64,
    maximum: f64,
    percent: f64,
) -> Result<f64, String> {
    if let Some(value) = value.strip_suffix('%') {
        return parse_number(value, minimum * percent, maximum * percent)
            .map(|value| value / percent);
    }
    parse_number(value, minimum, maximum)
}

fn parse_number(value: &str, minimum: f64, maximum: f64) -> Result<f64, String> {
    let value = value
        .parse::<f64>()
        .map_err(|_| "Color contains an invalid number".to_owned())?;
    if !value.is_finite() || !(minimum..=maximum).contains(&value) {
        return Err(format!(
            "Color component must be between {minimum} and {maximum}"
        ));
    }
    Ok(value)
}

fn compact_number(value: f64) -> String {
    let formatted = format!("{value:.4}");
    formatted
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

fn parse_hex_rgb(value: &str) -> Option<[u8; 3]> {
    if value.len() != 7 || !value.starts_with('#') {
        return None;
    }
    Some([
        u8::from_str_radix(&value[1..3], 16).ok()?,
        u8::from_str_radix(&value[3..5], 16).ok()?,
        u8::from_str_radix(&value[5..7], 16).ok()?,
    ])
}

fn relative_luminance(rgb: [u8; 3]) -> f64 {
    let channel = |value: u8| {
        let value = f64::from(value) / 255.0;
        if value <= 0.04045 {
            value / 12.92
        } else {
            ((value + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_color, contrast_ratio, hard_defaults, safe_on_accent, validate_and_canonicalize,
    };
    use crate::domain::theme::ThemeTokenValue;

    #[test]
    fn colors_are_strict_and_canonical() {
        assert_eq!(canonical_color("#AABBCC").unwrap(), "#aabbcc");
        assert_eq!(
            canonical_color("oklch(62% .2 270 / 80%)").unwrap(),
            "oklch(0.62 0.2 270 / 0.8)"
        );
        assert!(canonical_color("red").is_err());
        assert!(canonical_color("url(https://example.test/a)").is_err());
    }

    #[test]
    fn bounds_and_contrast_are_deterministic() {
        assert!(validate_and_canonicalize("density.scale", &serde_json::json!(2.0)).is_err());
        assert_eq!(safe_on_accent("#ffffff"), "#000000");
        assert!(contrast_ratio("#000000", "#ffffff").unwrap() > 20.0);
    }

    #[test]
    fn signal_identity_and_motion_defaults_are_semantic_registry_data() {
        let defaults = hard_defaults();
        assert_eq!(
            defaults["color.accent.primary"],
            ThemeTokenValue::Text("#49d9c7".to_owned())
        );
        assert_eq!(
            defaults["color.focus.ring"],
            ThemeTokenValue::Text("#a5f4e6".to_owned())
        );
        assert_eq!(
            defaults["motion.duration.route"],
            ThemeTokenValue::Number(240.0)
        );
        assert_eq!(
            defaults["motion.distance.route"],
            ThemeTokenValue::Number(18.0)
        );
    }
}

import type { ThemeTokenValue, ViewDensity } from "../lib/types";

const TRACK_ROW_DENSITY_FACTORS: Record<ViewDensity, number> = {
  compact: 0.78,
  comfortable: 1,
  spacious: 1.22,
};

const aliases: Record<string, string[]> = {
  "color.background.canvas": ["--mv-color-bg-canvas"],
  "color.background.surface": ["--mv-color-bg-surface"],
  "color.background.surfaceRaised": ["--mv-color-bg-raised"],
  "color.background.surfaceSunken": ["--mv-color-bg-sunken"],
  "color.background.overlay": ["--mv-color-bg-overlay"],
  "color.background.input": ["--mv-color-bg-input"],
  "color.interaction.hover": ["--mv-color-bg-hover"],
  "color.text.primary": ["--mv-color-text-primary"],
  "color.text.secondary": ["--mv-color-text-secondary"],
  "color.text.tertiary": ["--mv-color-text-muted"],
  "color.text.disabled": ["--mv-color-text-disabled"],
  "color.accent.primary": ["--mv-color-accent"],
  "color.accent.onAccent": ["--mv-color-on-accent"],
  "color.selection.background": ["--mv-color-bg-selected"],
  "color.selection.foreground": ["--mv-color-selection-foreground"],
  "color.border.default": ["--mv-color-border"],
  "color.focus.ring": ["--mv-color-focus"],
  "color.status.error": ["--mv-color-error"],
  "color.favorite": ["--mv-color-favorite"],
  "color.artwork.fallbackStart": ["--mv-color-artwork-start"],
  "color.artwork.fallbackEnd": ["--mv-color-artwork-end"],
  "type.family.ui": ["--mv-font-ui"],
  "type.family.display": ["--mv-font-display"],
  "type.family.mono": ["--mv-font-mono"],
  "type.weight.regular": ["--mv-font-weight-normal"],
  "type.weight.medium": ["--mv-font-weight-medium"],
  "type.weight.semibold": ["--mv-font-weight-strong"],
  "type.size.caption": ["--mv-font-size-xs"],
  "type.size.bodySmall": ["--mv-font-size-sm"],
  "type.size.body": ["--mv-font-size-md"],
  "type.size.bodyLarge": ["--mv-font-size-lg"],
  "type.size.title": ["--mv-font-size-xl"],
  "type.size.display": ["--mv-font-size-display"],
  "type.lineHeight.body": ["--mv-line-height-body"],
  "type.letterSpacing.kicker": ["--mv-letter-spacing-kicker"],
  "shape.radius.control": ["--mv-shape-radius-control"],
  "shape.radius.surface": ["--mv-shape-radius-surface"],
  "shape.radius.artwork": ["--mv-shape-radius-artwork"],
  "shape.radius.pill": ["--mv-shape-radius-round"],
  "stroke.thin": ["--mv-border-width"],
  "elevation.surface": ["--mv-elevation-surface"],
  "effects.backdropBlur": ["--mv-blur-overlay"],
  "effects.disabledOpacity": ["--mv-opacity-disabled"],
  "effects.artworkSaturation": ["--mv-artwork-saturation"],
  "effects.artworkBrightness": ["--mv-artwork-brightness"],
  "effects.ambientGlowStrength": ["--mv-ambient-glow-strength"],
  "motion.duration.fast": ["--mv-motion-fast"],
  "motion.duration.normal": ["--mv-motion-normal"],
  "motion.easing.standard": ["--mv-motion-easing"],
  "density.controlHeight": ["--mv-control-height"],
  "density.trackRowHeight": ["--mv-track-row-comfortable"],
  "layout.contentMaxWidth": ["--mv-content-max-width"],
  "layout.gridMinCardWidth": ["--mv-grid-min-card-width"],
  "layout.gridGap": ["--mv-grid-gap"],
  "layout.artworkHeroSize": ["--mv-artwork-hero-size"],
};

const densityPixelTokens =
  /^(space\.|density\.(?:trackRowHeight|controlHeight|sidebarItemHeight))/;
const pixelTokens =
  /^(shape\.radius\.|stroke\.|effects\.(?:backdropBlur|artworkShadow)|layout\.|component\.(?:albumCard\.(?:radius|borderWidth|hoverLift)|sidebar\.activeIndicatorWidth))/;
const fontSizeTokens = /^type\.size\./;
const durationTokens = /^motion\.duration\./;
const letterSpacingTokens = /^type\.letterSpacing\./;

export function resolveCssVariables(
  tokens: Record<string, ThemeTokenValue>,
): Map<string, string> {
  const result = new Map<string, string>();
  const densityScale = numberValue(tokens["density.scale"], 1);
  const typeScale = numberValue(tokens["type.scale"], 1);
  for (const [id, value] of Object.entries(tokens)) {
    if (value === null) continue;
    const serialized = serializeToken(id, value, densityScale, typeScale);
    result.set(`--mv-theme-${toKebab(id)}`, serialized);
    for (const alias of aliases[id] ?? []) result.set(alias, serialized);
    const space = /^space\.(\d+)$/.exec(id);
    if (space) result.set(`--mv-space-${space[1]}`, serialized);
  }
  for (const density of ["compact", "comfortable", "spacious"] as const) {
    result.set(
      `--mv-track-row-${density}`,
      `${resolvedTrackRowHeight(tokens, density)}px`,
    );
  }
  return result;
}

export function resolvedTrackRowHeight(
  tokens: Record<string, ThemeTokenValue>,
  density: ViewDensity,
): number {
  const densityScale = numberValue(tokens["density.scale"], 1);
  const comfortable =
    numberValue(tokens["density.trackRowHeight"], 54) * densityScale;
  return Math.max(28, comfortable * TRACK_ROW_DENSITY_FACTORS[density]);
}

export function applyCssVariables(variables: Map<string, string>) {
  const root = document.documentElement;
  for (const [property, value] of variables) {
    root.style.setProperty(property, value);
  }
}

function serializeToken(
  id: string,
  value: ThemeTokenValue,
  densityScale: number,
  typeScale: number,
): string {
  if (typeof value !== "number") return String(value);
  if (densityPixelTokens.test(id)) return `${value * densityScale}px`;
  if (fontSizeTokens.test(id)) return `${value * typeScale}px`;
  if (pixelTokens.test(id)) return `${value}px`;
  if (durationTokens.test(id)) return `${value}ms`;
  if (letterSpacingTokens.test(id)) return `${value}em`;
  return String(value);
}

function numberValue(value: ThemeTokenValue | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toKebab(id: string) {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[._]/g, "-")
    .toLowerCase();
}

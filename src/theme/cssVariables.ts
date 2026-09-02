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
  "color.background.player": ["--mv-color-bg-player"],
  "color.background.overlay": ["--mv-color-bg-overlay"],
  "color.background.input": ["--mv-color-bg-input"],
  "color.background.titlebar": ["--mv-color-bg-titlebar"],
  "color.background.menu": ["--mv-color-bg-menu"],
  "color.background.tooltip": ["--mv-color-bg-tooltip"],
  "color.background.scrim": ["--mv-color-bg-scrim"],
  "color.interaction.hover": ["--mv-color-bg-hover"],
  "color.interaction.pressed": ["--mv-color-bg-pressed"],
  "color.interaction.dragInsertion": ["--mv-color-drag-insertion"],
  "color.windowControl.hover": ["--mv-color-window-hover"],
  "color.windowControl.closeHover": ["--mv-color-window-close-hover"],
  "color.windowControl.closeForeground": ["--mv-color-window-close-foreground"],
  "color.text.primary": ["--mv-color-text-primary"],
  "color.text.secondary": ["--mv-color-text-secondary"],
  "color.text.tertiary": ["--mv-color-text-muted"],
  "color.text.disabled": ["--mv-color-text-disabled"],
  "color.accent.primary": ["--mv-color-accent"],
  "color.accent.hover": ["--mv-color-accent-hover"],
  "color.accent.active": ["--mv-color-accent-active"],
  "color.accent.muted": ["--mv-color-accent-muted"],
  "color.accent.onAccent": ["--mv-color-on-accent"],
  "color.selection.background": ["--mv-color-bg-selected"],
  "color.selection.foreground": ["--mv-color-selection-foreground"],
  "color.border.default": ["--mv-color-border"],
  "color.border.menu": ["--mv-color-border-menu"],
  "color.focus.ring": ["--mv-color-focus"],
  "color.status.error": ["--mv-color-error"],
  "color.favorite": ["--mv-color-favorite"],
  "color.player.progress": ["--mv-color-player-progress"],
  "color.player.progressTrack": ["--mv-color-player-progress-track"],
  "color.player.buffered": ["--mv-color-player-buffered"],
  "color.lyrics.active": ["--mv-color-lyrics-active"],
  "color.lyrics.past": ["--mv-color-lyrics-past"],
  "color.lyrics.upcoming": ["--mv-color-lyrics-upcoming"],
  "color.lyrics.translation": ["--mv-color-lyrics-translation"],
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
  "motion.duration.slow": ["--mv-motion-slow"],
  "motion.duration.route": ["--mv-motion-route"],
  "motion.duration.overlay": ["--mv-motion-overlay"],
  "motion.duration.sharedArtwork": ["--mv-motion-shared-artwork"],
  "motion.duration.dragSettlement": ["--mv-motion-drag-settlement"],
  "motion.delay.staggerStep": ["--mv-motion-stagger-step"],
  "motion.easing.standard": ["--mv-motion-easing"],
  "motion.easing.emphasized": ["--mv-motion-easing-emphasized"],
  "motion.easing.exit": ["--mv-motion-easing-exit"],
  "motion.easing.springSoft": ["--mv-motion-easing-spring-soft"],
  "motion.easing.springFirm": ["--mv-motion-easing-spring-firm"],
  "motion.distance.route": ["--mv-motion-distance-route"],
  "motion.distance.overlay": ["--mv-motion-distance-overlay"],
  "motion.distance.dragLift": ["--mv-motion-distance-drag-lift"],
  "motion.scale.pressed": ["--mv-motion-scale-pressed"],
  "motion.scale.popoverFrom": ["--mv-motion-scale-popover-from"],
  "motion.scale.artworkHover": ["--mv-motion-scale-artwork-hover"],
  "component.lyrics.activeScale": ["--mv-lyrics-active-scale"],
  "component.lyrics.inactiveOpacity": ["--mv-lyrics-inactive-opacity"],
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
const durationTokens = /^motion\.(?:duration|delay)\./;
const distanceTokens = /^motion\.distance\./;
const letterSpacingTokens = /^type\.letterSpacing\./;
let appliedProperties = new Set<string>();

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
  for (const property of appliedProperties) {
    if (!variables.has(property)) root.style.removeProperty(property);
  }
  for (const [property, value] of variables) {
    root.style.setProperty(property, value);
  }
  appliedProperties = new Set(variables.keys());
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
  if (distanceTokens.test(id)) return `${value}px`;
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

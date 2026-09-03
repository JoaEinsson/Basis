import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("src/styles/global.css"), "utf8");
const nowPlayingStart = css.indexOf(".now-playing-view");
const nowPlayingCss = css.slice(
  nowPlayingStart,
  css.indexOf(".settings-section", nowPlayingStart),
);

describe("Now Playing CSS contract", () => {
  it("recomposes artwork-only mode and prevents horizontal lyric overflow", () => {
    expect(nowPlayingCss).toContain(".now-playing-layout[data-artwork-only]");
    expect(nowPlayingCss).toContain("overflow-x: hidden");
    expect(nowPlayingCss).toContain("overflow-wrap: anywhere");
    expect(nowPlayingCss).toContain("white-space: pre-wrap");
  });

  it("uses theme-owned ambient and motion values without visual literals", () => {
    expect(nowPlayingCss).toContain("var(--mv-ambient-glow-strength)");
    expect(nowPlayingCss).toContain("var(--mv-color-lyrics-active)");
    expect(nowPlayingCss).toContain("var(--mv-motion-easing-spring-soft)");
    expect(nowPlayingCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

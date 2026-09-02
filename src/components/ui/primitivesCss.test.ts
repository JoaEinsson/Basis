import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve("src/styles/global.css"), "utf8");

describe("shared primitive CSS contract", () => {
  it("keeps focus, motion, and reduced-motion behavior centralized", () => {
    expect(css).toContain(".ui-button");
    expect(css).toContain(".ui-dialog");
    expect(css).toContain(".ui-popover");
    expect(css).toContain(".ui-segmented-indicator");
    expect(css).toContain(".ui-insertion-marker");
    expect(css).toContain('html[data-theme-reduced-motion="true"] *');
    expect(css).toContain("transition-duration: 0s !important");
    expect(css).toContain("outline: var(--mv-focus-outline)");
  });

  it("uses semantic Theme Engine roles for primitive treatments", () => {
    const primitiveBlock = css.slice(
      css.indexOf(".ui-button"),
      css.indexOf("@keyframes ui-scrim-enter"),
    );
    expect(primitiveBlock).toContain("var(--mv-color-accent)");
    expect(primitiveBlock).toContain("var(--mv-color-bg-menu)");
    expect(primitiveBlock).toContain("var(--mv-motion-easing-spring-firm)");
    expect(primitiveBlock).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

import { describe, expect, it } from "vitest";
import { applyCssVariables, resolveCssVariables } from "./cssVariables";

describe("resolved theme CSS boundary", () => {
  it("maps semantic tokens and applies bounded density and type scales centrally", () => {
    const variables = resolveCssVariables({
      "color.background.canvas": "#ffffff",
      "shape.radius.surface": 28,
      "density.scale": 1.5,
      "density.controlHeight": 36,
      "density.trackRowHeight": 54,
      "type.scale": 1.2,
      "type.size.body": 15,
      "space.4": 16,
      "elevation.surface": "0 24px 64px #00000059",
      "color.background.titlebar": "#111111",
      "color.player.progress": "#49d9c7",
      "motion.duration.route": 240,
      "motion.delay.staggerStep": 24,
      "motion.distance.route": 18,
      "motion.scale.pressed": 0.97,
      "component.lyrics.inactiveOpacity": 0.82,
    });

    expect(variables.get("--mv-color-bg-canvas")).toBe("#ffffff");
    expect(variables.get("--mv-shape-radius-surface")).toBe("28px");
    expect(variables.get("--mv-control-height")).toBe("54px");
    expect(variables.get("--mv-track-row-comfortable")).toBe("81px");
    expect(variables.get("--mv-track-row-compact")).toBe("63.18px");
    expect(variables.get("--mv-track-row-spacious")).toBe("98.82px");
    expect(variables.get("--mv-font-size-md")).toBe("18px");
    expect(variables.get("--mv-space-4")).toBe("24px");
    expect(variables.get("--mv-elevation-surface")).toBe(
      "0 24px 64px #00000059",
    );
    expect(variables.get("--mv-color-bg-titlebar")).toBe("#111111");
    expect(variables.get("--mv-color-player-progress")).toBe("#49d9c7");
    expect(variables.get("--mv-motion-route")).toBe("240ms");
    expect(variables.get("--mv-motion-stagger-step")).toBe("24ms");
    expect(variables.get("--mv-motion-distance-route")).toBe("18px");
    expect(variables.get("--mv-motion-scale-pressed")).toBe("0.97");
    expect(variables.get("--mv-lyrics-inactive-opacity")).toBe("0.82");
  });

  it("removes properties that belonged only to the previous theme", () => {
    applyCssVariables(
      resolveCssVariables({
        "color.background.canvas": "#f7f7f5",
        "color.background.titlebar": "#ffffff",
        "color.background.menu": "#ffffff",
      }),
    );
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-titlebar"),
    ).toBe("#ffffff");

    applyCssVariables(
      resolveCssVariables({
        "color.background.canvas": "#0c0d10",
      }),
    );

    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-canvas"),
    ).toBe("#0c0d10");
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-titlebar"),
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue(
        "--mv-theme-color-background-titlebar",
      ),
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-menu"),
    ).toBe("");
  });
});

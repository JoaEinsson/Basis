import { describe, expect, it } from "vitest";
import { resolveCssVariables } from "./cssVariables";

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
    });

    expect(variables.get("--mv-color-bg-canvas")).toBe("#ffffff");
    expect(variables.get("--mv-shape-radius-surface")).toBe("28px");
    expect(variables.get("--mv-control-height")).toBe("54px");
    expect(variables.get("--mv-track-row-comfortable")).toBe("81px");
    expect(variables.get("--mv-font-size-md")).toBe("18px");
    expect(variables.get("--mv-space-4")).toBe("24px");
    expect(variables.get("--mv-elevation-surface")).toBe(
      "0 24px 64px #00000059",
    );
  });
});

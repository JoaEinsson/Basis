import { describe, expect, it } from "vitest";
import paperTheme from "../../../src-tauri/themes/paper.json";
import { contrastReport } from "./AppearanceEditor";

describe("theme editor contrast report", () => {
  it("validates effective Paper lyric contrast after inactive opacity", () => {
    const report = contrastReport(paperTheme.tokens);

    expect(report.ok).toBe(true);
    expect(report.message).toContain("Lyrics active");
    expect(report.message).toContain("past");
    expect(report.message).not.toContain("target 4.5:1");
  });

  it("warns when Paper inherits the old dark active-lyric color", () => {
    const report = contrastReport({
      ...paperTheme.tokens,
      "color.lyrics.active": "#f4f5f7",
      "component.lyrics.inactiveOpacity": 0.62,
    });

    expect(report.ok).toBe(false);
    expect(report.message).toContain("target 4.5:1");
  });
});

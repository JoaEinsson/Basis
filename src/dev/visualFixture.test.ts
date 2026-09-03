import { describe, expect, it } from "vitest";
import { handleFixtureCommand } from "./visualFixture";

describe("visual regression fixture", () => {
  it("returns a populated, deterministic library projection", () => {
    const page = handleFixtureCommand("query_execute", {
      request: {
        entity: "album",
        query: { kind: "and", items: [] },
        sort: [{ field: "album", direction: "asc" }],
        page: 0,
        pageSize: 100,
      },
    });

    expect(page).toMatchObject({
      entity: "album",
      hasMore: false,
      items: { kind: "albums" },
    });
    expect((page as { items: { items: unknown[] } }).items.items).toHaveLength(
      5,
    );
  });

  it("mirrors resolved Paper lyric overrides after registry inheritance", () => {
    const paper = handleFixtureCommand("theme_resolve", {
      id: "builtin:paper",
      artworkKey: null,
    }) as { appearance: string; tokens: Record<string, unknown> };

    expect(paper.appearance).toBe("light");
    expect(paper.tokens["color.background.canvas"]).toBe("#f7f7f5");
    expect(paper.tokens["color.lyrics.active"]).toBe("#202124");
    expect(paper.tokens["component.lyrics.activeScale"]).toBe(1.02);
    expect(paper.tokens["component.lyrics.inactiveOpacity"]).toBe(0.82);
  });

  it("mirrors new registry defaults when Nocturne omits sparse tokens", () => {
    const nocturne = handleFixtureCommand("theme_resolve", {
      id: "builtin:nocturne",
      artworkKey: null,
    }) as { tokens: Record<string, unknown> };

    expect(nocturne.tokens["color.background.titlebar"]).toBe("#15171c");
    expect(nocturne.tokens["color.background.menu"]).toBe("#1c1f26");
    expect(nocturne.tokens["motion.duration.route"]).toBe(240);
  });

  it("fails loudly when a new Tauri command is missing from the fixture", () => {
    expect(() => handleFixtureCommand("unknown_command")).toThrow(
      "Visual fixture does not implement Tauri command: unknown_command",
    );
  });

  it("keeps the queue reorder fixture aligned with the desktop command", () => {
    const before = handleFixtureCommand("player_get_state") as {
      playOrder: string[];
    };
    const movedId = before.playOrder.at(-1)!;
    const after = handleFixtureCommand("player_reorder_queue", {
      queueId: movedId,
      targetIndex: 1,
    }) as { playOrder: string[]; volume: number };

    expect(after.playOrder[1]).toBe(movedId);
    expect(after.volume).toBeGreaterThan(1);
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PlayerProvider } from "../components/player/PlayerContext";
import { LibraryContext } from "../components/shell/LibraryContext";
import type { ViewDefinition } from "../lib/types";

const executeLibraryQuery = vi.hoisted(() => vi.fn());
vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  executeLibraryQuery,
}));

import { Home } from "./Home";

describe("Home", () => {
  it("composes recently added, recently played, and favorites from View definitions", async () => {
    executeLibraryQuery.mockResolvedValue({
      entity: "track",
      page: 0,
      pageSize: 12,
      hasMore: false,
      items: { kind: "tracks", items: [] },
    });
    const views = [
      view("builtin:recently-added", "Recently Added"),
      view("builtin:recently-played", "Recently Played"),
      view("builtin:favorites", "Favorites"),
    ];
    render(
      <MemoryRouter>
        <PlayerProvider connect={false}>
          <LibraryContext.Provider
            value={{
              library: {
                libraryId: "library-id",
                rootInstanceHash: "root-hash",
                rootPath: "C:/Music",
                trackCount: 3,
                status: "ready",
              },
              scan: null,
              libraryError: null,
              views,
              choosingLibrary: false,
              chooseLibrary: vi.fn(),
              refreshViews: vi.fn(),
              replaceViews: vi.fn(),
            }}
          >
            <Home />
          </LibraryContext.Provider>
        </PlayerProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Recently Added" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recently Played" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Favorites" }),
    ).toBeInTheDocument();
    expect(executeLibraryQuery).toHaveBeenCalledTimes(3);
    for (const definition of views) {
      expect(executeLibraryQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: definition.query,
          sort: definition.sort,
        }),
      );
    }
  });
});

function view(id: string, name: string): ViewDefinition {
  return {
    schema_version: 1,
    id,
    name,
    icon: null,
    entity: "track",
    query: { kind: "and", items: [] },
    group_by: [],
    sort: [{ field: "title", direction: "asc" }],
    layout: {
      kind: "list",
      density: "comfortable",
      cover_size: null,
      visible_fields: ["title", "artist"],
    },
    pin_to_sidebar: false,
  };
}

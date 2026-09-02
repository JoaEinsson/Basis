import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryContext } from "../components/shell/LibraryContext";
import { PlayerProvider } from "../components/player/PlayerContext";

const searchLibrary = vi.hoisted(() => vi.fn());
vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  searchLibrary,
}));

import { SearchView } from "./SearchView";

describe("SearchView", () => {
  beforeEach(() => searchLibrary.mockReset());

  it("renders direct and relational results in entity sections", async () => {
    searchLibrary.mockResolvedValue({
      query: { kind: "text", value: "Sleep Token" },
      artists: [
        {
          artistKey: "artist-id",
          name: "Sleep Token",
          albumCount: 1,
          trackCount: 1,
        },
      ],
      albums: [
        {
          albumKey: "album-id",
          title: "Even in Arcadia",
          albumArtist: "Sleep Token",
          year: 2025,
          trackCount: 10,
          durationMs: 3600000,
          artworkKey: null,
          unknown: false,
        },
      ],
      tracks: [],
      folders: [],
      genres: [],
      playlists: [],
      views: [],
    });

    renderSearch("Sleep Token");

    expect(
      await screen.findByRole("heading", { name: "Artists" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Albums" })).toBeInTheDocument();
    expect(screen.getAllByText("Sleep Token").length).toBeGreaterThan(1);
    expect(screen.getByText("Even in Arcadia")).toBeInTheDocument();
  });

  it("renders a specific no-results state after grouped search completes", async () => {
    searchLibrary.mockResolvedValue(emptyResults("Unfindable"));
    renderSearch("Unfindable");
    expect(
      await screen.findByRole("heading", {
        name: "No results for “Unfindable”",
      }),
    ).toBeInTheDocument();
  });

  it("distinguishes a query parse error from a search transport failure", async () => {
    searchLibrary.mockImplementationOnce(async () => {
      await Promise.resolve();
      throw new Error("Unknown field: bogus");
    });
    renderSearch("bogus:value");
    expect(
      await screen.findByRole("heading", {
        name: "Search query is not valid",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unknown field: bogus");
  });
});

function renderSearch(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(query)}`]}>
      <PlayerProvider connect={false}>
        <LibraryContext.Provider
          value={{
            library: {
              libraryId: "library-id",
              rootInstanceHash: "root-hash",
              rootPath: "C:/Music",
              trackCount: 1,
              status: "ready",
            },
            scan: null,
            libraryError: null,
            views: [],
            choosingLibrary: false,
            chooseLibrary: vi.fn(),
            refreshViews: vi.fn(),
            replaceViews: vi.fn(),
          }}
        >
          <Routes>
            <Route path="search" element={<SearchView />} />
          </Routes>
        </LibraryContext.Provider>
      </PlayerProvider>
    </MemoryRouter>,
  );
}

function emptyResults(value: string) {
  return {
    query: { kind: "text" as const, value },
    artists: [],
    albums: [],
    tracks: [],
    folders: [],
    genres: [],
    playlists: [],
    views: [],
  };
}

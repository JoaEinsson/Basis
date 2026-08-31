import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PlayerProvider } from "../components/player/PlayerContext";
import type { AlbumDto, QueryItems, TrackDto } from "../lib/types";
import type { ViewEntryState } from "../stores/navigation";
import { facetPredicate, NaturalItems } from "./GenericView";

describe("Generic View representations", () => {
  it("applies density to the album grid and renders a distinct album table", () => {
    const { container, rerender } = renderNatural(
      { kind: "albums", items: [album()] },
      entry({ layout: "grid", density: "compact" }),
    );
    expect(container.querySelector(".album-grid")).toHaveAttribute(
      "data-density",
      "compact",
    );

    rerender(
      wrapper(
        { kind: "albums", items: [album()] },
        entry({ layout: "table", density: "spacious" }),
      ),
    );
    expect(screen.getByRole("table", { name: "Albums" })).toHaveAttribute(
      "data-density",
      "spacious",
    );
    expect(
      screen.getByRole("columnheader", { name: "Duration" }),
    ).toBeVisible();
  });

  it("activates folder and genre facets instead of rendering inert rows", () => {
    const onOpenFacet = vi.fn();
    const { rerender } = render(
      wrapper(
        {
          kind: "folders",
          items: [{ path: "Codecs", name: "Codecs", trackCount: 3 }],
        },
        entry({ layout: "list" }),
        onOpenFacet,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Codecs/i }));
    expect(onOpenFacet).toHaveBeenCalledWith("folder", "Codecs");

    rerender(
      wrapper(
        {
          kind: "genres",
          items: [{ name: "Metal", trackCount: 2 }],
        },
        entry({ layout: "list" }),
        onOpenFacet,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Metal/i }));
    expect(onOpenFacet).toHaveBeenCalledWith("genre", "Metal");
  });

  it("uses exact folder-prefix and genre predicates for drill-down", () => {
    expect(facetPredicate("folder", "Codecs")).toEqual({
      kind: "predicate",
      field: "path",
      op: "startsWith",
      value: "Codecs/",
    });
    expect(facetPredicate("genre", "Metal")).toEqual({
      kind: "predicate",
      field: "genre",
      op: "eq",
      value: "Metal",
    });
  });

  it("suppresses the browser menu and opens Basis actions for grid tracks", () => {
    renderNatural(
      { kind: "tracks", items: [track()] },
      entry({ layout: "grid" }),
    );
    expect(
      fireEvent.contextMenu(screen.getByRole("option"), {
        clientX: 120,
        clientY: 80,
      }),
    ).toBe(false);
    expect(
      screen.getByRole("menuitem", { name: "Add to playlist" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Add to Favorites" }),
    ).toBeVisible();
  });
});

function renderNatural(items: QueryItems, state: ViewEntryState) {
  return render(wrapper(items, state));
}

function wrapper(
  items: QueryItems,
  state: ViewEntryState,
  onOpenFacet = vi.fn(),
) {
  return (
    <MemoryRouter>
      <PlayerProvider connect={false}>
        <NaturalItems
          items={items}
          entry={state}
          onSelectionChange={vi.fn()}
          onOpenFacet={onOpenFacet}
        />
      </PlayerProvider>
    </MemoryRouter>
  );
}

function entry(overrides: Partial<ViewEntryState> = {}): ViewEntryState {
  return {
    layout: "list",
    density: "comfortable",
    query: { kind: "and", items: [] },
    sort: [{ field: "title", direction: "asc" }],
    groupBy: [],
    visibleFields: ["title", "artist", "album", "duration"],
    coverSize: 192,
    selectedIds: [],
    ...overrides,
  };
}

function album(): AlbumDto {
  return {
    albumKey: "album-id",
    title: "Album",
    albumArtist: "Artist",
    year: 2026,
    trackCount: 2,
    durationMs: 120_000,
    artworkKey: null,
    unknown: false,
  };
}

function track(): TrackDto {
  return {
    id: "track-id",
    relPath: "Artist/Album/01.flac",
    title: "Song",
    artist: "Artist",
    artists: ["Artist"],
    albumArtist: "Artist",
    album: "Album",
    year: 2026,
    trackNo: 1,
    discNo: 1,
    genres: ["Metal"],
    composer: null,
    durationMs: 120_000,
    codec: "flac",
    container: "flac",
    sampleRate: 48_000,
    bitDepth: 24,
    channels: 2,
    bitrate: null,
    artworkKey: null,
    addedAt: 0,
    lastPlayed: null,
    playCount: 0,
    favorite: false,
  };
}

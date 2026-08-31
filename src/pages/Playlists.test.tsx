import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
  ResolvedPlaylist,
  ResolvedPlaylistItem,
  StaticPlaylistItem,
  TrackDto,
} from "../lib/types";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 62,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 62,
        size: 62,
      })),
  }),
}));

const mocks = vi.hoisted(() => ({
  listPlaylists: vi.fn(),
  createPlaylist: vi.fn(),
  parseLibraryQuery: vi.fn(),
}));

vi.mock("../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/tauri")>()),
  listPlaylists: mocks.listPlaylists,
  createPlaylist: mocks.createPlaylist,
  parseLibraryQuery: mocks.parseLibraryQuery,
}));

import {
  Playlists,
  reorderPlaylistItems,
  StaticPlaylistEditor,
  staticPlaylistItemPresentation,
} from "./Playlists";

describe("Playlists", () => {
  it("creates a smart playlist from the shared query parser", async () => {
    mocks.listPlaylists.mockResolvedValue({ playlists: [], warnings: [] });
    mocks.parseLibraryQuery.mockResolvedValue({
      kind: "predicate",
      field: "favorite",
      op: "eq",
      value: true,
    });
    mocks.createPlaylist.mockResolvedValue({
      type: "smart",
      schema_version: 1,
      id: "playlist-id",
      name: "Loved",
      query: { kind: "and", items: [] },
      sort: [],
    });
    render(
      <MemoryRouter>
        <Playlists />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "New playlist" }),
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Loved" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "smart" },
    });
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "favorite:true" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(mocks.createPlaylist).toHaveBeenCalledWith({
        type: "smart",
        name: "Loved",
        query: {
          kind: "predicate",
          field: "favorite",
          op: "eq",
          value: true,
        },
        sort: [{ field: "title", direction: "asc" }],
      }),
    );
  });

  it("reorders static items without changing their portable paths", () => {
    const items = [item("Artist/Album/01.flac"), item("Other/02.m4a")];
    const reordered = reorderPlaylistItems(items, 0, 1);
    expect(reordered.map((entry) => entry.path)).toEqual([
      "Other/02.m4a",
      "Artist/Album/01.flac",
    ]);
    expect(items[0].path).toBe("Artist/Album/01.flac");
  });

  it("does not label a resolved untagged track as missing", () => {
    const resolvedItem: ResolvedPlaylistItem = {
      item: item("Café/four.wav"),
      track: track("Café/four.wav"),
      suggested_path: null,
    };

    expect(staticPlaylistItemPresentation(resolvedItem)).toEqual({
      title: "four",
      subtitle: "Unknown artist",
    });
  });

  it("reserves the missing label for an unresolved item", () => {
    const resolvedItem: ResolvedPlaylistItem = {
      item: item("Moved/four.wav"),
      track: null,
      suggested_path: null,
    };

    expect(staticPlaylistItemPresentation(resolvedItem)).toEqual({
      title: "Missing track",
      subtitle: "Moved/four.wav",
    });
  });

  it("accepts a protected dragover payload and reorders on drop", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const resolved = staticPlaylist([
      track("First/one.flac"),
      track("Second/two.flac"),
    ]);
    const { container } = render(
      <StaticPlaylistEditor
        resolved={resolved}
        saving={false}
        onSave={onSave}
        onPlay={vi.fn()}
      />,
    );
    const handles = screen.getAllByRole("button", { name: /to reorder$/i });
    const transfer = memoryDataTransfer();
    fireEvent.dragStart(handles[0], { dataTransfer: transfer });
    const targetRow = handles[1].closest(".playlist-track-row");
    expect(targetRow).not.toBeNull();
    const protectedTransfer = {
      ...transfer,
      getData: () => "",
    } as DataTransfer;
    fireEvent.dragOver(targetRow!, { dataTransfer: protectedTransfer });
    expect(protectedTransfer.dropEffect).toBe("move");
    fireEvent.drop(targetRow!, { dataTransfer: transfer });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ path: "Second/two.flac" }),
          expect.objectContaining({ path: "First/one.flac" }),
        ],
      }),
    );
    expect(container.querySelectorAll(".playlist-track-row")).toHaveLength(2);
  });
});

function item(path: string): StaticPlaylistItem {
  return {
    path,
    hint: {
      title: null,
      artist: null,
      album: null,
      duration_ms: null,
      disc_no: null,
      track_no: null,
    },
  };
}

function track(relPath: string): TrackDto {
  return {
    id: relPath,
    relPath,
    title: null,
    artist: null,
    artists: [],
    albumArtist: null,
    album: null,
    year: null,
    trackNo: null,
    discNo: null,
    genres: [],
    composer: null,
    durationMs: 1000,
    codec: "wav",
    container: "wav",
    sampleRate: null,
    bitDepth: null,
    channels: null,
    bitrate: null,
    artworkKey: null,
    addedAt: null,
    lastPlayed: null,
    playCount: 0,
    favorite: false,
  };
}

function staticPlaylist(tracks: TrackDto[]): ResolvedPlaylist {
  const items = tracks.map((value) => item(value.relPath));
  return {
    playlist: {
      type: "static",
      schema_version: 1,
      id: "playlist-id",
      name: "Static",
      items,
    },
    items: items.map((value, index) => ({
      item: value,
      track: tracks[index],
      suggested_path: null,
    })),
  };
}

function memoryDataTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => values.set(type, value),
  } as unknown as DataTransfer;
}

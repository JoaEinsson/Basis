import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { StaticPlaylistItem } from "../lib/types";

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

import { Playlists, reorderPlaylistItems } from "./Playlists";

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

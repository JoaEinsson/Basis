import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TrackDto } from "../../lib/types";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 54,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 54,
        size: 54,
      })),
  }),
}));

vi.mock("../../theme/ThemeProvider", () => ({
  useTheme: () => ({ tokens: {} }),
}));

import { TrackList } from "./TrackList";

describe("TrackList actions", () => {
  it("suppresses the browser menu and exposes the same actions from an explicit button", () => {
    const track = fixtureTrack();
    render(
      <TrackList
        tracks={[track]}
        onAddToPlaylist={vi.fn()}
        onFavorite={vi.fn()}
      />,
    );

    const row = screen.getByRole("option");
    expect(fireEvent.contextMenu(row, { clientX: 120, clientY: 80 })).toBe(
      false,
    );
    expect(
      screen.getByRole("menuitem", { name: "Add to playlist" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Add to Favorites" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Actions for Song" }));
    expect(
      screen.getByRole("menuitem", { name: "Add to playlist" }),
    ).toBeInTheDocument();
  });
});

function fixtureTrack(): TrackDto {
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
    genres: ["Test"],
    composer: null,
    durationMs: 180_000,
    codec: "flac",
    container: "flac",
    sampleRate: 44_100,
    bitDepth: 16,
    channels: 2,
    bitrate: null,
    artworkKey: null,
    addedAt: 0,
    lastPlayed: null,
    playCount: 0,
    favorite: false,
  };
}

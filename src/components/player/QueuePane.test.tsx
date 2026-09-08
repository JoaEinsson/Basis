import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerSnapshot, TrackDto } from "../../lib/types";

const mocks = vi.hoisted(() => ({
  reorderPlaybackQueue: vi.fn(),
  clearUpcomingPlayback: vi.fn(),
  setPlaybackMuted: vi.fn(),
  createPlaylist: vi.fn(),
  nextTrack: vi.fn(),
  resumePlayback: vi.fn(),
}));

vi.mock("../../lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/tauri")>()),
  reorderPlaybackQueue: mocks.reorderPlaybackQueue,
  clearUpcomingPlayback: mocks.clearUpcomingPlayback,
  setPlaybackMuted: mocks.setPlaybackMuted,
  createPlaylist: mocks.createPlaylist,
  nextTrack: mocks.nextTrack,
  resumePlayback: mocks.resumePlayback,
}));

import { PlayerBar } from "./PlayerBar";
import { PlayerProvider, PlayerKeyboardShortcuts } from "./PlayerContext";
import { QueuePane } from "./QueuePane";

describe("QueuePane", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mutes without replacing the chosen volume", async () => {
    const initial = snapshot();
    mocks.setPlaybackMuted
      .mockResolvedValueOnce({ ...initial, muted: true })
      .mockResolvedValueOnce(initial);
    renderQueue(initial);
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    const unmute = await screen.findByRole("button", { name: "Unmute" });
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("80");
    fireEvent.click(unmute);
    await waitFor(() =>
      expect(mocks.setPlaybackMuted).toHaveBeenLastCalledWith(false),
    );
  });

  it("clears upcoming items without removing history or the current item", async () => {
    const initial = snapshot();
    mocks.clearUpcomingPlayback.mockResolvedValue({
      ...initial,
      queue: initial.queue.slice(0, 2),
      playOrder: initial.playOrder.slice(0, 2),
    });
    renderQueue(initial);
    fireEvent.click(screen.getByRole("button", { name: "Open queue" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear upcoming" }));
    await screen.findByText("Upcoming tracks cleared.");
    expect(screen.getByText("Track 1")).toBeInTheDocument();
    expect(screen.queryByText("Track 3")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear upcoming" }),
    ).toBeDisabled();
  });

  it("saves a new playlist in displayed order, retaining repeated tracks", async () => {
    const initial = snapshot();
    initial.queue[3].track = initial.queue[1].track;
    initial.playOrder = ["queue-1", "queue-2", "queue-4", "queue-3"];
    mocks.createPlaylist.mockResolvedValue({});
    renderQueue(initial);
    fireEvent.click(screen.getByRole("button", { name: "Open queue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as playlist" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "New static playlist" }),
      { target: { value: "My queue" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save playlist" }));
    await waitFor(() =>
      expect(mocks.createPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My queue",
          type: "static",
          items: [
            expect.objectContaining({ path: initial.queue[0].track.relPath }),
            expect.objectContaining({ path: initial.queue[1].track.relPath }),
            expect.objectContaining({ path: initial.queue[1].track.relPath }),
            expect.objectContaining({ path: initial.queue[2].track.relPath }),
          ],
        }),
      ),
    );
  });

  it("does not redispatch native media keys in the webview", () => {
    renderQueue(snapshot());
    fireEvent.keyDown(window, { key: "MediaTrackNext" });
    fireEvent.keyDown(window, { key: "MediaPlayPause" });
    expect(mocks.nextTrack).not.toHaveBeenCalled();
    expect(mocks.resumePlayback).not.toHaveBeenCalled();
  });

  it("distinguishes history, current and upcoming tracks and reorders upcoming items", async () => {
    const initial = snapshot();
    const reordered = {
      ...initial,
      queue: [
        initial.queue[0],
        initial.queue[1],
        initial.queue[3],
        initial.queue[2],
      ],
      playOrder: ["queue-1", "queue-2", "queue-4", "queue-3"],
    };
    mocks.reorderPlaybackQueue.mockResolvedValue(reordered);

    const { container } = render(
      <MemoryRouter>
        <PlayerProvider connect={false} initialSnapshot={initial}>
          <PlayerBar />
          <QueuePane />
        </PlayerProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open queue" }));
    expect(screen.getByText("Played")).toBeInTheDocument();
    expect(screen.getByText("Now playing")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(
      container.querySelector('[data-queue-state="history"]'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move Track 3 down" }));
    await waitFor(() =>
      expect(mocks.reorderPlaybackQueue).toHaveBeenCalledWith("queue-3", 3),
    );
    expect(
      await screen.findByText("Moved Track 3 to queue position 4."),
    ).toBeInTheDocument();
  });

  it("accepts drag insertion between upcoming tracks", async () => {
    const initial = snapshot();
    mocks.reorderPlaybackQueue.mockResolvedValue(initial);
    renderQueue(initial);

    fireEvent.click(screen.getByRole("button", { name: "Open queue" }));
    const transfer = memoryDataTransfer();
    fireEvent.dragStart(
      screen.getByRole("button", { name: "Drag Track 4 to reorder" }),
      { dataTransfer: transfer },
    );
    const target = screen.getByText("Track 3").closest("li");
    expect(target).not.toBeNull();
    fireEvent.dragOver(target!, { dataTransfer: transfer });
    expect(target).toHaveAttribute("data-drop-target", "true");
    fireEvent.drop(target!, { dataTransfer: transfer });

    await waitFor(() =>
      expect(mocks.reorderPlaybackQueue).toHaveBeenCalledWith("queue-4", 2),
    );
  });
});

function renderQueue(initial: PlayerSnapshot) {
  return render(
    <MemoryRouter>
      <PlayerProvider connect={false} initialSnapshot={initial}>
        <PlayerKeyboardShortcuts />
        <PlayerBar />
        <QueuePane />
      </PlayerProvider>
    </MemoryRouter>,
  );
}

function snapshot(): PlayerSnapshot {
  const queue = Array.from({ length: 4 }, (_, index) => ({
    queueId: `queue-${index + 1}`,
    track: track(index + 1),
  }));
  return {
    status: "playing",
    queue,
    playOrder: queue.map((item) => item.queueId),
    currentIndex: 1,
    currentTrack: queue[1],
    positionMs: 15_000,
    durationMs: 120_000,
    volume: 80,
    muted: false,
    shuffle: false,
    repeat: "off",
    error: null,
    outputDevice: null,
  };
}

function track(index: number): TrackDto {
  return {
    id: `track-${index}`,
    relPath: `Artist/Album/Track ${index}.flac`,
    title: `Track ${index}`,
    artist: "Artist",
    artists: ["Artist"],
    albumArtist: "Artist",
    album: "Album",
    year: 2026,
    trackNo: index,
    discNo: 1,
    genres: [],
    composer: null,
    durationMs: 120_000,
    codec: "flac",
    container: "flac",
    sampleRate: 44_100,
    bitDepth: 16,
    channels: 2,
    bitrate: 900,
    artworkKey: null,
    addedAt: 0,
    lastPlayed: null,
    playCount: 0,
    favorite: false,
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

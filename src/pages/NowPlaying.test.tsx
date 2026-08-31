import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerProvider } from "../components/player/PlayerContext";
import type { PlayerSnapshot } from "../lib/types";

const mocks = vi.hoisted(() => ({
  resolveLyrics: vi.fn(),
  chooseLyricsCandidate: vi.fn(),
  seekPlayback: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  resolveLyrics: mocks.resolveLyrics,
  chooseLyricsCandidate: mocks.chooseLyricsCandidate,
  seekPlayback: mocks.seekPlayback,
  getPlayerState: vi.fn(),
  onPlayerState: vi.fn(),
  onPlayerTrackChanged: vi.fn(),
  onPlayerQueueChanged: vi.fn(),
  onPlayerError: vi.fn(),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  playCollection: vi.fn(),
  setPlaybackVolume: vi.fn(),
  setPlaybackShuffle: vi.fn(),
  setPlaybackRepeat: vi.fn(),
}));

import { NowPlaying } from "./NowPlaying";

describe("Now Playing lyrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLyrics.mockResolvedValue({
      document: {
        source: "lrclib",
        synced: true,
        instrumental: false,
        lines: [
          { timestampMs: 1_000, text: "First line" },
          { timestampMs: 2_000, text: "Second line" },
        ],
        plainText: null,
      },
      candidates: [],
      message: null,
    });
    mocks.seekPlayback.mockResolvedValue(snapshot());
  });

  it("highlights the current synchronized line and seeks from timestamps", async () => {
    renderNowPlaying();

    const first = await screen.findByRole("button", { name: "First line" });
    expect(first).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "Second line" }));
    await waitFor(() => expect(mocks.seekPlayback).toHaveBeenCalledWith(2_000));
  });

  it("keeps provider failures quiet and retryable", async () => {
    mocks.resolveLyrics.mockRejectedValueOnce(new Error("Network unavailable"));
    renderNowPlaying();

    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("First line")).toBeInTheDocument();
    expect(mocks.resolveLyrics).toHaveBeenCalledTimes(2);
  });

  it("keeps plain lyrics visible while explaining review-only synchronized matches", async () => {
    mocks.resolveLyrics.mockResolvedValueOnce({
      document: {
        source: "lrclib",
        synced: false,
        instrumental: false,
        lines: [],
        plainText: "Plain fallback",
      },
      candidates: [
        {
          id: 42,
          trackName: "Track",
          artistName: "Artist",
          albumName: "Album (Deluxe Edition)",
          durationSeconds: 126,
          hasSyncedLyrics: true,
          confidence: "review",
          durationDeltaMs: 6_000,
          reasons: [
            "Album base matches; release edition differs",
            "Automatic duration tolerance was exceeded",
          ],
        },
      ],
      message:
        "Plain lyrics are shown. Synchronized alternatives need confirmation.",
    });
    mocks.chooseLyricsCandidate.mockResolvedValueOnce({
      document: {
        source: "lrclib",
        synced: true,
        instrumental: false,
        lines: [{ timestampMs: 1_000, text: "Chosen line" }],
        plainText: null,
      },
      candidates: [],
      message: null,
    });
    renderNowPlaying();

    expect(await screen.findByText("Plain fallback")).toBeInTheDocument();
    expect(screen.getByText("Review match")).toBeInTheDocument();
    expect(
      screen.getByText(/automatic duration tolerance was exceeded/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /track.*review match/i }),
    );

    await waitFor(() =>
      expect(mocks.chooseLyricsCandidate).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000001",
        42,
      ),
    );
    expect(await screen.findByText("Chosen line")).toBeInTheDocument();
  });
});

function renderNowPlaying() {
  return render(
    <MemoryRouter>
      <PlayerProvider connect={false} initialSnapshot={snapshot()}>
        <NowPlaying />
      </PlayerProvider>
    </MemoryRouter>,
  );
}

function snapshot(): PlayerSnapshot {
  const track = {
    id: "00000000-0000-0000-0000-000000000001",
    relPath: "Artist/Album/Track.flac",
    title: "Track",
    artist: "Artist",
    artists: ["Artist"],
    albumArtist: "Artist",
    album: "Album",
    year: null,
    trackNo: 1,
    discNo: 1,
    genres: [],
    composer: null,
    durationMs: 120_000,
    codec: "flac",
    container: "flac",
    sampleRate: 44_100,
    bitDepth: 16,
    channels: 2,
    bitrate: 800,
    artworkKey: null,
    addedAt: 0,
    lastPlayed: null,
    playCount: 0,
    favorite: false,
  };
  return {
    status: "playing",
    queue: [{ queueId: "queue-1", track }],
    playOrder: ["queue-1"],
    currentIndex: 0,
    currentTrack: { queueId: "queue-1", track },
    positionMs: 1_500,
    durationMs: 120_000,
    volume: 0.8,
    shuffle: false,
    repeat: "off",
    error: null,
    outputDevice: null,
  };
}

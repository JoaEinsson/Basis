import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerProvider } from "../components/player/PlayerContext";
import type { PlayerSnapshot, PlayerTrackChangedEvent } from "../lib/types";

const mocks = vi.hoisted(() => ({
  resolveLyrics: vi.fn(),
  chooseLyricsCandidate: vi.fn(),
  getPlayerState: vi.fn(),
  onPlayerError: vi.fn(),
  onPlayerQueueChanged: vi.fn(),
  onPlayerState: vi.fn(),
  onPlayerTrackChanged: vi.fn(),
  seekPlayback: vi.fn(),
  searchLyrics: vi.fn(),
  setLyricsOffset: vi.fn(),
  clearLyricsSelection: vi.fn(),
  getLyricsPrefetchPolicy: vi.fn(),
  prefetchLyrics: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  resolveLyrics: mocks.resolveLyrics,
  chooseLyricsCandidate: mocks.chooseLyricsCandidate,
  searchLyrics: mocks.searchLyrics,
  setLyricsOffset: mocks.setLyricsOffset,
  clearLyricsSelection: mocks.clearLyricsSelection,
  getLyricsPrefetchPolicy: mocks.getLyricsPrefetchPolicy,
  prefetchLyrics: mocks.prefetchLyrics,
  seekPlayback: mocks.seekPlayback,
  getPlayerState: mocks.getPlayerState,
  onPlayerState: mocks.onPlayerState,
  onPlayerTrackChanged: mocks.onPlayerTrackChanged,
  onPlayerQueueChanged: mocks.onPlayerQueueChanged,
  onPlayerError: mocks.onPlayerError,
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  playCollection: vi.fn(),
  setPlaybackVolume: vi.fn(),
  setPlaybackShuffle: vi.fn(),
  setPlaybackRepeat: vi.fn(),
  reorderPlaybackQueue: vi.fn(),
}));

import { NowPlaying } from "./NowPlaying";

describe("Now Playing lyrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
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
    mocks.getPlayerState.mockResolvedValue(snapshot());
    mocks.onPlayerError.mockResolvedValue(vi.fn());
    mocks.onPlayerQueueChanged.mockResolvedValue(vi.fn());
    mocks.onPlayerState.mockResolvedValue(vi.fn());
    mocks.onPlayerTrackChanged.mockResolvedValue(vi.fn());
    mocks.seekPlayback.mockResolvedValue(snapshot());
    mocks.getLyricsPrefetchPolicy.mockResolvedValue({
      enabled: false,
      cacheEntryLimit: 64,
      cacheBytesLimit: 8 * 1024 * 1024,
    });
    mocks.prefetchLyrics.mockResolvedValue(false);
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

  it("persists the manual lyrics visibility preference locally", async () => {
    const first = renderNowPlaying();

    expect(await screen.findByText("First line")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide lyrics" }));
    expect(screen.queryByText("First line")).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem("basis.now-playing.lyrics-visible"),
    ).toBe("false");

    first.unmount();
    renderNowPlaying();
    expect(
      await screen.findByRole("button", { name: "Show lyrics" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("First line")).not.toBeInTheDocument();
  });

  it("temporarily centers instrumental tracks without overwriting the manual preference", async () => {
    window.localStorage.setItem("basis.now-playing.lyrics-visible", "true");
    mocks.resolveLyrics.mockResolvedValueOnce({
      document: {
        source: "embedded",
        synced: false,
        instrumental: true,
        lines: [],
        plainText: null,
      },
      candidates: [],
      message: null,
    });

    const view = renderNowPlaying();

    expect(
      await screen.findByRole("button", {
        name: "Lyrics unavailable for instrumental track",
      }),
    ).toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Lyrics" })).toBeNull();
    expect(view.container.querySelector(".now-playing-layout")).toHaveAttribute(
      "data-artwork-only",
      "true",
    );
    expect(
      window.localStorage.getItem("basis.now-playing.lyrics-visible"),
    ).toBe("true");
  });

  it("restores the manual lyric mode after an instrumental track changes back to vocals", async () => {
    let publishTrack: ((event: PlayerTrackChangedEvent) => void) | undefined;
    const initial = snapshot();
    const instrumental = snapshot(
      "00000000-0000-0000-0000-000000000002",
      "Instrumental",
    );
    const vocal = snapshot(
      "00000000-0000-0000-0000-000000000003",
      "Vocals return",
    );
    window.localStorage.setItem("basis.now-playing.lyrics-visible", "true");
    mocks.getPlayerState.mockResolvedValue(initial);
    mocks.onPlayerTrackChanged.mockImplementationOnce((listener) => {
      publishTrack = listener;
      return Promise.resolve(vi.fn());
    });
    mocks.resolveLyrics
      .mockResolvedValueOnce(syncedLyrics("Opening line"))
      .mockResolvedValueOnce(instrumentalLyrics())
      .mockResolvedValueOnce(syncedLyrics("Lyrics restored"));

    const view = renderNowPlaying({ connect: true, initialSnapshot: initial });
    expect(await screen.findByText("Opening line")).toBeInTheDocument();

    act(() => publishTrack?.({ currentTrack: instrumental.currentTrack }));
    expect(
      await screen.findByRole("button", {
        name: "Lyrics unavailable for instrumental track",
      }),
    ).toBeDisabled();
    expect(view.container.querySelector(".now-playing-layout")).toHaveAttribute(
      "data-artwork-only",
      "true",
    );

    act(() => publishTrack?.({ currentTrack: vocal.currentTrack }));
    expect(await screen.findByText("Lyrics restored")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide lyrics" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      view.container.querySelector(".now-playing-layout"),
    ).not.toHaveAttribute("data-artwork-only");
    expect(
      window.localStorage.getItem("basis.now-playing.lyrics-visible"),
    ).toBe("true");
  });

  it("completes and interrupts artwork recomposition without delaying lyric visibility", async () => {
    const animateDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "animate",
    );
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        const artworkOnly =
          this instanceof HTMLElement &&
          this.classList.contains("now-playing-artwork") &&
          this.closest(".now-playing-layout")?.hasAttribute(
            "data-artwork-only",
          );
        return layoutRect(artworkOnly ? 420 : 120);
      });
    const animations = Array.from({ length: 3 }, () => fakeAnimation());
    const animate = vi
      .fn()
      .mockReturnValueOnce(animations[0].animation)
      .mockReturnValueOnce(animations[1].animation)
      .mockReturnValueOnce(animations[2].animation);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });

    try {
      renderNowPlaying();
      expect(await screen.findByText("First line")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Hide lyrics" }));
      expect(screen.queryByText("First line")).not.toBeInTheDocument();
      expect(animate).toHaveBeenCalledTimes(1);
      animations[0].finish();

      fireEvent.click(screen.getByRole("button", { name: "Show lyrics" }));
      expect(await screen.findByText("First line")).toBeInTheDocument();
      expect(animations[0].cancel).not.toHaveBeenCalled();
      expect(animate).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole("button", { name: "Hide lyrics" }));
      expect(animations[1].cancel).toHaveBeenCalledOnce();
      expect(animate).toHaveBeenCalledTimes(3);
    } finally {
      rectSpy.mockRestore();
      if (animateDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "animate",
          animateDescriptor,
        );
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
      }
    }
  });

  it("persists a per-track offset and applies it to lyric seeking", async () => {
    mocks.setLyricsOffset.mockResolvedValue({ offsetMs: 500, selection: null });
    renderNowPlaying();

    expect(await screen.findByText("First line")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show lyrics half a second later",
      }),
    );
    await waitFor(() =>
      expect(mocks.setLyricsOffset).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000001",
        500,
      ),
    );
    expect(
      await screen.findByText("Timing: +0.5 s (later)"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Second line" }));
    await waitFor(() => expect(mocks.seekPlayback).toHaveBeenCalledWith(2_500));
  });

  it("searches deliberately and persists a manually selected recording", async () => {
    mocks.searchLyrics.mockResolvedValue({
      document: null,
      candidates: [
        {
          id: 91,
          trackName: "Track (Live)",
          artistName: "Artist",
          albumName: "Live Album",
          durationSeconds: 125,
          hasSyncedLyrics: true,
          instrumental: false,
          confidence: "review",
          durationDeltaMs: 5_000,
          reasons: ["Manual search result"],
        },
      ],
      message: "Confirm the recording you want.",
      offsetMs: 0,
      selection: null,
    });
    mocks.chooseLyricsCandidate.mockResolvedValue({
      ...syncedLyrics("Manual choice"),
      offsetMs: 0,
      selection: {
        source: "lrclib",
        providerId: 91,
        trackName: "Track (Live)",
        artistName: "Artist",
        albumName: "Live Album",
        durationSeconds: 125,
      },
    });
    renderNowPlaying();

    expect(await screen.findByText("First line")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find lyrics" }));
    fireEvent.click(screen.getByRole("button", { name: "Search LRCLIB" }));
    await waitFor(() =>
      expect(mocks.searchLyrics).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000001",
        {
          trackName: "Track",
          artistName: "Artist",
          albumName: "Album",
          durationSeconds: 120,
        },
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /track \(live\).*review match/i,
      }),
    );
    expect(await screen.findByText("Manual choice")).toBeInTheDocument();
    expect(screen.getByText(/selected lrclib match/i)).toHaveTextContent(
      "Track (Live) · Artist",
    );
  });
});

function renderNowPlaying({
  connect = false,
  initialSnapshot = snapshot(),
}: {
  connect?: boolean;
  initialSnapshot?: PlayerSnapshot;
} = {}) {
  return render(
    <MemoryRouter>
      <PlayerProvider connect={connect} initialSnapshot={initialSnapshot}>
        <NowPlaying />
      </PlayerProvider>
    </MemoryRouter>,
  );
}

function snapshot(
  id = "00000000-0000-0000-0000-000000000001",
  title = "Track",
): PlayerSnapshot {
  const track = {
    id,
    relPath: `Artist/Album/${title}.flac`,
    title,
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
    volume: 80,
    muted: false,
    shuffle: false,
    repeat: "off",
    error: null,
    outputDevice: null,
  };
}

function syncedLyrics(text: string) {
  return {
    document: {
      source: "lrclib" as const,
      synced: true,
      instrumental: false,
      lines: [{ timestampMs: 1_000, text }],
      plainText: null,
    },
    candidates: [],
    message: null,
  };
}

function instrumentalLyrics() {
  return {
    document: {
      source: "embedded" as const,
      synced: false,
      instrumental: true,
      lines: [],
      plainText: null,
    },
    candidates: [],
    message: null,
  };
}

function layoutRect(left: number): DOMRect {
  return {
    bottom: 384,
    height: 384,
    left,
    right: left + 384,
    top: 0,
    width: 384,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}

function fakeAnimation() {
  let finish: (() => void) | undefined;
  const cancel = vi.fn();
  const animation = {
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "finish") finish = () => listener(new Event("finish"));
    }),
    cancel,
  } as unknown as Animation;
  return { animation, cancel, finish: () => finish?.() };
}

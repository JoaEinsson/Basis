import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LibraryChangedEvent,
  PlayerSnapshot,
  PlayerStateEvent,
  PlayerTrackChangedEvent,
  ViewDefinition,
} from "../lib/types";
import { useNavigationStore } from "../stores/navigation";

const mocks = vi.hoisted(() => ({
  chooseLibraryRoot: vi.fn(),
  getLibraryStatus: vi.fn(),
  listViews: vi.fn(),
  onLibraryScanProgress: vi.fn(),
  onLibraryChanged: vi.fn(),
  searchLibrary: vi.fn(),
  getPlayerState: vi.fn(),
  onPlayerState: vi.fn(),
  onPlayerTrackChanged: vi.fn(),
  onPlayerQueueChanged: vi.fn(),
  onPlayerError: vi.fn(),
  pausePlayback: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  chooseLibraryRoot: mocks.chooseLibraryRoot,
  getLibraryStatus: mocks.getLibraryStatus,
  listViews: mocks.listViews,
  onLibraryScanProgress: mocks.onLibraryScanProgress,
  onLibraryChanged: mocks.onLibraryChanged,
  searchLibrary: mocks.searchLibrary,
  getPlayerState: mocks.getPlayerState,
  onPlayerState: mocks.onPlayerState,
  onPlayerTrackChanged: mocks.onPlayerTrackChanged,
  onPlayerQueueChanged: mocks.onPlayerQueueChanged,
  onPlayerError: mocks.onPlayerError,
  pausePlayback: mocks.pausePlayback,
  resumePlayback: vi.fn(),
  seekPlayback: vi.fn(),
  nextTrack: vi.fn(),
  previousTrack: vi.fn(),
  playCollection: vi.fn(),
  setPlaybackVolume: vi.fn(),
  setPlaybackShuffle: vi.fn(),
  setPlaybackRepeat: vi.fn(),
}));

import { AppShell } from "../components/shell/AppShell";

const albumsView: ViewDefinition = {
  schema_version: 1,
  id: "builtin:albums",
  name: "Albums",
  icon: null,
  entity: "album",
  query: { kind: "and", items: [] },
  group_by: [],
  sort: [{ field: "album", direction: "asc" }],
  layout: {
    kind: "grid",
    density: "comfortable",
    cover_size: 192,
    visible_fields: ["album", "albumArtist", "year"],
  },
  pin_to_sidebar: true,
};

describe("Basis definitive shell", () => {
  beforeEach(() => {
    useNavigationStore.setState({
      paletteOpen: false,
      scrollPositions: {},
      viewEntries: {},
    });
    mocks.getLibraryStatus.mockResolvedValue(null);
    mocks.chooseLibraryRoot.mockResolvedValue(null);
    mocks.listViews.mockResolvedValue([albumsView]);
    mocks.onLibraryScanProgress.mockResolvedValue(vi.fn());
    mocks.onLibraryChanged.mockResolvedValue(vi.fn());
    mocks.searchLibrary.mockResolvedValue({
      query: { kind: "text", value: "Sleep Token" },
      artists: [],
      albums: [],
      tracks: [],
      folders: [],
      genres: [],
      playlists: [],
      views: [],
    });
    mocks.getPlayerState.mockResolvedValue(emptyPlayerSnapshot());
    mocks.onPlayerState.mockResolvedValue(vi.fn());
    mocks.onPlayerTrackChanged.mockResolvedValue(vi.fn());
    mocks.onPlayerQueueChanged.mockResolvedValue(vi.fn());
    mocks.onPlayerError.mockResolvedValue(vi.fn());
    mocks.pausePlayback.mockResolvedValue(emptyPlayerSnapshot());
  });

  it("refreshes the active library when the filesystem watcher publishes a change", async () => {
    let publish: ((event: LibraryChangedEvent) => void) | undefined;
    mocks.onLibraryChanged.mockImplementationOnce(
      (handler: (event: LibraryChangedEvent) => void) => {
        publish = handler;
        return Promise.resolve(vi.fn());
      },
    );
    const projectionChanged = vi.fn();
    window.addEventListener(
      "basis:library-projection-changed",
      projectionChanged,
    );
    renderShell();
    await screen.findByRole("link", { name: "Albums" });

    act(() => {
      publish?.({
        summary: {
          libraryId: "00000000-0000-0000-0000-000000000001",
          rootInstanceHash: "root",
          rootPath: "C:/Music",
          trackCount: 8,
          status: "ready",
        },
        kinds: ["audio"],
        changedPaths: ["Album/new.flac"],
        error: null,
      });
    });

    expect(projectionChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener(
      "basis:library-projection-changed",
      projectionChanged,
    );
  });

  it("renders pinned Views in the top toolbar and has no permanent sidebar", async () => {
    const { container } = renderShell();
    expect(
      await screen.findByRole("link", { name: "Albums" }),
    ).toBeInTheDocument();
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector(".sidebar")).toBeNull();
    const mark = container.querySelector("svg.brand-mark");
    expect(mark).toHaveAttribute("viewBox", "350 245 580 755");
    expect(mark?.querySelector("g")).toHaveAttribute("fill", "currentColor");
    expect(
      mark?.querySelectorAll("linearGradient, radialGradient"),
    ).toHaveLength(0);
  });

  it("lets an empty library choose a music folder from the application menu", async () => {
    renderShell();
    fireEvent.click(await screen.findByLabelText("Application menu"));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Add music folder…" }),
    );
    await waitFor(() => expect(mocks.chooseLibraryRoot).toHaveBeenCalledOnce());
  });

  it("opens the command palette with Ctrl+K independently of Search", async () => {
    renderShell();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("opens the main-canvas Search route with Ctrl+F", async () => {
    renderShell();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Search" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).not.toBeInTheDocument();
  });

  it("restores the canvas scroll position for a Back history entry", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route
              index
              element={
                <HistoryPage destination="/second" label="Open second" />
              }
            />
            <Route
              path="second"
              element={<HistoryPage destination={-1} label="Return" />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const canvas = document.querySelector<HTMLElement>(".main-canvas");
    expect(canvas).not.toBeNull();
    if (!canvas) return;
    canvas.scrollTop = 137;
    fireEvent.click(screen.getByRole("button", { name: "Open second" }));
    expect(
      await screen.findByRole("button", { name: "Return" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    await waitFor(() => expect(canvas.scrollTop).toBe(137));
  });

  it("updates transport on automatic queue advance without changing the canvas", async () => {
    let stateHandler: ((event: PlayerStateEvent) => void) | undefined;
    let trackHandler: ((event: PlayerTrackChangedEvent) => void) | undefined;
    mocks.getPlayerState.mockResolvedValue(
      playingSnapshot("First track", "first-id"),
    );
    mocks.onPlayerState.mockImplementation(async (handler) => {
      stateHandler = handler;
      return vi.fn();
    });
    mocks.onPlayerTrackChanged.mockImplementation(async (handler) => {
      trackHandler = handler;
      return vi.fn();
    });

    render(
      <MemoryRouter initialEntries={["/browse"]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route
              path="browse"
              element={
                <>
                  <LocationProbe />
                  <p>Browse canvas</p>
                </>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("First track")).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent("/browse");
    const advanced = playingSnapshot("Second track", "second-id");
    act(() => {
      trackHandler?.({ currentTrack: advanced.currentTrack });
      stateHandler?.({
        status: advanced.status,
        positionMs: advanced.positionMs,
        durationMs: advanced.durationMs,
        volume: advanced.volume,
        shuffle: advanced.shuffle,
        repeat: advanced.repeat,
        error: advanced.error,
        outputDevice: advanced.outputDevice,
      });
    });
    expect(await screen.findByText("Second track")).toBeInTheDocument();
    expect(screen.getByText("Browse canvas")).toBeInTheDocument();
    expect(screen.getByTestId("current-location")).toHaveTextContent("/browse");
  });

  it("toggles playback with Space outside editable controls", async () => {
    mocks.getPlayerState.mockResolvedValue(
      playingSnapshot("Keyboard track", "keyboard-id"),
    );
    renderShell();
    expect(await screen.findByText("Keyboard track")).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "Space", key: " " });
    await waitFor(() => expect(mocks.pausePlayback).toHaveBeenCalledOnce());
  });
});

function emptyPlayerSnapshot() {
  return {
    status: "idle" as const,
    queue: [],
    playOrder: [],
    currentIndex: null,
    currentTrack: null,
    positionMs: 0,
    durationMs: 0,
    volume: 80,
    shuffle: false,
    repeat: "off" as const,
    error: null,
    outputDevice: null,
  };
}

function playingSnapshot(title: string, id: string): PlayerSnapshot {
  const item = {
    queueId: `queue-${id}`,
    track: {
      id,
      relPath: `Album/${title}.flac`,
      title,
      artist: "Artist",
      artists: ["Artist"],
      albumArtist: "Artist",
      album: "Album",
      year: 2026,
      trackNo: 1,
      discNo: 1,
      genres: [],
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
    },
  };
  return {
    status: "playing",
    queue: [item],
    playOrder: [item.queueId],
    currentIndex: 0,
    currentTrack: item,
    positionMs: 1_000,
    durationMs: 180_000,
    volume: 80,
    shuffle: false,
    repeat: "off",
    error: null,
    outputDevice: null,
  };
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<p>Library canvas</p>} />
          <Route path="search" element={<h1>Search</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function HistoryPage({
  destination,
  label,
}: {
  destination: string | number;
  label: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() =>
        typeof destination === "number"
          ? navigate(destination)
          : navigate(destination)
      }
    >
      {label}
    </button>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="current-location">{location.pathname}</span>;
}

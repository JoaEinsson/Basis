import type { InvokeArgs } from "@tauri-apps/api/core";
import type {
  AlbumDto,
  ArtistDto,
  GlobalSearchResults,
  LyricsResolution,
  PlayerSnapshot,
  Playlist,
  QueryItems,
  QueryRequest,
  ThemeAppearance,
  TrackDto,
  ViewDefinition,
} from "../lib/types";
import nocturneTheme from "../../src-tauri/themes/nocturne.json";
import paperTheme from "../../src-tauri/themes/paper.json";

type FixtureMode =
  "library" | "synced" | "plain" | "instrumental" | "lyrics-error";

const tracks: TrackDto[] = [
  track({
    id: "signal-bloom",
    relPath: "Northbound/Glass Signals/01 Signal Bloom.flac",
    title: "Signal Bloom",
    artist: "Northbound",
    album: "Glass Signals",
    year: 2026,
    favorite: true,
    playCount: 7,
    lastPlayed: 1_788_201_600,
    artworkKey: "artwork:glass-signals",
  }),
  track({
    id: "afterimage",
    relPath: "Northbound/Glass Signals/02 Afterimage.flac",
    title: "Afterimage",
    artist: "Northbound feat. Mira Vale",
    albumArtist: "Northbound",
    album: "Glass Signals",
    year: 2026,
    trackNo: 2,
    artworkKey: "artwork:glass-signals",
  }),
  track({
    id: "low-tide",
    relPath: "Mira Vale/Low Tide/01 Low Tide.flac",
    title: "Low Tide",
    artist: "Mira Vale",
    album: "Low Tide",
    year: 2024,
    artworkKey: "artwork:low-tide",
  }),
  track({
    id: "static-rooms",
    relPath: "Kestrel/Static Rooms/04 Static Rooms.flac",
    title: "Static Rooms (Live at the Observatory)",
    artist: "Kestrel",
    album: "Static Rooms",
    year: 2023,
    trackNo: 4,
    artworkKey: "artwork:static-rooms",
  }),
  track({
    id: "instrumental",
    relPath: "Northbound/Glass Signals/05 Carrier Wave.flac",
    title: "Carrier Wave",
    artist: "Northbound",
    album: "Glass Signals",
    year: 2026,
    trackNo: 5,
    artworkKey: "artwork:glass-signals",
  }),
];

const albums: AlbumDto[] = [
  album("album:glass-signals", "Glass Signals", "Northbound", 2026, 3),
  album("album:low-tide", "Low Tide", "Mira Vale", 2024, 1),
  album("album:static-rooms", "Static Rooms", "Kestrel", 2023, 1),
  album("album:night-geometry", "Night Geometry", "Soft Divide", 2025, 9),
  album("album:unlit", "The Unlit Archive", "Various Artists", 2022, 12),
];

const artists: ArtistDto[] = [
  {
    artistKey: "artist:northbound",
    name: "Northbound",
    albumCount: 2,
    trackCount: 14,
  },
  {
    artistKey: "artist:mira-vale",
    name: "Mira Vale",
    albumCount: 3,
    trackCount: 27,
  },
  {
    artistKey: "artist:kestrel",
    name: "Kestrel",
    albumCount: 1,
    trackCount: 8,
  },
];

const views: ViewDefinition[] = [
  view("builtin:home", "Home", "track", "list", false, "addedAt"),
  view("builtin:albums", "Albums", "album", "grid", true, "album"),
  view("builtin:artists", "Artists", "artist", "grid", true, "artist"),
  view("builtin:tracks", "Tracks", "track", "table", true, "title"),
  view("builtin:folders", "Folders", "folder", "list", true, "path"),
  view("builtin:genres", "Genres", "genre", "list", true, "genre"),
  view(
    "builtin:recently-added",
    "Recently Added",
    "track",
    "list",
    false,
    "addedAt",
  ),
  view(
    "builtin:recently-played",
    "Recently Played",
    "track",
    "list",
    false,
    "lastPlayed",
  ),
  view("builtin:favorites", "Favorites", "track", "table", false, "title"),
];

const staticPlaylist: Playlist = {
  type: "static",
  schema_version: 1,
  id: "fixture-static",
  name: "Late Signals",
  items: [
    ...tracks.slice(0, 3).map((item) => ({
      path: item.relPath,
      hint: hintFor(item),
    })),
    {
      path: "Moved/Unavailable Signal.flac",
      hint: {
        title: "Unavailable Signal",
        artist: "Northbound",
        album: "Glass Signals",
        duration_ms: 224_000,
        disc_no: 1,
        track_no: 9,
      },
    },
  ],
};

const smartPlaylist: Playlist = {
  type: "smart",
  schema_version: 1,
  id: "fixture-smart",
  name: "Recently Loved",
  query: {
    kind: "predicate",
    field: "favorite",
    op: "eq",
    value: true,
  },
  sort: [{ field: "lastPlayed", direction: "desc" }],
};

let activeMode: FixtureMode = "library";
let playerSnapshot = snapshotFor("library");

export async function installVisualFixture(requestedMode: string) {
  const { mockIPC, mockWindows } = await import("@tauri-apps/api/mocks");
  const fixture = requestedMode.replace(/^(paper|nocturne)-/, "");
  if (requestedMode.startsWith("paper-")) {
    window.localStorage.setItem("basis.theme.manualAppearance", "light");
  } else if (requestedMode.startsWith("nocturne-")) {
    window.localStorage.setItem("basis.theme.manualAppearance", "dark");
  }
  activeMode = isFixtureMode(fixture) ? fixture : "library";
  playerSnapshot = snapshotFor(activeMode);
  mockWindows("main");
  mockIPC(handleFixtureCommand, { shouldMockEvents: true });
  document.documentElement.dataset.visualFixture = activeMode;
}

export function handleFixtureCommand(
  command: string,
  payload: InvokeArgs = {},
): unknown {
  switch (command) {
    case "app_health":
      return { appName: "Basis", version: "0.1.0", status: "ok" };
    case "updater_policy":
      return updatePolicy();
    case "updater_begin_check":
      return { allowed: false, policy: updatePolicy() };
    case "updater_set_automatic_checks":
      return {
        ...updatePolicy(),
        automaticChecksEnabled: Boolean(payload.enabled),
      };
    case "library_status":
    case "library_choose_root":
      return librarySummary();
    case "views_list":
      return views;
    case "views_set_pinned":
      return payload.ids ?? [];
    case "views_save":
      return payload.view;
    case "views_duplicate":
      return { ...views[1], id: "fixture:duplicate", name: payload.name };
    case "views_delete":
    case "playlists_delete":
      return null;
    case "query_parse":
      return { kind: "text", value: String(payload.input ?? "") };
    case "query_execute":
      return queryPage(payload.request as QueryRequest);
    case "search_global":
      return searchResults();
    case "album_detail":
      return { album: albums[0], tracks: tracks.slice(0, 3) };
    case "artist_detail":
      return {
        artist: artists[0],
        albums: albums.slice(0, 2),
        tracks: tracks.slice(0, 3),
      };
    case "artwork_thumbnail":
      return null;
    case "player_get_state":
      return playerSnapshot;
    case "player_play_collection":
    case "player_resume":
    case "player_next":
    case "player_previous":
      playerSnapshot = { ...playerSnapshot, status: "playing" };
      return playerSnapshot;
    case "player_pause":
      playerSnapshot = { ...playerSnapshot, status: "paused" };
      return playerSnapshot;
    case "player_seek":
      playerSnapshot = {
        ...playerSnapshot,
        positionMs: Number(payload.positionMs ?? 0),
      };
      return playerSnapshot;
    case "player_set_volume":
      playerSnapshot = {
        ...playerSnapshot,
        volume: Number(payload.volume ?? 0.72),
      };
      return playerSnapshot;
    case "player_set_shuffle":
      playerSnapshot = { ...playerSnapshot, shuffle: Boolean(payload.enabled) };
      return playerSnapshot;
    case "player_set_repeat":
      playerSnapshot = {
        ...playerSnapshot,
        repeat: payload.repeat as PlayerSnapshot["repeat"],
      };
      return playerSnapshot;
    case "lyrics_resolve":
    case "lyrics_choose_candidate":
      if (activeMode === "lyrics-error") throw "Lyrics provider unavailable.";
      return lyricsFor(activeMode);
    case "playlists_list":
      return {
        playlists: [staticPlaylist, smartPlaylist],
        warnings: ["fixture-invalid.json: unsupported schema version"],
      };
    case "playlists_create":
      return {
        ...(payload.draft as object),
        schema_version: 1,
        id: "fixture-created",
      };
    case "playlists_update":
      return payload.playlist;
    case "playlists_resolve":
      return resolvedPlaylist(String(payload.id ?? staticPlaylist.id));
    case "favorite_set":
      return {
        id: "fixture:favorite",
        ts: "2026-09-01T12:00:00Z",
        type: "favorite_set",
        track: { path: tracks[0].relPath, hint: hintFor(tracks[0]) },
        payload: { value: Boolean(payload.value) },
      };
    case "themes_list":
      return {
        themes: [
          theme("builtin:nocturne", "Nocturne", "dark"),
          theme("builtin:paper", "Paper", "light"),
        ],
        warnings: [],
      };
    case "theme_selection":
      return {
        lightSelection: "builtin:paper",
        darkSelection: "builtin:nocturne",
        followSystemAppearance: false,
      };
    case "theme_resolve": {
      const id = String(payload.id ?? "builtin:nocturne");
      const paper = id === "builtin:paper";
      return {
        id,
        name: paper ? "Paper" : "Nocturne",
        appearance: paper ? "light" : "dark",
        tokens: {
          ...fixtureThemeDefaults,
          ...(paper ? paperTheme.tokens : nocturneTheme.tokens),
        },
        warnings: [],
      };
    }
    case "theme_set_selection":
      return {
        lightSelection:
          payload.appearance === "light" ? payload.id : "builtin:paper",
        darkSelection:
          payload.appearance === "dark" ? payload.id : "builtin:nocturne",
        followSystemAppearance: Boolean(payload.followSystemAppearance),
      };
    case "theme_token_registry":
      return [];
    default:
      throw new Error(
        `Visual fixture does not implement Tauri command: ${command}`,
      );
  }
}

function queryPage(request: QueryRequest) {
  let items: QueryItems;
  switch (request.entity) {
    case "album":
      items = { kind: "albums", items: albums };
      break;
    case "artist":
      items = { kind: "artists", items: artists };
      break;
    case "folder":
      items = {
        kind: "folders",
        items: [
          {
            path: "Northbound/Glass Signals",
            name: "Glass Signals",
            trackCount: 3,
          },
          { path: "Mira Vale/Low Tide", name: "Low Tide", trackCount: 1 },
          { path: "Kestrel/Static Rooms", name: "Static Rooms", trackCount: 1 },
        ],
      };
      break;
    case "genre":
      items = {
        kind: "genres",
        items: [
          { name: "Alternative", trackCount: 3 },
          { name: "Electronic", trackCount: 2 },
          { name: "Post-rock", trackCount: 1 },
        ],
      };
      break;
    default:
      items = { kind: "tracks", items: tracks };
  }
  return {
    entity: request.entity,
    page: request.page,
    pageSize: request.pageSize,
    hasMore: false,
    items,
  };
}

function searchResults(): GlobalSearchResults {
  return {
    query: { kind: "text", value: "signal" },
    artists: artists.slice(0, 2),
    albums: albums.slice(0, 2),
    tracks: tracks.slice(0, 3),
    folders: [
      {
        path: "Northbound/Glass Signals",
        name: "Glass Signals",
        trackCount: 3,
      },
    ],
    genres: [{ name: "Alternative", trackCount: 3 }],
    playlists: [
      { id: "fixture:playlist", name: "Late Signals", kind: "playlist" },
    ],
    views: [{ id: "builtin:favorites", name: "Favorites", kind: "view" }],
  };
}

function resolvedPlaylist(id: string) {
  const playlist = id === smartPlaylist.id ? smartPlaylist : staticPlaylist;
  if (playlist.type === "smart") {
    return {
      playlist,
      items: tracks.slice(0, 2).map((item) => ({
        item: { path: item.relPath, hint: hintFor(item) },
        track: item,
        suggested_path: null,
      })),
    };
  }
  return {
    playlist,
    items: playlist.items.map((item) => {
      const matchingTrack = tracks.find((track) => track.relPath === item.path);
      return {
        item,
        track: matchingTrack ?? null,
        suggested_path: matchingTrack
          ? null
          : "Northbound/Glass Signals/09 Signal.flac",
      };
    }),
  };
}

function snapshotFor(mode: FixtureMode): PlayerSnapshot {
  const activeTrack = mode === "instrumental" ? tracks[4] : tracks[0];
  const queue = tracks.map((item, index) => ({
    queueId: `fixture:queue:${index}`,
    track: item,
  }));
  const currentIndex = tracks.indexOf(activeTrack);
  const currentTrack = queue[currentIndex < 0 ? 0 : currentIndex];
  return {
    status: "playing",
    queue,
    playOrder: queue.map((item) => item.queueId),
    currentIndex: currentIndex < 0 ? 0 : currentIndex,
    currentTrack,
    positionMs: 74_000,
    durationMs: activeTrack.durationMs,
    volume: 0.72,
    shuffle: false,
    repeat: "off",
    error: null,
    outputDevice: "Fixture audio output",
  };
}

function lyricsFor(mode: FixtureMode): LyricsResolution {
  if (mode === "instrumental") {
    return {
      document: {
        source: "embedded",
        synced: false,
        instrumental: true,
        lines: [],
        plainText: null,
      },
      candidates: [],
      message: null,
    };
  }
  if (mode === "plain") {
    return {
      document: {
        source: "embedded",
        synced: false,
        instrumental: false,
        lines: [],
        plainText:
          "The city folds into a line of light\nWe follow every quiet frequency\nA signal blooms beyond the edge of night\nAnd carries all the distance back to me",
      },
      candidates: [],
      message: "Plain lyrics",
    };
  }
  return {
    document: {
      source: "lrclib",
      synced: true,
      instrumental: false,
      plainText: null,
      lines: [
        { timestampMs: 18_000, text: "The city folds into a line of light" },
        { timestampMs: 42_000, text: "We follow every quiet frequency" },
        {
          timestampMs: 68_000,
          text: "A signal blooms beyond the edge of night",
        },
        {
          timestampMs: 92_000,
          text: "And carries all the distance back to me",
        },
        {
          timestampMs: 118_000,
          text: "Long lines must wrap naturally instead of creating a horizontal scrollbar inside the lyrics pane",
        },
        { timestampMs: 146_000, text: "Stay near the sound" },
        { timestampMs: 172_000, text: "Stay near the sound" },
        { timestampMs: 198_000, text: "♪" },
      ],
    },
    candidates: [],
    message: null,
  };
}

function track(
  overrides: Partial<TrackDto> & Pick<TrackDto, "id" | "relPath">,
): TrackDto {
  return {
    id: overrides.id,
    relPath: overrides.relPath,
    title: overrides.title ?? null,
    artist: overrides.artist ?? "Northbound",
    artists: overrides.artists ?? [overrides.artist ?? "Northbound"],
    albumArtist: overrides.albumArtist ?? overrides.artist ?? "Northbound",
    album: overrides.album ?? "Glass Signals",
    year: overrides.year ?? 2026,
    trackNo: overrides.trackNo ?? 1,
    discNo: overrides.discNo ?? 1,
    genres: overrides.genres ?? ["Alternative"],
    composer: overrides.composer ?? null,
    durationMs: overrides.durationMs ?? 238_000,
    codec: overrides.codec ?? "FLAC",
    container: overrides.container ?? "FLAC",
    sampleRate: overrides.sampleRate ?? 48_000,
    bitDepth: overrides.bitDepth ?? 24,
    channels: overrides.channels ?? 2,
    bitrate: overrides.bitrate ?? 1_240_000,
    artworkKey: overrides.artworkKey ?? null,
    addedAt: overrides.addedAt ?? 1_788_201_600,
    lastPlayed: overrides.lastPlayed ?? null,
    playCount: overrides.playCount ?? 0,
    favorite: overrides.favorite ?? false,
  };
}

function album(
  albumKey: string,
  title: string,
  albumArtist: string,
  year: number,
  trackCount: number,
): AlbumDto {
  return {
    albumKey,
    title,
    albumArtist,
    year,
    trackCount,
    durationMs: trackCount * 238_000,
    artworkKey: `artwork:${albumKey}`,
    unknown: false,
  };
}

function view(
  id: string,
  name: string,
  entity: ViewDefinition["entity"],
  kind: ViewDefinition["layout"]["kind"],
  pinned: boolean,
  sortField: ViewDefinition["sort"][number]["field"],
): ViewDefinition {
  return {
    schema_version: 1,
    id,
    name,
    icon: null,
    entity,
    query: { kind: "and", items: [] },
    group_by: [],
    sort: [{ field: sortField, direction: "asc" }],
    layout: {
      kind,
      density: "comfortable",
      cover_size: kind === "grid" ? 192 : null,
      visible_fields: ["title", "artist", "album", "year", "duration"],
    },
    pin_to_sidebar: pinned,
  };
}

function theme(id: string, name: string, appearance: ThemeAppearance) {
  return { id, name, appearance, basedOn: null, builtIn: true };
}

function librarySummary() {
  return {
    libraryId: "00000000-0000-0000-0000-000000000001",
    rootInstanceHash: "visual-fixture",
    rootPath: "C:/Basis Visual Fixture",
    trackCount: tracks.length,
    status: "ready" as const,
  };
}

function updatePolicy() {
  return {
    automaticChecksEnabled: true,
    lastCheckAt: "2026-09-01T12:00:00Z",
    automaticCheckDue: false,
  };
}

function hintFor(item: TrackDto) {
  return {
    title: item.title,
    artist: item.artist,
    album: item.album,
    duration_ms: item.durationMs,
    disc_no: item.discNo,
    track_no: item.trackNo,
  };
}

function isFixtureMode(value: string): value is FixtureMode {
  return [
    "library",
    "synced",
    "plain",
    "instrumental",
    "lyrics-error",
  ].includes(value);
}

// These are registry defaults used directly by current CSS rather than through
// a compatibility alias. The Rust Theme Engine merges them before returning a
// resolved theme; the browser fixture mirrors that final DTO shape.
const fixtureThemeDefaults = {
  "color.background.titlebar": "#15171c",
  "color.background.menu": "#1c1f26",
  "color.background.tooltip": "#24262d",
  "color.background.scrim": "#00000099",
  "color.interaction.pressed": "#123734",
  "color.interaction.dragInsertion": "#49d9c7",
  "color.windowControl.hover": "#24262d",
  "color.windowControl.closeHover": "#c42b1c",
  "color.windowControl.closeForeground": "#ffffff",
  "color.border.menu": "#3a3d46",
  "color.accent.hover": "#5de1d0",
  "color.accent.active": "#20afc8",
  "color.accent.muted": "#123734",
  "color.player.progress": "#49d9c7",
  "color.player.progressTrack": "#3a3d46",
  "color.player.buffered": "#666b78",
  "color.lyrics.active": "#f4f5f7",
  "color.lyrics.past": "#747b8d",
  "color.lyrics.upcoming": "#a9afbd",
  "color.lyrics.translation": "#8b91a0",
  "motion.duration.slow": 320,
  "motion.duration.route": 240,
  "motion.duration.overlay": 180,
  "motion.duration.sharedArtwork": 320,
  "motion.duration.dragSettlement": 180,
  "motion.delay.staggerStep": 24,
  "motion.easing.springSoft": "cubic-bezier(0.22, 1, 0.36, 1)",
  "motion.easing.springFirm": "cubic-bezier(0.16, 1, 0.3, 1)",
  "motion.distance.route": 18,
  "motion.distance.overlay": 8,
  "motion.distance.dragLift": 4,
  "motion.scale.pressed": 0.97,
  "motion.scale.popoverFrom": 0.98,
  "motion.scale.artworkHover": 1.025,
  "component.lyrics.activeScale": 1.04,
  "component.lyrics.inactiveOpacity": 0.62,
};

# SPEC — Data-Driven Local Music Player

## 0. Execution instruction for Codex

Build this application now. Do not stop at scaffolding, mockups, pseudocode, or TODOs for the core flow. Make reasonable implementation decisions without asking questions unless there is a hard blocker. Run/type-check/test after each milestone and fix failures before continuing.

The target is a usable desktop prototype in a few hours, not a perfect audiophile player. Prioritize the data model, library UX, search, custom representations, playlists, a portable data-driven theme system with an in-app theme editor, solid playback, LRCLIB synced lyrics, and a signed updater. Keep architecture clean enough that DSP/output work can be added later without rewriting the app.

Do **not** expand today's scope into EQ, convolution, WASAPI exclusive, PipeWire graph introspection, fingerprinting, MusicBrainz enrichment, Last.fm auth, cloud accounts, mobile, or a custom decoder. Those are backlog items. **LRCLIB integration, a signed application updater, and the portable data-driven theme system/theme editor are mandatory MVP features, not stretch goals.**

Working title/package name can be `music-vault` until renamed.

---

# 1. Product thesis

This is **not playlist-centric** and **not database-owned**.

The product model is:

> The user's music folder is the durable library. Metadata is the semantic center. The player is a replaceable interpretation of that data.

The app should feel closer to an Obsidian-style vault applied to music:

- user chooses a library root;
- audio files and standard metadata remain the primary musical data;
- portable player data is stored inside that root in human-readable files;
- SQLite is a disposable/rebuildable index for speed;
- the user can choose multiple representations of the same dataset;
- Albums, Artists, Folders, Genres, Tracks, saved searches, smart playlists, etc. are views/projections, not competing primary models;
- playlists are just ordered selections or saved queries;
- queue/playback state is separate from playlists;
- no absolute path from a particular OS may be required in portable data.

Syncthing friendliness is a **consequence**, not the purpose. The same architecture should also work well with rsync, Git for metadata, backups, NAS copies, or manual folder copies.

---

# 2. Platform/stack

## Desktop

- Tauri 2
- React + TypeScript + Vite
- Rust backend
- Windows + Linux first-class

## Frontend dependencies

Keep dependency count modest. Suggested:

- React Router for navigation/history
- Zustand for lightweight UI/player state
- `@tanstack/react-virtual` for large lists/tables
- `lucide-react` for icons
- Tailwind CSS or a small token-based CSS system; choose whichever gets a refined UI faster
- optional mature primitive library only where it materially speeds up accessibility (dialogs/popovers/context menus)

Do not add a giant UI framework.

## Rust dependencies

Preferred:

- `tauri`
- `serde`, `serde_json`
- `rusqlite` with bundled SQLite/FTS5
- `lofty` for metadata/tag parsing
- `voxio` behind an internal `AudioEngine` abstraction
- `notify` for filesystem watching
- `ignore` for recursive scanning
- `nucleo` or `nucleo-matcher` for command-palette fuzzy matching
- `uuid`
- `tauri-plugin-updater` for signed application updates
- `tauri-plugin-process` if needed for relaunch after update
- `reqwest` or the Tauri HTTP/client path already in use for LRCLIB (prefer one network stack, not two)
- `blake3` if useful for cache keys
- `tempfile` for atomic portable-data writes
- `thiserror`/`anyhow` as appropriate

### Important Voxio policy

Voxio is useful for the fast prototype because it already provides playback-oriented behavior such as gapless priming, ReplayGain support, resampling/device recovery and common codec support via Symphonia. However it is still a young project.

Therefore:

1. hide it behind our own `AudioEngine` trait immediately;
2. pin dependencies through `Cargo.lock`;
3. do not leak Voxio types into the rest of the domain;
4. timebox integration friction: if Voxio consumes more than ~30–45 minutes because of an API/platform issue, use Rodio or a minimal Symphonia+CPAL adapter temporarily behind the same trait instead of derailing the project.

---

# 3. Non-negotiable architectural principles

## 3.1 Metadata is the semantic center

A track is described by metadata, not by which playlist contains it or by its filesystem hierarchy.

Core fields should include at minimum:

- title
- artist(s)
- album artist
- album
- year/date
- track number
- disc number
- genre(s)
- composer if present
- duration
- codec/container
- sample rate
- bit depth where available
- channels
- bitrate where available
- relative path
- file size + mtime for incremental indexing
- artwork reference/cache key

A folder path is a location and optionally a view dimension. It is not assumed to mean Artist/Album.

## 3.2 Portable data vs local index

The app has two classes of state.

### Durable/portable library state

Lives inside the chosen library root in `.musiclib/`.

Examples:

- saved views
- static playlists
- smart playlists
- custom tags/overrides
- portable workspace/sidebar representation
- user-created theme definitions and theme selection
- per-device event/history logs
- schema/version information

### Local/rebuildable state

Lives in the normal OS application-data/cache directories.

Examples:

- SQLite index
- thumbnail cache
- waveform cache
- selected audio device
- volume
- window dimensions/position
- transient queue/session state
- scanner cache

Deleting the SQLite database must never destroy user-authored library information. The app must be able to rebuild it from the library root + `.musiclib/`.

## 3.3 No absolute paths in portable data

Portable references use normalized paths relative to the library root, using `/` as the serialized separator.

Example:

```json
{
  "path": "Sleep Token/2025 - Even in Arcadia/01 - Look To Windward.m4a"
}
```

Runtime resolution:

- Windows: `D:\\Music` + relative path
- Linux: `/home/user/Music` + relative path

Never serialize `D:\\Music...` or `/home/foo/Music...` inside `.musiclib/`.

## 3.4 Queue is not playlist

Playback model:

```text
Album / Artist / View / Search / Playlist / Radio
                    ↓
                  Queue
                    ↓
                 Player
```

Playing an album creates/replaces/appends to the queue. It does not convert the album into a playlist.

---

# 4. Library-root layout

When the user selects a root, create only one hidden management directory:

```text
Music/
├── <user's existing audio organization; do not force a structure>
│
└── .musiclib/
    ├── manifest.json
    ├── workspace.json
    ├── views/
    ├── playlists/
    ├── themes/
    ├── events/
    └── overrides/
```

Do not rearrange audio files automatically.

## `manifest.json`

Example:

```json
{
  "format": "musiclib",
  "schema_version": 1,
  "library_id": "uuid",
  "created_at": "ISO-8601"
}
```

## `workspace.json`

Portable representation/preferences, e.g.:

```json
{
  "schema_version": 1,
  "default_view": "builtin:home",
  "theme": {
    "selection": "builtin:nocturne",
    "follow_system_appearance": false
  },
  "sidebar": [
    "builtin:home",
    "builtin:albums",
    "builtin:artists",
    "builtin:tracks",
    "builtin:folders",
    "builtin:genres",
    "builtin:favorites"
  ],
  "home_sections": [
    "builtin:recently-added",
    "builtin:recently-played",
    "builtin:favorites"
  ]
}
```

View/sidebar organization should therefore follow the library to another machine.

Device-specific things such as output device and window geometry must **not** go here.

---

# 5. Identity/reference strategy for MVP

Do not block the project on perfect content identity/fingerprinting.

For MVP:

- canonical portable reference = normalized relative path;
- compute a local deterministic `track_id` from library UUID + normalized relative path for indexing;
- static playlist entries also store metadata hints for recovery:
  - title
  - artist
  - album
  - duration_ms
  - track/disc number

Example:

```json
{
  "track_id": "...",
  "path": "Artist/Album/01 - Song.m4a",
  "hint": {
    "title": "Song",
    "artist": "Artist",
    "album": "Album",
    "duration_ms": 212340,
    "track": 1,
    "disc": 1
  }
}
```

If an external rename makes the path unresolved, attempt conservative relinking using the hints. Do not silently relink ambiguous matches.

Backlog: add a stronger identity strategy/audio fingerprint later.

---

# 6. SQLite index

Use SQLite as a disposable index.

Suggested minimum schema:

```sql
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL UNIQUE,
  title TEXT,
  artist TEXT,
  album_artist TEXT,
  album TEXT,
  year INTEGER,
  track_no INTEGER,
  disc_no INTEGER,
  genres_json TEXT,
  composer TEXT,
  duration_ms INTEGER,
  codec TEXT,
  container TEXT,
  sample_rate INTEGER,
  bit_depth INTEGER,
  channels INTEGER,
  bitrate INTEGER,
  file_size INTEGER NOT NULL,
  mtime_ns INTEGER NOT NULL,
  artwork_key TEXT,
  added_at INTEGER NOT NULL
);

CREATE INDEX idx_tracks_album ON tracks(album_artist, album, disc_no, track_no);
CREATE INDEX idx_tracks_artist ON tracks(artist);
CREATE INDEX idx_tracks_year ON tracks(year);
CREATE INDEX idx_tracks_rel_path ON tracks(rel_path);
```

Also derive materialized/indexed entity tables if it materially simplifies/faster implementation:

- `albums`
- `artists`

An album key may initially be derived from normalized `(album_artist, album, year?)`. Be conservative with collisions.

## FTS5

Use FTS5 for broad text lookup over fields such as:

- title
- artist
- album artist
- album
- genre
- composer
- path

Keep FTS synchronized with the `tracks` table.

---

# 7. Search/query engine

This is a central product primitive. Search bar, filter UI, smart playlists and saved views should compile to the same query model.

## 7.1 Query AST

Do not persist raw SQL in `.musiclib`.

Use a serializable AST, roughly:

```ts
type Expr =
  | { kind: "and"; items: Expr[] }
  | { kind: "or"; items: Expr[] }
  | { kind: "not"; item: Expr }
  | { kind: "text"; value: string }
  | {
      kind: "predicate";
      field: string;
      op: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "in";
      value: unknown;
    };
```

Compile this to parameterized SQLite queries. Never concatenate user query values into SQL.

## 7.2 Search syntax

Provide friendly free text plus simple structured expressions from day one.

Examples:

```text
sleep token
artist:"Sleep Token"
album:"Even in Arcadia"
genre:country
year:>=2020
codec:flac
samplerate:>48000
favorite:true
```

Whitespace can mean AND for MVP. Quoted values must work.

The graphical filter builder must create the same AST.

## 7.3 Fuzzy command palette

`Ctrl+K` opens a command palette using Nucleo fuzzy matching for:

- tracks
- albums
- artists
- saved views
- playlists
- actions

Examples:

```text
> sleep arc
  Artist · Sleep Token
  Album  · Even in Arcadia
  Track  · Atlantic
  Action · Create view from current search
```

The palette must be keyboard-operable.

---

# 8. Generic View Engine — core differentiator

Do not hardcode Albums/Artists/Genres as unrelated pages with unrelated query logic.

Implement a generic `ViewDefinition` and make built-in navigation use it too.

Suggested shape:

```ts
type EntityKind = "track" | "album" | "artist" | "folder" | "genre";
type LayoutKind = "grid" | "list" | "table";

interface ViewDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  icon?: string;
  entity: EntityKind;
  query: Expr;
  groupBy: string[];
  sort: Array<{ field: string; direction: "asc" | "desc" }>;
  layout: {
    kind: LayoutKind;
    density: "compact" | "comfortable" | "spacious";
    coverSize?: number;
    visibleFields?: string[];
  };
  pinToSidebar: boolean;
}
```

Persist user-created views as individual JSON files in `.musiclib/views/`.

## Built-in presets

Built-ins should be expressible by the same engine, even if shipped in code:

- Albums
- Artists
- Tracks
- Folders
- Genres
- Recently Added
- Recently Played
- Favorites
- Never Played (when event data exists)

## User personalization

From any result set, user can:

- filter;
- sort;
- group;
- change Grid/List/Table;
- change density;
- select visible table fields;
- change cover/card size for grid;
- save current configuration as a named View;
- pin/unpin to sidebar;
- duplicate a built-in view and modify it;
- reorder sidebar entries by drag-and-drop;
- hide built-in views they do not care about.

This is required in the first usable prototype.

---

# 9. UX requirements

The first build should feel like a product, not a database demo.

## 9.1 App shell

Three conceptual regions:

```text
┌──────────────┬──────────────────────────────────┐
│ Sidebar      │ Main content                     │
│              │                                  │
│ Home         │                                  │
│ Albums       │                                  │
│ Artists      │                                  │
│ custom views │                                  │
│ playlists    │                                  │
├──────────────┴──────────────────────────────────┤
│ persistent Now Playing / transport / queue      │
└─────────────────────────────────────────────────┘
```

Sidebar resizable, compact, reorderable.

## 9.2 Navigation

Implement:

- Back/forward navigation
- breadcrumbs where useful
- keyboard shortcuts
- `Ctrl+K` command palette
- `/` or `Ctrl+F` focus search
- `Space` play/pause when appropriate
- media key integration if Tauri/platform support is quick

## 9.3 Albums

Grid by default.

Clicking an album **must navigate to a dedicated album representation containing only that album**. Never emulate Tauon-style "scroll the global playlist to this album" behavior.

Album detail:

```text
< Back

[ artwork ]   Even in Arcadia
              Sleep Token · 2025
              10 tracks · duration

              [ Play ] [ Shuffle ] [ ... ]

01  Track                                      4:12
02  Track                                      5:03
...
```

Sort tracks by disc then track number.

## 9.4 Artist detail

Show:

- artist name
- album grid sorted by year/default user preference
- track list optional section
- Play / Shuffle

## 9.5 Tracks view

Virtualized table/list with customizable columns.

Good default fields:

- title
- artist
- album
- year
- duration

Advanced fields can be toggled:

- codec
- sample rate
- bit depth
- path
- genre
- play count

## 9.6 Folder view

Represent the actual filesystem hierarchy independently from metadata.

This lets users who prefer filesystem organization browse it directly without making folders the semantic model of the rest of the app.

## 9.7 Filters

Show filters as removable chips:

```text
[ Artist: Sleep Token × ] [ Year: ≥ 2020 × ]
```

Have an "Add filter" UI generated from known metadata fields.

## 9.8 Context actions

Right-click/entity menu should support the useful core actions:

- Play now
- Play next
- Add to queue
- Add to playlist
- Show album
- Show artist
- Show in folder
- Favorite/unfavorite

No destructive filesystem operations in MVP.

## 9.9 Multi-select

Tracks should support Ctrl/Shift selection and bulk queue/playlist actions.

## 9.10 Visual design

- dark-first, understated, contemporary;
- prioritize typography/spacing/artwork over chrome;
- avoid "audiophile equipment" skeuomorphism;
- restrained motion, ~150–220ms for navigation/state transitions;
- clear hover/focus/selected states;
- no giant borders around every element;
- support keyboard focus visibly;
- use skeleton/progressive loading during first scan rather than freezing;
- handle small and large desktop windows gracefully.

All visual styling must flow through the mandatory Theme Engine in section 10. Do not hardcode ad-hoc colors/radii/spacing in feature components.

---


# 10. Data-driven Theme System — mandatory MVP

The visual system follows the same product philosophy as the library: **stable semantic data first, representation second**. Themes are data, never executable code. A user theme must be portable, human-readable, diffable, safe to sync/copy/version, and resilient across application updates.

Do not adopt Material, Fluent, Carbon, or another design system wholesale. Build an application-specific token grammar using the strongest ideas common to mature systems:

- a **reference → semantic/system → component** hierarchy, similar to Material's reference/system/component token layers;
- **raw/global values separated from semantic aliases**, similar to Fluent's global + alias tokens;
- **stable role-based token names whose meaning does not change between themes**, as emphasized by Carbon;
- neutral layered surfaces, accessible state colors, a deliberate spacing ramp, typography roles, elevation, shape, motion, and density.

This lets the product have its own visual identity while keeping the theme format durable.

## 10.1 Theme storage and portability

Built-in themes ship read-only with the application. User themes live under:

```text
.musiclib/
└── themes/
    ├── my-theme.json
    └── studio-custom.json
```

`workspace.json` stores the selected theme by stable ID. Custom themes therefore follow the library when it is copied/synced, while device-specific rendering details remain local.

Also support explicit **Export Theme…** / **Import Theme…** so a theme can be shared independently of a library.

Never store arbitrary CSS, HTML, JavaScript, remote URLs, or executable expressions in a theme.

## 10.2 Theme document/schema

Use sparse overrides + inheritance instead of serializing every token into every custom theme. New application tokens can then be introduced in later releases without breaking old themes.

Suggested format:

```json
{
  "$schema": "https://example.invalid/music-vault/theme.schema.json",
  "format": "music-vault-theme",
  "schema_version": 1,
  "id": "uuid",
  "name": "My Theme",
  "author": "User",
  "based_on": "builtin:nocturne",
  "appearance": "dark",
  "min_app_version": "0.1.0",
  "capabilities": [],
  "tokens": {
    "color.accent.primary": "#8b7cff",
    "shape.radius.card": 12,
    "effects.backdropBlur": 18
  },
  "behavior": {
    "accent_source": "fixed",
    "contrast_policy": "warn"
  }
}
```

`tokens` should be a string-keyed map so unknown future tokens can be preserved during read/write even when an older app version does not understand them.

## 10.3 Compatibility contract across updates

This is non-negotiable. User-authored themes should survive years of application updates.

Resolution order:

```text
application hard defaults
        ↓
built-in base theme (`based_on`)
        ↓
custom sparse token overrides
        ↓
optional runtime-derived tokens (e.g. album-art accent)
        ↓
accessibility/safety correction for critical foreground pairs
```

Rules:

1. `schema_version` is an integer owned by the theme engine, independent from app version.
2. Missing tokens always fall back through `based_on` and finally hard defaults. A missing new token must never make an old theme invalid.
3. Unknown token keys/unknown metadata fields are **preserved on roundtrip** and ignored by versions that cannot interpret them.
4. Semantic token IDs are permanent contracts. Never reuse an existing token name with different meaning.
5. Prefer adding a token over renaming one.
6. When a rename is unavoidable, ship a migration + deprecated alias mapping for at least two schema generations.
7. On load, migrate in memory from old schema → current schema. Before writing a migrated custom theme, create an atomic backup and only replace the original after validation succeeds.
8. Built-in theme IDs are permanent (`builtin:paper`, `builtin:nocturne`, `builtin:chromatic`). Their values may evolve carefully; their semantic intent may not.
9. If a referenced base theme is missing, fall back to `builtin:nocturne` for dark themes or `builtin:paper` for light themes and show a non-blocking warning.
10. `min_app_version` and optional `capabilities` are advisory compatibility metadata. Unsupported optional capabilities should degrade gracefully; do not refuse the whole theme unless its schema itself is unsupported.
11. Theme validation must be deterministic and performed before applying or persisting changes.
12. Keep a JSON Schema file in the repository and test shipped themes against it in CI.

A custom theme should normally contain only overrides. This is the primary forward-compatibility mechanism.

## 10.4 Token architecture

Use three conceptual layers internally.

### Reference tokens

Raw scales/palettes. Mostly hidden from normal users but available in Advanced Theme Editor mode:

- neutral palette steps (`ref.neutral.0` … `ref.neutral.1000`)
- accent palette steps
- success/warning/error/info palette steps
- font stacks
- font weights
- spacing scale
- radius scale
- shadow/elevation primitives
- motion duration/easing primitives

### Semantic/system tokens

These are the stable public theme contract and the main editable surface.

#### Color — surfaces

- `color.background.canvas`
- `color.background.surface`
- `color.background.surfaceRaised`
- `color.background.surfaceSunken`
- `color.background.overlay`
- `color.background.input`
- `color.background.sidebar`
- `color.background.player`

#### Color — text/icons

- `color.text.primary`
- `color.text.secondary`
- `color.text.tertiary`
- `color.text.disabled`
- `color.text.inverse`
- `color.icon.primary`
- `color.icon.secondary`
- `color.icon.disabled`

#### Color — borders/dividers

- `color.border.subtle`
- `color.border.default`
- `color.border.strong`
- `color.divider`
- `color.focus.ring`

#### Color — accent/selection

- `color.accent.primary`
- `color.accent.hover`
- `color.accent.active`
- `color.accent.muted`
- `color.accent.onAccent`
- `color.selection.background`
- `color.selection.foreground`

#### Color — semantic status

- `color.status.success`
- `color.status.onSuccess`
- `color.status.warning`
- `color.status.onWarning`
- `color.status.error`
- `color.status.onError`
- `color.status.info`
- `color.status.onInfo`

#### Music-specific colors

- `color.player.progress`
- `color.player.progressTrack`
- `color.player.buffered`
- `color.waveform.active`
- `color.waveform.inactive`
- `color.lyrics.active`
- `color.lyrics.past`
- `color.lyrics.upcoming`
- `color.lyrics.translation`
- `color.favorite`

#### Typography

- `type.family.ui`
- `type.family.display`
- `type.family.mono`
- `type.weight.regular`
- `type.weight.medium`
- `type.weight.semibold`
- `type.weight.bold`
- `type.size.caption`
- `type.size.bodySmall`
- `type.size.body`
- `type.size.bodyLarge`
- `type.size.subtitle`
- `type.size.title`
- `type.size.display`
- matching `type.lineHeight.*`
- matching `type.letterSpacing.*`
- `type.scale` global multiplier with a safe range

Use platform/system font stacks as fallbacks. Do not require a custom font file to make a theme portable.

#### Spacing/density

- `space.1` through `space.12` using a coherent ramp
- `density.scale`
- `density.trackRowHeight`
- `density.controlHeight`
- `density.sidebarItemHeight`

Base spacing should follow a 4px-oriented rhythm while retaining useful 2/6/10px intermediate steps for optical alignment.

#### Shape/stroke

- `shape.radius.none`
- `shape.radius.xs`
- `shape.radius.sm`
- `shape.radius.md`
- `shape.radius.lg`
- `shape.radius.xl`
- `shape.radius.2xl`
- `shape.radius.pill`
- `shape.radius.card`
- `shape.radius.artwork`
- `stroke.thin`
- `stroke.strong`

#### Elevation/effects

- `elevation.0` … `elevation.4`
- `effects.backdropBlur`
- `effects.surfaceOpacity`
- `effects.artworkShadow`
- `effects.artworkSaturation`
- `effects.artworkBrightness`
- `effects.ambientGlowStrength`
- `effects.hoverScale`

#### Motion

- `motion.duration.instant`
- `motion.duration.fast`
- `motion.duration.normal`
- `motion.duration.slow`
- `motion.easing.standard`
- `motion.easing.emphasized`
- `motion.easing.exit`
- `motion.reduceWhenOsRequestsReducedMotion` (default true)

#### Safe layout dimensions

Themes may tune presentation dimensions within validated ranges, but must not rearrange app structure:

- `layout.sidebarWidth`
- `layout.sidebarCompactWidth`
- `layout.playerBarHeight`
- `layout.contentMaxWidth`
- `layout.gridMinCardWidth`
- `layout.gridGap`
- `layout.artworkHeroSize`

### Component override tokens

Allow a limited whitelist of component-specific overrides for advanced themes, for example:

- `component.albumCard.radius`
- `component.albumCard.borderWidth`
- `component.albumCard.hoverLift`
- `component.sidebar.activeIndicatorWidth`
- `component.trackRow.stripedOpacity`
- `component.nowPlaying.surfaceOpacity`
- `component.lyrics.activeScale`
- `component.lyrics.inactiveOpacity`

Do **not** let component tokens alter navigation structure, reorder controls, inject content, or hide critical safety/update UI.

## 10.5 Runtime implementation

Resolve validated theme tokens into CSS custom properties at a single boundary. Components consume only semantic/component CSS variables; they should not contain hard-coded visual values except unavoidable browser/platform constants.

Example:

```css
:root {
  --mv-color-bg-canvas: #0c0d10;
  --mv-color-bg-surface: #13151a;
  --mv-color-text-primary: #f4f5f7;
  --mv-color-accent-primary: #8b7cff;
  --mv-radius-card: 12px;
  --mv-motion-normal: 180ms;
}
```

Never let individual components parse arbitrary theme JSON themselves.

Theme changes must apply live without reload.

## 10.6 Theme Editor — mandatory MVP UX

Settings → Appearance → Themes:

- preview cards for all built-in/custom themes;
- select theme;
- **Duplicate / Save As** built-in theme;
- create custom theme from any base;
- live preview while editing;
- undo/reset current token or section;
- reset whole theme to base;
- import/export JSON;
- delete/rename custom themes;
- Basic and Advanced modes;
- searchable token list in Advanced mode;
- color picker + direct hex/OKLCH entry where practical;
- sliders/inputs for radius, density, typography scale, blur, opacity, artwork effects, motion, etc.;
- show contrast status for important foreground/background pairs;
- keyboard accessible controls.

Basic mode should expose high-value controls rather than 100 fields:

```text
Appearance           Light / Dark
Canvas               [ color ]
Surface              [ color ]
Text                 [ color ]
Accent               [ color ]
Radius               ─────●──
Density              ───●────
Typography scale     ────●───
Transparency         ─────●──
Blur                 ───●────
Artwork radius       ─────●──
Artwork saturation   ────●───
Motion               ───●────
```

Advanced mode edits the complete semantic token set and whitelisted component overrides.

## 10.7 Accessibility and safe theming

- Validate standard text contrast against its surface and display an AA warning when below 4.5:1; large text target is 3:1.
- Critical controls/focus indicators must remain perceivable even under a poor custom theme.
- If `color.accent.onAccent` is omitted, compute a safe light/dark foreground automatically.
- Respect OS reduced-motion preference by default.
- Theme errors should never crash the app; use last-known-good theme or safe built-in fallback.
- Bounds-check numeric tokens to prevent unusable/absurd layouts (e.g. 500px corner radius or zero-height track rows).
- No theme may initiate network access.

## 10.8 Three built-in themes

All three are implemented using the exact same public token schema users can edit/export.

### `builtin:paper` — Paper (light)

A crisp, neutral, metadata-friendly light theme inspired by Carbon's restrained layered surfaces rather than Material's more opinionated component styling.

Direction:

```text
canvas            warm off-white / near #f7f7f5
surface           white
surfaceRaised     subtle neutral layer
text primary      near-black charcoal
text secondary    medium cool gray
accent            refined indigo/blue
radius            6–10px, restrained
blur              minimal/off
shadows           subtle
spacing            comfortable but information-dense
```

Goal: excellent for large libraries, tables, filters, metadata and daytime use without feeling like enterprise software.

### `builtin:nocturne` — Nocturne (dark)

Default dark theme. Inspired by Fluent 2's layered neutral surfaces, semantic aliases and subtle depth, but with its own identity.

Direction:

```text
canvas            #0c0d10-ish charcoal
surface           #13151a-ish
surfaceRaised     #1a1d24-ish
text primary      soft near-white
text secondary    cool gray
accent            violet/indigo (~#8b7cff)
radius            10–14px
blur              subtle, not glass-everywhere
shadow            restrained
artwork            visually dominant
```

Goal: premium desktop music-player feel with excellent long-session comfort.

### `builtin:chromatic` — Chromatic (artwork-adaptive)

Music-specific showcase theme. Dark neutral foundation, but the accent/ambient palette is derived from the currently playing album artwork at runtime. This borrows the useful idea behind Material dynamic color without making the UI look like Material components.

Behavior:

```json
{
  "accent_source": "artwork",
  "fallback_accent": "#8b7cff",
  "ambient_glow": true
}
```

Implementation:

1. use the already-sanitized cached thumbnail, never raw unbounded artwork bytes;
2. extract a deterministic seed/dominant color from a small downscaled image;
3. generate/clamp a tonal palette (prefer OKLCH/Material color utilities or equivalent mature utility rather than ad-hoc RGB math);
4. map generated values only into accent/ambient tokens, not every surface;
5. enforce usable contrast for `onAccent`/selection/focus;
6. animate accent transition softly when track changes, respecting reduced motion;
7. if artwork is missing or extraction fails, use the fixed fallback accent.

Goal: visibly demonstrate why theming is data-driven and make the player feel connected to the album without destroying consistency/readability.

## 10.9 Theme scope boundary

For MVP, themes control **appearance**, not information architecture.

Allowed:

- colors
- typography roles/scale
- spacing/density
- radius/stroke
- shadows/elevation
- blur/transparency
- artwork treatment
- motion
- safe presentation dimensions
- whitelisted component overrides

Not allowed in MVP:

- arbitrary CSS
- custom JavaScript
- remote assets/imports
- moving sidebar to another edge
- reordering player controls
- defining new UI components
- hiding mandatory update/security controls

Layout/representation belongs to the View Engine. Theme belongs to the Theme Engine.

# 11. Home

Home is a composition of reusable view sections, not bespoke duplicated query code.

Initial sections:

- Recently Added
- Recently Played
- Favorites
- Continue Listening if cheap to derive

User can reorder/hide sections later; store order in `workspace.json`.

---

# 12. Playlists

## 11.1 Static playlists

Persist as human-readable JSON under `.musiclib/playlists/`.

Example:

```json
{
  "schema_version": 1,
  "id": "uuid",
  "name": "Night Driving",
  "type": "static",
  "items": [
    {
      "path": "Artist/Album/01 - Song.m4a",
      "hint": {
        "title": "Song",
        "artist": "Artist",
        "album": "Album",
        "duration_ms": 200000
      }
    }
  ]
}
```

Support reorder and drag tracks into playlist.

## 11.2 Smart playlists

A smart playlist is a saved query plus sorting rule, not a copied track list.

Example:

```json
{
  "schema_version": 1,
  "id": "uuid",
  "name": "Forgotten Country",
  "type": "smart",
  "query": {
    "kind": "and",
    "items": [
      { "kind": "predicate", "field": "genre", "op": "contains", "value": "Country" },
      { "kind": "predicate", "field": "last_played_days", "op": "gte", "value": 120 }
    ]
  },
  "sort": [{ "field": "last_played", "direction": "asc" }]
}
```

If play-history predicates are not ready during the first hours, implement smart playlists for metadata predicates first and leave history predicates to the next pass.

---

# 13. Event/history model

Avoid a single mutable cross-device play counter file.

Each installation gets a stable local `device_id`.

Append events to:

```text
.musiclib/events/<device_id>.jsonl
```

Example lines:

```json
{"id":"uuid","ts":"2026-08-29T23:00:00Z","type":"played","track":{"path":"Artist/Album/01.m4a"},"payload":{"seconds":203}}
{"id":"uuid","ts":"2026-08-29T23:10:00Z","type":"favorite_set","track":{"path":"Artist/Album/02.m4a"},"payload":{"value":true}}
```

Benefits:

- append-only;
- each device writes its own file, reducing sync conflicts;
- play count/last played/favorite can be derived into SQLite;
- portable across Windows/Linux.

For MVP, it is acceptable to write `played`, `skipped`, and `favorite_set` only.

Scrobbling semantics are not required today.

---

# 14. Audio engine

## 14.1 Internal abstraction

Create a domain-level API resembling:

```rust
pub trait AudioEngine: Send + Sync {
    fn load_and_play(&self, path: &Path) -> Result<()>;
    fn prime_next(&self, path: Option<&Path>) -> Result<()>;
    fn play(&self) -> Result<()>;
    fn pause(&self) -> Result<()>;
    fn stop(&self) -> Result<()>;
    fn seek(&self, seconds: f64) -> Result<()>;
    fn set_volume(&self, linear: f32) -> Result<()>;
    fn state(&self) -> AudioState;
}
```

Adapt to actual Voxio APIs rather than forcing this exact signature.

## 14.2 Required MVP controls

- play/pause
- next/previous
- seek
- volume
- queue
- shuffle
- repeat off / track / queue
- gapless priming when available
- resume UI state quickly when track changes

Use events from the audio engine where available. Do not poll excessively from React.

## 14.3 Codec support target

At minimum:

- MP3
- FLAC
- AAC/M4A
- ALAC/M4A
- Ogg Vorbis
- WAV
- Opus if enabled and stable

## 14.4 Not today

- EQ/PEQ
- convolution FIR
- crossfeed
- exclusive output
- bit-perfect verification
- manually selectable resampler
- sample-rate graph
- audio-path inspector

Architecture must permit adding a DSP chain later between decoded PCM and device output.

---

# 15. Lyrics / LRCLIB — mandatory MVP

LRCLIB is a first-class MVP provider, not a stretch goal. The app must remain fully usable offline, but once a lyric has been resolved it should be portable/offline whenever possible.

Resolution order:

1. sidecar `.lrc` next to track;
2. embedded lyric if conveniently available;
3. locally persisted lyric previously downloaded by this app;
4. LRCLIB request.

For LRCLIB matching, use the strongest metadata available:

- track title;
- artist;
- album when available;
- duration when available.

Prefer synchronized lyrics over plain lyrics. If synchronized lyrics are returned, default to saving an app-agnostic sidecar next to the track using an atomic write:

```text
01 - Song.m4a
01 - Song.lrc
```

This keeps lyrics portable, Syncthing/rsync/backup friendly as a consequence, and usable by other players. Do not make the SQLite index the only copy of downloaded lyrics.

If only plain lyrics are available, display them and optionally persist them in portable library data or a sidecar without overwriting a better synchronized lyric.

Display synchronized lyrics with:

- line highlighting;
- smooth auto-scroll;
- click a line to seek when timestamps exist;
- manual timing offset control if cheap to add.

Word-by-word/Lyricsfile support is optional for the first build; line-level sync is mandatory.

Never render lyrics as HTML. Treat provider responses as untrusted text.

---


# 15.5. Application updater — mandatory MVP

The MVP must include a real signed update path for Windows and Linux using the Tauri v2 updater plugin.

Requirements:

- use `tauri-plugin-updater`;
- update artifacts must be cryptographically signed;
- the public verification key ships with the app;
- the private signing key must never be committed to the repository;
- signing secrets belong in CI/release secrets;
- support a configurable update endpoint suitable for GitHub Releases/static update metadata;
- expose **Check for updates** in Settings/About;
- perform an automatic update check at app startup at most once per sensible interval (e.g. 12–24h), without blocking startup;
- if an update exists, show version + concise release notes when available;
- user explicitly accepts before download/install in the MVP;
- show download/progress/error state;
- install and relaunch cleanly when supported;
- a failed update check must never prevent the player from opening or playing local music.

Persist only local updater preferences/state outside the portable music library, e.g.:

```text
check_for_updates = true
last_update_check = ...
ignored_version = ...   # optional
```

Updater state is device/application state, **not library data**, so it must not live under `.musiclib/`.

For the first build, prioritize a correct signed update flow over elaborate release UI. If CI packaging cannot be fully exercised locally, still wire the production updater path, document the required signing environment variables, and provide a repeatable release workflow/script.

Security requirements:

- HTTPS update endpoint;
- signature verification is mandatory;
- never execute arbitrary downloaded files outside the updater mechanism;
- never silently downgrade;
- never disable signature verification as a development shortcut in production configuration.

# 16. Filesystem watcher

After initial scan, watch:

- audio files under root;
- `.musiclib/views/`;
- `.musiclib/playlists/`;
- `.musiclib/events/`;
- sidecar lyrics/artwork if practical.

Debounce burst events (e.g. Syncthing writes) ~300–800ms.

On file change:

- incremental re-read metadata;
- update SQLite;
- update FTS;
- notify frontend.

On portable view/playlist change:

- reload and update UI without app restart.

Detect Syncthing-style conflict filenames under `.musiclib` and surface a non-destructive warning rather than silently choosing one.

---

# 17. Artwork

Artwork resolution order:

1. embedded artwork;
2. common sibling names such as `cover.*`, `folder.*`, `front.*`;
3. fallback generated visual.

Do not synchronize generated thumbnails. Store those in local cache.

Generate bounded thumbnails for UI sizes instead of repeatedly decoding full artwork.

---

# 18. Security requirements

Security is part of the MVP architecture because media files and metadata are untrusted input.

## 18.1 Rust policy

- Put `#![forbid(unsafe_code)]` in our own core/domain crates/modules where feasible.
- Prefer pure-Rust parsing/decoding paths.
- Keep third-party unsafe/FFI isolated by dependency boundaries.
- No shell execution based on metadata or playlist content.

## 18.2 Decoder/parser strategy

- Voxio/Symphonia for playback path if integration succeeds.
- Lofty for metadata.
- Treat both metadata and artwork as untrusted.
- Errors must fail the individual file, not crash the whole scanner/app.

## 18.3 Resource limits

Add sane limits before sending data to the webview:

- cap metadata string lengths;
- cap number of genres/artists/items from one tag;
- cap embedded artwork encoded size;
- cap decoded image dimensions/pixel count;
- avoid loading entire giant files into RAM where streaming APIs exist.

Suggested starting limits (adjust if libraries make another limit cleaner):

- UI metadata string: 16 KiB per field maximum after parsing
- embedded artwork: reject/cache-skip > 25 MiB
- decoded artwork: reject > 40 megapixels

Do not fail music playback merely because artwork is rejected.

## 18.4 Filesystem/path safety

- canonicalize library root;
- do not follow symbolic links by default;
- scan only files, not arbitrary devices/sockets;
- any future write/delete/move operation must verify the canonical target remains inside the library root;
- deserialize portable relative paths and reject absolute paths and `..` traversal outside root;
- never interpret a tag as a path to open automatically.

## 18.5 Webview/Tauri

- strict CSP;
- minimal Tauri capabilities;
- no shell plugin unless required later;
- no arbitrary command execution;
- frontend does not receive unrestricted filesystem access;
- all privileged file operations go through typed Rust commands;
- escape/render metadata and lyrics as text, never `dangerouslySetInnerHTML`.

## 18.6 Network

Core player must work fully offline.

Network access belongs to explicit providers/modules. **LRCLIB and the signed updater are the two mandatory MVP network features.** Playback, browsing, search, saved views, playlists, cached artwork, and already-persisted lyrics must continue working without network access. No analytics or telemetry.

## 18.7 Theme safety

Themes are untrusted data. Parse them through a strict versioned schema, validate and bounds-check every supported value, preserve-but-ignore unknown keys, and apply only whitelisted token types. Theme files may not contain arbitrary CSS, JavaScript, HTML, executable expressions, filesystem paths, or remote URLs. Applying a theme must never trigger network access.

Maintain a last-known-good resolved theme. If validation, inheritance, dynamic accent generation, or migration fails, keep/fall back to the last-known-good or a safe built-in theme atomically instead of partially applying a broken theme.

## 18.8 Dependency hygiene

Commit:

- `Cargo.lock`
- `pnpm-lock.yaml`

CI/local checks:

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cargo audit
```

If `cargo-deny` is easy to add, configure advisories/sources/licenses.

Frontend:

```bash
pnpm lint
pnpm typecheck
pnpm audit --prod
```

Use `pnpm install --frozen-lockfile` and `cargo build --locked` in CI.

---

# 19. Tauri command/event boundary

Keep a typed API. Suggested commands:

```text
library_choose_root
library_open
library_scan
library_rescan
library_status

query_execute
search_global

views_list
views_save
views_delete

playlists_list
playlists_create
playlists_update
playlists_delete

player_play_track
player_play_collection
player_pause
player_resume
player_seek
player_next
player_previous
player_set_volume
player_set_shuffle
player_set_repeat
player_get_state

favorite_set
```

Events:

```text
library://scan-progress
library://index-updated
library://portable-data-changed

player://state
player://track-changed
player://queue-changed
player://error
```

Use generated/shared TypeScript types if convenient; otherwise keep backend DTO definitions centralized and mirror carefully.

---

# 20. Suggested Rust module layout

```text
src-tauri/src/
├── main.rs
├── app_state.rs
├── commands/
│   ├── library.rs
│   ├── query.rs
│   ├── views.rs
│   ├── playlists.rs
│   └── player.rs
├── domain/
│   ├── track.rs
│   ├── album.rs
│   ├── artist.rs
│   ├── query.rs
│   ├── view.rs
│   ├── playlist.rs
│   └── events.rs
├── library/
│   ├── scanner.rs
│   ├── metadata.rs
│   ├── artwork.rs
│   ├── watcher.rs
│   └── paths.rs
├── index/
│   ├── db.rs
│   ├── migrations.rs
│   ├── fts.rs
│   └── repository.rs
├── portable/
│   ├── manifest.rs
│   ├── atomic_write.rs
│   ├── workspace.rs
│   ├── views.rs
│   ├── playlists.rs
│   ├── themes.rs
│   └── events.rs
├── audio/
│   ├── mod.rs
│   ├── engine.rs
│   └── voxio_engine.rs
└── security/
    └── validation.rs
```

---

# 21. Suggested frontend layout

```text
src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── shortcuts.ts
├── components/
│   ├── shell/
│   ├── search/
│   ├── command-palette/
│   ├── view-renderer/
│   ├── filters/
│   ├── player/
│   ├── queue/
│   ├── theme/
│   └── primitives/
├── pages/
│   ├── Home.tsx
│   ├── GenericView.tsx
│   ├── AlbumDetail.tsx
│   ├── ArtistDetail.tsx
│   ├── PlaylistDetail.tsx
│   ├── ThemeEditor.tsx
│   └── Settings.tsx
├── stores/
│   ├── player.ts
│   ├── navigation.ts
│   ├── theme.ts
│   └── ui.ts
├── lib/
│   ├── tauri.ts
│   ├── query.ts
│   ├── theme.ts
│   └── types.ts
└── styles/
    ├── tokens.css
    └── global.css
```

`GenericView` + reusable renderers are central. The `theme/` layer and resolved semantic CSS variables are equally central: feature components must consume tokens rather than invent styling constants. Avoid separate bespoke implementations for every library category.

---

# 22. First-run flow

1. Launch.
2. Show minimal onboarding: “Choose your music folder”.
3. Native folder picker.
4. Create/read `.musiclib/manifest.json`.
5. Load/validate selected portable theme (or safe built-in fallback) and apply it before rendering the full shell.
6. Open/create local SQLite index.
7. Begin scan on worker thread.
8. Open the app shell immediately and show progressive results + scan status.
9. Artwork and metadata populate incrementally.
10. Built-in views become usable before scan completes when practical.

If `.musiclib` already exists, load saved workspace/views/playlists/themes immediately.

---

# 23. Performance targets

These are targets, not reasons to overengineer:

- never block the UI during recursive scan;
- smooth interaction with 10k–50k tracks;
- virtualize long track lists;
- command palette/search feels instantaneous for a normal collection;
- incremental rescans use `mtime/file_size` fast path;
- thumbnail decoding occurs off UI thread;
- avoid sending the entire track database to React on every change;
- query pagination/windowing where appropriate.

---

# 24. Required tests

At minimum implement unit/integration coverage for the risky primitives:

1. portable relative path normalization Windows/Linux;
2. rejection of absolute/escaping paths;
3. query parser -> AST;
4. query AST -> parameterized SQL behavior;
5. `ViewDefinition` JSON roundtrip;
6. static playlist JSON roundtrip;
7. smart playlist JSON roundtrip;
8. atomic write does not leave partial target;
9. scanner ignores symlinks by default;
10. library rebuild does not require portable data to contain absolute paths;
11. theme JSON/schema roundtrip preserves unknown future token keys;
12. sparse custom theme correctly inherits newly added tokens from its built-in base;
13. old theme schema migration produces the current schema without losing unknown metadata;
14. invalid numeric/theme values fall back safely instead of crashing;
15. all three shipped themes validate against the checked-in theme JSON Schema.

Manual smoke test:

- import a real directory containing `.m4a`, FLAC and MP3;
- confirm albums group correctly from metadata;
- click first album and verify only that album is shown;
- play/seek/next;
- create custom view, restart app, verify it persists;
- duplicate a built-in theme, edit several token categories, restart and verify the custom theme persists;
- export/import that theme and verify unknown keys survive a roundtrip;
- switch to Chromatic and verify album-art accent fallback/contrast behavior;
- create playlist, restart, verify it persists;
- copy the same library root to a different absolute path and verify portable view/playlist data still resolves using relative paths.

---

# 25. Milestone execution order for TODAY

## M0 — bootstrap (target 20–30 min)

- Tauri + React + TypeScript booting
- app shell skeleton
- Rust command roundtrip
- local dev scripts

## M1 — library + metadata (target 45–60 min)

- choose root
- `.musiclib` manifest
- SQLite/migrations
- recursive scanner
- Lofty metadata
- progressive scan events
- basic artwork extraction/cache

Acceptance: point at current music folder and see correct track metadata.

## M2 — query/view engine (target 45–60 min)

- FTS5
- query AST
- generic result query
- built-in Album/Artist/Track/Folder views
- album aggregation

Acceptance: Albums are correct and clicking one shows only its tracks.

## M3 — refined UX/personalization + theme engine (target 90–150 min)

- sidebar
- grid/list/table renderer
- filter chips/builder
- sorting/grouping
- view editor with live preview
- save/pin custom view
- sidebar reorder/hide
- Ctrl+K fuzzy palette
- navigation history
- semantic Theme Engine + CSS variable resolver
- theme JSON Schema/versioning/inheritance/validation
- built-in Paper / Nocturne / Chromatic themes
- Settings → Appearance theme picker/editor with live preview
- Basic + Advanced token editing
- custom theme Save As / import / export / reset
- contrast warnings and safe fallback
- Chromatic artwork-derived accent with deterministic fallback

Acceptance: create a custom filtered/grouped view and persist it under `.musiclib/views/`; duplicate/edit/export a built-in theme, restart and keep it intact; switch among all three built-ins live without reload.

## M4 — playback (target 45–60 min)

- `AudioEngine` trait
- Voxio adapter
- play/pause/seek/volume
- queue
- next/previous
- shuffle/repeat
- prime next/gapless when available
- persistent bottom player

Acceptance: listen to an album continuously.

## M5 — playlists + events (target 30–45 min)

- static playlist create/edit/reorder
- smart playlist metadata query
- per-device JSONL `played`/`favorite_set`
- Favorites view
- Recently Played

Acceptance: playlist and favorites survive restart and live in `.musiclib`.

## M6 — lyrics / LRCLIB (target 30–45 min)

- local `.lrc` resolution
- LRCLIB lookup using title/artist/album/duration
- prefer synchronized lyrics
- persist downloaded synchronized lyrics as sidecar `.lrc` using atomic writes
- synced line highlighting + auto-scroll
- offline reuse after restart

Acceptance: play a track with no local lyrics, fetch synced lyrics once, restart offline, and still display the synced lyrics.

## M7 — updater + release path (target 30–60 min)

- Tauri v2 updater plugin
- signed update configuration
- Settings/About → Check for updates
- non-blocking periodic startup check
- download/progress/install/relaunch path
- document CI signing secrets and release workflow

Acceptance: updater can consume a valid signed test/update manifest; invalid/unsigned artifacts are rejected; network/update failure does not affect local playback.

## M8 — polish (remaining time)

- filesystem watcher
- empty/error states
- keyboard polish
- loading states
- performance fixes
- theme migration/compatibility smoke checks
- clippy/tests/security checks

## M9 — stretch

- local “Start Radio” recommendation v0
- word-by-word/Lyricsfile lyrics

Do not begin M9 until M0–M8 work end-to-end.

---

# 26. Local recommendation v0 — stretch

If there is time, implement an entirely local initial recommendation scorer using indexed metadata/history.

Given current track `t`, score candidates with a weighted combination such as:

- same artist / related album artist: positive
- genre Jaccard overlap: positive
- year proximity: small positive
- favorite: positive
- high completion/play history: modest positive
- played very recently: negative
- repeatedly skipped: negative
- same exact album: penalty after a few songs to increase variety
- small deterministic/random exploration term

Expose as:

```text
Start Radio
```

which continuously appends good candidates from the user's local library to the queue.

Do not add ML/vector DB/remote APIs today. Later similarity providers such as Last.fm can become optional signals.

---

# 27. Explicit NON-GOALS for today's build

Do not implement today:

- metadata writing/editor
- automatic filesystem organization/rename
- fingerprinting/AcoustID
- MusicBrainz lookup
- Last.fm login/scrobbling
- DSP EQ/FIR/crossfeed
- bit-perfect status
- WASAPI exclusive
- PipeWire graph inspection
- output profiles/AutoEQ
- cloud backend/accounts
- mobile client
- CRDT merge for conflicting playlist edits
- plugin system
- arbitrary theme CSS/JavaScript or remote theme assets
- structural/layout scripting through themes (use View Engine instead)
- streaming services

Keep interfaces extensible, but do not build speculative abstractions beyond what the current features require.

---

# 28. Definition of DONE for the first usable prototype

The prototype is done when all of these are true:

1. User can select an arbitrary folder as the library root.
2. Existing folder hierarchy does not have to follow Artist/Album.
3. `.m4a`, FLAC and MP3 metadata is correctly indexed.
4. Albums and artists are derived from metadata.
5. Clicking an album opens only that album's tracks.
6. Search is fast and supports free text plus field filters.
7. User can create a custom representation using filter + sort + group + layout.
8. Custom views are human-readable files in `.musiclib/views/`.
9. User can reorder/hide/pin sidebar representations.
10. The app ships the three mandatory built-ins: **Paper**, **Nocturne**, and **Chromatic**.
11. User can duplicate/create/edit/rename/delete/import/export a custom theme with live preview.
12. Custom themes are sparse, human-readable files in `.musiclib/themes/`, inherit from a stable built-in base, and contain no executable CSS/JS.
13. Theme schema validation/migration/fallback works; missing tokens inherit safely and unknown future keys survive roundtrip.
14. Important contrast pairs are checked and invalid theme data cannot crash or make critical controls unusable.
15. Static playlists persist in `.musiclib/playlists/` and contain no absolute paths.
16. Smart playlist works from a saved metadata query.
17. Playback supports play/pause/seek/volume/queue/next/previous.
18. Playing an album produces a queue; the album is not treated as a playlist.
19. Favorites/recent history can be derived from portable per-device event logs.
20. Deleting the local SQLite index and restarting rebuilds the library without losing authored views/playlists/themes/favorites.
21. Copying/syncing the library to a different absolute filesystem root still resolves portable data.
22. The core app works offline; LRCLIB/update failures never block local playback or library use.
23. LRCLIB synchronized lyrics can be fetched, shown with line sync, persisted portably, and reused after restart while offline.
24. The app has a signed updater path with manual **Check for updates** plus a non-blocking periodic check; invalid/unsigned updates are rejected.
25. No telemetry.
26. No destructive file operations in MVP.
27. Core tests and security checks pass.

---

# 29. Product rule to protect during implementation

Whenever a feature is being designed, ask:

> Is this information intrinsic to the music/library, a user-authored portable interpretation, or merely local runtime/cache state?

Store it accordingly.

And whenever a new library screen is requested, ask:

> Can this be represented as another query/view over the same dataset instead of a bespoke subsystem?

Prefer the generic data model.

The core product advantage is not "another player with more checkboxes". It is a music library whose data remains the user's, whose database is disposable, and whose representation is configurable rather than dictated by the application.

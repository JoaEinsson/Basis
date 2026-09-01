# Executable architecture

This document resolves decisions that the specification leaves optional. They
may be changed only for a technical reason observed during implementation and
recorded in `PROGRESS.md`.

The locked identity is **Basis**, package `basis`, bundle identifier
`io.github.joaeinsson.basis`, version `0.1.0`, and repository
`JoaEinsson/Basis`. `DECISIONS.md` is authoritative for all numbered decisions.
`DESIGN_UX.md` is authoritative for interface composition and interaction.

## Selected stack

- Tauri 2, Rust, React, TypeScript, and Vite.
- `pnpm` with committed lockfiles (`pnpm-lock.yaml` and `Cargo.lock`).
- React Router for routes/history, Zustand for transient UI/player state,
  TanStack Virtual for long tables, and Lucide for icons.
- Vitest + Testing Library for logic/components; Rust tests for domain logic,
  persistence, filesystem integrations, and SQLite.
- Custom token-based CSS and CSS custom properties. Do not add Tailwind or a
  large visual framework: the Theme Engine is already the design system.
- `rusqlite` with bundled SQLite/FTS5; `lofty`; `ignore`; `notify`; `uuid`;
  `serde`; Rust `reqwest` for LRCLIB and future optional metadata providers;
  pinned `tauri-specta` for generated command/event DTO bindings.
- Voxio behind `AudioEngine`, subject to the fallback policy in `AGENTS.md`.

Use current versions compatible with Tauri 2 and pin them in the lockfiles. Do
not guess APIs: confirm them against the resolved version and crate examples.

## System boundaries

```text
React/UI
  | typed commands + small events
  v
Tauri commands
  |-- LibraryService ---- scanner / metadata / artwork / watcher
  |-- QueryService ------ SQLite / FTS / projections
  |-- PortableService --- manifest / workspace / views / playlists / themes / events
  |-- PlayerService ----- queue + AudioEngine adapter
  |-- LyricsService ----- sidecar / embedded / LRCLIB
  `-- UpdaterService ---- local policy + signed updater plugin
```

The frontend never receives generic filesystem access. Every privileged
operation goes through a Rust command with a known DTO. Events carry deltas and
progress, not repeated dumps of the entire library.

## Data classification

| Data | Local | Portable under `.musiclib/` | Rule |
|---|---|---|---|
| Audio and `.lrc` sidecars | music folder | already part of the library | never reorganize |
| Manifest/workspace | no | `.musiclib/` root | atomic writes |
| Views/playlists/themes | no | one readable JSON file per item | stable ID, versioned schema |
| Events | `device_id` originates locally | `events/<device_id>.jsonl` | append-only per device |
| SQLite/FTS | app-data | no | disposable by `library_id + root_instance_hash` |
| Thumbnails | app-cache | no | derived and bounded |
| Device/volume/window/updater | app-data | no | never synchronize |
| Queue/session | optional app-data | no | separate from playlists |

Suggested local layout:

```text
<app-data>/basis/
  settings.json
  libraries/<library_id>/<root_instance_hash>/index.sqlite3
  sessions/<library_id>/<root_instance_hash>.json
<app-cache>/basis/
  artwork/<cache-key>-<size>.webp
```

## Paths and identity

At the input boundary:

1. canonicalize the library root;
2. reject empty or absolute references, drive/prefix components, UNC paths,
   NUL, non-UTF-8 paths, and `..` escapes;
3. normalize portable paths to Unicode NFC and `/`, preserving filename case;
4. resolve at runtime and confirm the canonicalized target remains below the
   root before every write;
5. do not follow symlinks during the default scan.

Use exactly `track_id = UUIDv5(library_id, normalized_relative_path)`. The local
ID supports indexes; the relative path remains the canonical portable reference.
An external rename follows D30 and never chooses between ambiguous matches.

Scan only the case-insensitive extension allowlist in D10. Do not honor Git
ignore files, follow symlinks, enter `.musiclib/`, or treat generic `.mp4` as
audio.

## Startup and concurrency

1. load local settings and the most recent root, when present;
2. open/create the manifest and workspace;
3. validate/resolve the theme before rendering the complete shell;
4. compute `root_instance_hash = blake3(canonical_root)`, open that local
   library instance database, and run transactional migrations;
5. display the shell and existing results immediately;
6. start scanning in a blocking worker and publish rate-limited progress;
7. apply index updates in batches/transactions;
8. start the watcher only after the base scan, with exactly 500 ms debounce.

Cancellation or a new scan must invalidate the previous worker through a token
or generation number. A metadata/artwork failure is attached to the individual
file and increments the error summary; it does not abort the batch.

## SQLite and projections

- Use versioned, transactional migrations and enable foreign keys.
- `tracks` is the indexed source; FTS5 covers title, artists, album, genre,
  composer, and path.
- Maintain FTS through triggers or through one repository routine used by
  insert, update, and delete. Never create two divergent write paths.
- Incremental indexing compares `file_size + mtime_ns`. A changed file removes
  and reinserts its FTS/metadata within the same transaction boundary.
- Results are paginated and DTOs never carry raw artwork.
- Preserve original metadata display values and use normalized relation tables
  for structured artists and genres; never split an artist display string into
  relations by punctuation heuristics. D89 permits only a deterministic,
  identity-only featured-suffix fallback for corroborated album grouping; it
  never changes the stored track credit or its artist relations.
- Albums/artists may be derived tables or aggregate queries. Album identity and
  missing-metadata behavior follow D15–D18 and D89 exactly. Album projection
  presents the canonical primary release credit rather than an arbitrary
  featured-track string.
- FTS5 uses `unicode61 remove_diacritics 2` and BM25 ranking.

## Query and View Engine

One serializable AST is used by search, filter chips, the builder, views, and
smart playlists. The SQL compiler contains:

- a field -> column/expression allowlist;
- an operator allowlist by type;
- bind parameters for every value;
- limits on depth, node count, text length, and pagination;
- allowlisted sorting, never persisted SQL text.

Grammar, public fields, operators, page limits, deterministic tie-breaking,
group depth, and Nucleo candidate limits follow D19–D24. Unknown fields are
parse errors, not free-text fallback. Rust generates frontend DTOs through
`tauri-specta`; generated bindings are not hand-edited.

Built-ins are immutable `ViewDefinition` values supplied by the app and rendered
by the same `GenericView`. Saving a change to a built-in means duplicating it to
`.musiclib/views/`, never mutating the embedded definition.

Global search is a Query Service projection, not a frontend-only FTS list. It
returns entity-grouped results with deterministic ranking tiers and relationship
expansion under D75. For example, an artist match projects related album and
track entities even when their titles do not contain the query. The command
palette is a separate bounded Nucleo interaction and never substitutes for the
main-canvas SearchView.

Minimum routes:

```text
/onboarding
/home
/views/:viewId
/search
/albums/:albumKey
/artists/:artistKey
/playlists/:playlistId
/now-playing
/settings/appearance
/settings/about
```

`/onboarding` is an implementation route name only. Its visible surface is the
quiet Library empty state in `DESIGN_UX.md`, not a welcome or marketing page.

Album detail receives an album key/query and lists only that album's tracks,
ordered by disc and track number. Do not reuse the global list with scrolling.

## Frontend shell and navigation

The shell owns a compact top toolbar, optional View toolbar, main canvas,
optional temporary context pane, and persistent bottom transport. There is no
permanent left navigation sidebar. The schema v1 `workspace.sidebar` field is a
compatibility name for the ordered pinned Views displayed in the top toolbar.

Page identity is a discriminated navigation state, reflected in routes and
history entries. An entry stores or can restore its View/search/detail identity,
filters, sort, grouping, representation, pagination/window state, scroll, and
selection where practical. Do not derive mutually exclusive pages from an
accumulation of booleans.

React Router owns route/history transitions. A small navigation store owns only
restorable UI state that is unsuitable for the URL. Scroll restoration waits
until the virtualized content window is ready. The persistent transport and
`PlayerService` are mounted outside the routed canvas and are never reconstructed
by Back/Forward.

Primary play actions may push `/now-playing`. Automatic track advance only
updates PlayerService/transport state and never pushes or replaces a route.
Clicking current-track artwork/title in the transport pushes `/now-playing` as
an explicit user navigation.

Toolbar Search pushes `/search` with a serializable query and uses `Ctrl+F` or
`/`; `Ctrl+K` opens the separate command palette. Search results occupy the main
canvas. Autocomplete is an optional bounded overlay and not a result surface.

Responsive composition and context-pane behavior follow D77 and
`DESIGN_UX.md`. Theme tokens may style these regions but cannot rearrange them.

## Layout and Theme Engine boundary

The frontend has two one-way responsibilities:

```text
navigation state + View data
        -> layout components choose regions and semantic roles
        -> CSS variables from the resolved Theme Engine determine appearance
```

Layout components own region existence, placement, content order, pane behavior,
responsive recomposition, entity structure, and state transitions. They contain
no concrete color, font, radius, border, shadow, blur, glow, density, artwork,
selection, lyric, progress, or motion values. They also contain no conditionals
for Paper, Nocturne, or Chromatic.

The Theme Engine owns those visual values through the canonical registry and
the single `--mv-*` conversion boundary. Components select semantic roles such
as surface, selected state, active lyric, or progress; they do not parse JSON or
choose the role's appearance. A custom theme may substantially alter the visual
treatment without changing navigation or information architecture.

Container existence is a layout decision only when the container has a
structural/content purpose. Radius and elevation never justify creating it;
their appearance is theme-controlled. See D80.

## PortableService

- Every document has `schema_version` and deterministic validation.
- Write sequence: serialize in memory -> validate -> temporary file in the same
  directory -> flush/sync when available -> atomic rename/replace.
- Migration sequence: read -> preserve unknown fields -> migrate in memory ->
  validate -> atomic backup -> replace.
- Authored item filenames are exactly `<uuid>.json`; mutable names remain inside
  the document.
- Basis implements no Syncthing-specific conflict detection, warning, merge, or
  policy. It validates the filesystem state it receives like any other input.

## Theme Engine

The canonical token registry must be a shareable data artifact containing a
stable ID, type, hard-default value, range/unit, and category. Resolution is:

```text
hard defaults -> built-in base -> sparse overrides -> artwork accent
-> critical accessibility corrections -> CSS variables
```

Rust validates the envelope, schema, inheritance, types/ranges, and safety before
returning a theme. The frontend performs a single conversion from the resolved
theme to `--mv-*` variables; components never interpret theme JSON. Future fields
and tokens remain preserved in the source document but are not applied when
unknown.

The three built-in definitions use the same exportable schema:
`builtin:paper`, `builtin:nocturne`, and `builtin:chromatic`. Chromatic extracts
color from an already sanitized, small thumbnail; it changes only accent/ambient
values, with deterministic fallback and corrected contrast.

Custom inheritance, accepted color syntax, runtime-only contrast correction,
light/dark system selections, import collisions, token bounds, and Chromatic
extraction follow D46–D53.

Legacy sidebar-named tokens remain parseable to preserve the versioned theme
contract, but shell components must not use them to render permanent navigation.

## Player and queue

`PlayerService` owns the queue, current index, shuffle/repeat state, and adapter.
React stores only a snapshot received through events. No Voxio type crosses the
`AudioEngine` trait.

When playing a collection:

- `replace`: replace the queue and start at the selected item;
- `next`: insert after the current item;
- `append`: add to the end.

A playlist/view/album never becomes queue state through a mutable reference. The
service materializes the ordered selection into queue items.

Queue ordering, previous/repeat behavior, paused session restore, volume mapping,
default-device recovery, and the Rodio fallback are fixed by D38–D45.

## Lyrics and network

Resolution order: `.lrc` sidecar -> convenient embedded lyrics -> prior portable
cache -> LRCLIB. The request uses metadata and duration; the response is bounded,
untrusted text and is never rendered as HTML. Synchronized lyrics are written
atomically beside the audio when writable; otherwise they mirror the relative
path under `.musiclib/lyrics/`. Matching and persistence follow D55–D59.

Network calls originate in Rust, with the official updater plugin as the only
separate stack. Apply the D60 timeouts and response limit. LRCLIB and updater
calls have cancellation and non-fatal errors. No
network is required for scanning, search, playback, views, playlists, themes, or
already saved lyrics.

Metadata normalization is always local and offline. MusicBrainz Web Service 2
is selected only as a future, opt-in enrichment provider; it never participates
in required scanning or silently changes identity/tags. See D11–D18 and the
metadata provider section in `DECISIONS.md`.

## Updater

Use the official Tauri v2 plugin and only its signature-verified mechanism. The
stable endpoint is
`https://github.com/JoaEinsson/Basis/releases/latest/download/latest.json`.
Preferences and `last_update_check` are local. The startup check runs in the
background at most once every 24 hours; installation always requires explicit
consent in the MVP. GitHub Actions publishes Windows x86_64 NSIS and Linux
x86_64 AppImage artifacts. Tauri signing is mandatory; Authenticode is not
available initially and must not be implied. See `RELEASE_AND_SIGNING.md`.

## Trust limits

- UI strings: maximum 16 KiB per field after parsing;
- embedded artwork: skip above 25 MiB;
- decoded image: reject above 40 megapixels;
- limit artist/genre arrays and network response sizes;
- strict CSP, minimum Tauri capabilities, no shell plugin;
- no `dangerouslySetInnerHTML`;
- use `#![forbid(unsafe_code)]` in first-party modules where feasible.

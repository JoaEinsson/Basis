# Executable architecture

This document resolves decisions that the specification leaves optional. They
may be changed only for a technical reason observed during implementation and
recorded in `PROGRESS.md`.

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
  `serde`; use `reqwest` only if there is no existing suitable client.
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
| SQLite/FTS | app-data | no | disposable by `library_id` |
| Thumbnails | app-cache | no | derived and bounded |
| Device/volume/window/updater | app-data | no | never synchronize |
| Queue/session | optional app-data | no | separate from playlists |

Suggested local layout:

```text
<app-data>/music-vault/
  settings.json
  libraries/<library_id>/index.sqlite3
  sessions/<library_id>.json
<app-cache>/music-vault/
  artwork/<cache-key>-<size>.webp
```

## Paths and identity

At the input boundary:

1. canonicalize the library root;
2. reject empty or absolute references, drive/prefix components, UNC paths, and
   `..` escapes;
3. normalize the serialized separator to `/`;
4. resolve at runtime and confirm the canonicalized target remains below the
   root before every write;
5. do not follow symlinks during the default scan.

Use `track_id = UUIDv5(library_id, normalized_relative_path)` or an equivalent
deterministic hash. The local ID supports indexes; the relative path remains the
canonical portable reference. An external rename uses conservative hints and
never chooses between ambiguous matches.

## Startup and concurrency

1. load local settings and the most recent root, when present;
2. open/create the manifest and workspace;
3. validate/resolve the theme before rendering the complete shell;
4. open the database by `library_id` and run transactional migrations;
5. display the shell and existing results immediately;
6. start scanning in a blocking worker and publish rate-limited progress;
7. apply index updates in batches/transactions;
8. start the watcher only after the base scan, with 300–800 ms debounce.

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
- Albums/artists may be derived tables or aggregate queries. An album key must
  include at least normalized album artist + album, with explicit fallback for
  missing tags and conservative collision handling.

## Query and View Engine

One serializable AST is used by search, filter chips, the builder, views, and
smart playlists. The SQL compiler contains:

- a field -> column/expression allowlist;
- an operator allowlist by type;
- bind parameters for every value;
- limits on depth, node count, text length, and pagination;
- allowlisted sorting, never persisted SQL text.

Built-ins are immutable `ViewDefinition` values supplied by the app and rendered
by the same `GenericView`. Saving a change to a built-in means duplicating it to
`.musiclib/views/`, never mutating the embedded definition.

Minimum routes:

```text
/onboarding
/home
/views/:viewId
/albums/:albumKey
/artists/:artistKey
/playlists/:playlistId
/lyrics
/settings/appearance
/settings/about
```

Album detail receives an album key/query and lists only that album's tracks,
ordered by disc and track number. Do not reuse the global list with scrolling.

## PortableService

- Every document has `schema_version` and deterministic validation.
- Write sequence: serialize in memory -> validate -> temporary file in the same
  directory -> flush/sync when available -> atomic rename/replace.
- Migration sequence: read -> preserve unknown fields -> migrate in memory ->
  validate -> atomic backup -> replace.
- File names derive from a UUID/sanitized slug, never from an unvalidated path.
- Detect Syncthing conflict files and warn only; never merge or delete silently.

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

## Lyrics and network

Resolution order: `.lrc` sidecar -> convenient embedded lyrics -> prior portable
cache -> LRCLIB. The request uses metadata and duration; the response is bounded,
untrusted text and is never rendered as HTML. Synchronized lyrics may be written
atomically next to the audio only after verifying that the destination remains
inside the library root.

LRCLIB and updater calls have timeouts, cancellation, and non-fatal errors. No
network is required for scanning, search, playback, views, playlists, themes, or
already saved lyrics.

## Updater

Use the official Tauri v2 plugin and only its signature-verified mechanism.
Preferences and `last_update_check` are local. The startup check runs in the
background at most once every 24 hours; installation always requires explicit
consent in the MVP. See `RELEASE_AND_SIGNING.md`.

## Trust limits

- UI strings: maximum 16 KiB per field after parsing;
- embedded artwork: skip above 25 MiB;
- decoded image: reject above 40 megapixels;
- limit artist/genre arrays and network response sizes;
- strict CSP, minimum Tauri capabilities, no shell plugin;
- no `dangerouslySetInnerHTML`;
- use `#![forbid(unsafe_code)]` in first-party modules where feasible.


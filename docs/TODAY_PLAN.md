# Executable MVP plan — today's cut

Original target date: **August 29, 2026**. The plan remains active until M0–M8
are green; a date change does not authorize reducing the definition of done.

## Expected outcome

At completion, a person can choose a real folder, watch it index, browse and
search by metadata, open an isolated album, customize/save views and themes,
listen to a queue, persist playlists/favorites, retrieve synchronized lyrics for
offline use, and use a signed update flow. Copying the library to a different
absolute root does not break its portable data.

## How to use the gates

Each milestone has four states: not started, in progress, implemented without
evidence, and green. Mark it green in `PROGRESS.md` only when:

1. deliverables exist without mocks in the primary flow;
2. related automated checks pass;
3. the milestone smoke test was run or an external blocker is recorded;
4. essential error/empty/loading states are covered;
5. relevant contract changes are documented.

Run focused checks frequently during implementation and the complete suite at
the M3, M7, and M8 checkpoints.

Indicative budget, not permission to cut requirements: M0 20–30 min, M1
45–60 min, M2 45–60 min, M3a+M3b 90–150 min, M4 45–60 min, M5 30–45 min, M6
30–45 min, M7 30–60 min, and M8 in the remaining time. If a timebox overruns,
reduce polish and internal complexity; do not reclassify the Theme Editor,
LRCLIB, or the updater as stretch work.

## M0 — bootstrap and minimum contract

Goal: the desktop process starts and React communicates with Rust.

Deliverables:

- Tauri 2 + React + TypeScript + Vite scaffold while preserving the spec/docs;
- locked Basis identity: package `basis`, bundle ID
  `io.github.joaeinsson.basis`, English UI, and single-instance behavior;
- `dev`, `tauri`, `build`, `lint`, `typecheck`, `test`, and `format:check` scripts;
- initial shell with error boundary, loading state, and onboarding route;
- global Tauri state and a typed health/version command;
- strict CSP/minimum capabilities from the beginning;
- `.gitignore`, lockfiles, and the base structure from spec sections 20/21.

Gate:

- app opens with `pnpm tauri dev`;
- a Rust invoke returns typed data visible in React;
- frontend typecheck/build and `cargo check` pass;
- there are no generic filesystem or shell permissions.

## M1 — library, portability, and indexing

Goal: choose a real library and see metadata progressively.

Order:

1. implement path normalization/validation with tests;
2. add the folder picker, writable-root probe, and create/read
   `.musiclib/manifest.json`;
3. add the default workspace and portable directories;
4. add app-data by `library_id + root_instance_hash`, SQLite, and migrations;
5. add the exact D10 scanner allowlist without Git-ignore behavior or symlinks;
6. parse with Lofty using string/artwork limits and per-file error isolation;
7. implement incremental upsert and progress events;
8. implement bounded artwork resolution/cache.

Gate:

- selecting an arbitrary folder creates only `.musiclib/` inside it;
- real MP3, FLAC, and M4A tracks appear before scanning finishes;
- the UI remains responsive and shows counts/progress/errors;
- adding/indexing music while offline produces the same normalized metadata keys
  and album grouping as when online; no metadata provider is required;
- a rescan with no changes uses `mtime + size` and does not reparse everything;
- no portable JSON contains an absolute root;
- original and copied roots with the same `library_id` use separate local DBs;
- deleting the local DB and reopening rebuilds the index.

## M2 — AST, FTS, and View Engine

Goal: one query powers every representation.

Order:

1. add Rust/TS types for `Expr`, sort, pagination, and `ViewDefinition`;
2. parse text/quotes/predicates into the AST;
3. compile parameterized SQL using allowlists and abuse tests;
4. synchronize FTS5 and implement entity-aware global search;
5. query track/album/artist/folder/genre entities and relationally expand
   search results under D75;
6. express built-ins through the same engine;
7. expose paginated typed DTOs for GenericView consumers without building a
   provisional shell;
8. implement isolated album/artist detail queries and DTOs.

Gate:

- free text and the structured filters in the spec work together;
- Search results are grouped by entity and an exact artist result exposes its
  related albums/tracks even when their titles do not contain the query;
- Albums derives grouping from metadata;
- an album-detail query returns only that album's tracks in disc/track order;
- result commands paginate deterministically and expose enough information for
  M3a virtualization without sending the full library to React;
- malicious values cannot alter SQL structure;
- grammar, operators, public fields, page limits, FTS tokenizer, and grouping
  match D19–D24 exactly.

## M3a — shell, personalization, search presentation, and navigation

Goal: turn results into persistent representations.

Deliverables:

- compact top toolbar with ordered pinned Views, adaptive overflow, and no
  permanent left sidebar;
- `GenericView` Grid/List/Table renderers with virtualization;
- actual album and artist detail routes/pages using the M2 DTOs;
- explicit main-canvas navigation states with Back/Forward restoration of View,
  search, detail, filters, representation, scroll, and selection state;
- main-canvas SearchView with grouped entity representations and a toolbar
  search control that expands only while active;
- filter chips and builder using the same AST;
- sort, group, grid/list/table, density, cover size, and visible fields;
- save/duplicate/rename/delete views under `.musiclib/views/`;
- accessible fuzzy `Ctrl+K` command palette for entities/views/actions,
  separate from `Ctrl+F`/`/` global SearchView;
- context menu and multiselect with available queue/playlist actions;
- quiet Library empty/indexing/error states without marketing/dashboard
  composition;
- keyboard-accessible pin/unpin/reorder/hide behavior;
- layout components that express only structure and semantic token roles, with
  no built-in-theme values or branches.

Gate:

- Albums/Artists/Search render in the definitive shell without a temporary or
  competing layout, and clicking an album shows only that album;
- create a filtered/grouped view, pin it, restart, and recover it;
- duplicating a built-in does not modify its original definition;
- pinned navigation order/items survive through the schema v1
  `workspace.sidebar` compatibility field without rendering a sidebar;
- clearing Search and Back/Forward restore the exact prior View/search state;
- keyboard navigation works in the palette, lists, and controls with visible
  focus;
- switching themes can change surface, radius, elevation, typography, density,
  and motion treatment without changing shell/navigation code;
- the shell passes the anti-dashboard audit in `DESIGN_UX.md`.

## M3b — Theme Engine and editor

Goal: make the entire appearance driven by safe, portable data.

Order:

1. create the token registry, hard defaults, JSON Schema, and limits;
2. resolve sparse inheritance and preserve unknown values;
3. implement Paper, Nocturne, and Chromatic in the same format;
4. establish one CSS-variable boundary and remove ad hoc visual values;
5. add the picker with live switching;
6. add Duplicate/Save As, rename/delete, and token/section/full reset;
7. add searchable Basic and Advanced editors;
8. add import/export plus atomic migration/backup;
9. add contrast checks and last-known-good fallback;
10. add sanitized artwork accent extraction for Chromatic.

Gate:

- all three built-ins validate against the schema and switch without reload;
- a custom theme contains overrides only, persists, and survives restart;
- import/export preserves an unknown future key;
- a missing base, invalid token, or low contrast cannot break critical controls;
- no component interprets a theme or injects arbitrary CSS;
- no layout component hardcodes Paper/Nocturne/Chromatic values, and a test
  theme can vary radius/elevation/glow/density substantially while preserving
  identical navigation and information architecture;
- system light/dark selections, custom-base flattening, color syntax, collision
  behavior, and bounds match D46–D53.

## M4 — audio and queue

Goal: listen to an album continuously using real transport.

Order:

1. add `AudioEngine` and its state DTO without adapter types;
2. implement the timeboxed Voxio adapter and fallback if necessary;
3. implement `PlayerService`/queue and events;
4. add play/pause/seek/volume/next/previous;
5. add shuffle and repeat off/track/queue;
6. prime the next track/gapless when the adapter supports it;
7. add the persistent bottom player and queue panel;
8. add Now Playing as a main-canvas state with dominant artwork, a clear Back
   action, and transport-to-Now-Playing navigation;
9. ensure deliberate primary play may open Now Playing while automatic track
   changes never steal focus from a canvas the user selected;
10. make device/codec errors recoverable;
11. target MP3, FLAC, AAC/M4A, ALAC/M4A, Ogg Vorbis, WAV, and Opus when the
   selected adapter supports it reliably.

Gate:

- playing an album materializes a queue separate from its source;
- controls and automatic track changes work with real audio;
- Back restores the exact album/search source after Now Playing, and automatic
  queue advance leaves the current browsing canvas unchanged;
- MP3, FLAC, AAC/M4A, ALAC/M4A, Ogg Vorbis, and WAV are covered by a fixture or
  smoke test; include Opus when enabled/stable in the selected adapter;
- closing/reopening restores reasonable local state quickly without making the
  queue portable data.
- queue, shuffle, previous, repeat, restore, volume, device, and fallback behavior
  match D38–D45 exactly.

## M5 — playlists and events

Goal: authored data and history survive restart and library copying.

Deliverables:

- CRUD/reorder/drag for static playlists with recovery hints;
- smart playlists using the metadata AST and sorting;
- local `device_id` and append-only JSONL;
- `played`, `skipped`, and `favorite_set` events;
- local projections for favorites, last played, and counters;
- Home with Recently Added, Recently Played, and Favorites using reusable views.

Gate:

- static and smart playlists reopen correctly;
- JSON contains no absolute path;
- favorite changes through an event and is derived again after a DB rebuild;
- each installation writes only its own event file.

## M6 — lyrics and LRCLIB

Goal: resolve synchronized lyrics once and then use them offline.

Deliverables:

- tolerant, bounded LRC parser;
- sidecar/embedded/persisted/LRCLIB resolution order;
- lookup using title, artist, album, and duration;
- preference for synchronized lyrics;
- atomic `<stem>.lrc` persistence without overwriting a better version;
- highlighting, auto-scroll, click-to-seek, and safe plain-text rendering;
- integrate synchronized/plain/loading/unavailable lyric states into the
  responsive Now Playing canvas defined by `DESIGN_UX.md`;
- non-fatal loading/offline/not-found/rate-limit/error states.

Gate:

- a track without a sidecar fetches, synchronizes, and writes `.lrc`;
- after restarting without network, the same synchronized lyrics still work;
- a malformed response/line cannot inject HTML or crash playback.

## M7 — signed updater and release

Goal: provide a real production path without making network access a player
requirement.

Follow `RELEASE_AND_SIGNING.md`.

Deliverables:

- updater/process plugins configured for Windows x86_64 NSIS and Linux x86_64
  AppImage;
- public key and configurable production HTTPS endpoint;
- private secret available only through environment/CI;
- Check for updates in About;
- asynchronous startup check with a local 24-hour interval;
- consent, progress, error, install, and relaunch states;
- repeatable workflow/script that creates signed artifacts and metadata.
- GitHub Actions publishes to `JoaEinsson/Basis` and updates through
  `https://github.com/JoaEinsson/Basis/releases/latest/download/latest.json`;
- release notes accurately disclose that Authenticode is not initially
  available and that Tauri updater signing is a different mechanism.

Gate:

- a valid signed manifest/artifact is accepted in a controlled test;
- an invalid/missing signature is rejected;
- endpoint failure does not delay startup or playback;
- the private secret does not appear in Git, the bundle, logs, or `.musiclib/`.

## M8 — integration, watcher, security, and polish

Goal: demonstrate one complete product, not a collection of features.

Deliverables:

- incremental watcher with debounce and portable-data reload;
- empty/loading/error states and small/large window behavior;
- responsive shell recomposition at the DESIGN_UX width bands, including
  navigation overflow, context-pane behavior, and stacked Now Playing;
- reviewed shortcuts, focus, reduced motion, and contrast;
- payload limits, CSP, and capability audit;
- complete suite, audits, and release build;
- end-to-end smoke test and copy to a different absolute root.

Final gate:

- every item in `ACCEPTANCE.md` has evidence;
- quality commands pass;
- a release build exists for the current host and the other OS is configured in
  the workflow;
- repository search finds no secret, developer-specific absolute fixture path,
  or `TODO`/mock/unimplemented core MVP flow;
- repository search finds no Syncthing-specific conflict detection, warning,
  merge, or policy code;
- every `DESIGN_UX.md` acceptance scenario passes and repository/UI inspection
  finds no permanent navigation sidebar, hero/marketing composition, generic
  card wrapping, readiness banner, or permanent dashboard search field;
- `PROGRESS.md` contains the final result and any genuine limitations.

## M9 — only after the final gate

Local “Start Radio” recommendations and word-by-word lyrics. Do not begin either
as a substitute for a mandatory criterion.

# Execution board

Update this file during development. Every `[x]` must have evidence under “Latest
verification.” Do not erase blocker history: mark blockers resolved and record
the resolution.

## Milestones

- [x] M0 — bootstrap and command roundtrip
- [x] M1 — library, metadata, artwork, and rebuildable index
- [x] M2 — query/FTS/View Engine and album/artist detail
- [x] M3a — UX, navigation, views, and command palette
- [x] M3b — Theme Engine, built-ins, and portable editor
- [x] M4 — playback and queue
- [ ] M5 — playlists, events, and Home
- [ ] M6 — LRC/LRCLIB and offline reuse
- [ ] M7 — signed updater and release path
- [ ] M8 — watcher, security, integration, and final build

## Current gate

`M5 — implementation complete; manual gate pending`

Next concrete action: run the M5 manual smoke described in the handoff: create
and reorder static/smart playlists, favorite and play a track, restart, inspect
portable files, then delete only the local SQLite index and confirm replay.
Do not start M6 until this smoke is confirmed or a defect is fixed.

## Verification

- [x] frontend format
- [x] frontend lint
- [x] frontend typecheck
- [x] frontend tests
- [x] frontend production build
- [x] rustfmt
- [x] clippy `-D warnings`
- [x] cargo tests
- [ ] cargo audit
- [ ] pnpm production audit
- [ ] Tauri release build
- [ ] end-to-end smoke test
- [ ] copy-to-another-root + DB-rebuild smoke test
- [ ] valid updater and invalid-signature tests

## Latest verification

2026-08-29 23:45 BRT — M0 frontend checks
Result: PASS
Evidence: `pnpm typecheck`, `pnpm test` (1 passing test), `pnpm lint`,
`pnpm format:check`, and `pnpm build` all pass.

2026-08-29 23:45 BRT — M0 Rust and desktop smoke
Result: PASS
Evidence: `cargo check`, `cargo fmt --check`, `cargo test --all-features`
(1 passing app-health test), and `cargo clippy -- -D warnings` pass. `pnpm tauri
dev` compiled and launched `target\\debug\\basis.exe` with the Vite shell.

2026-08-29 23:45 BRT — production JavaScript dependency audit
Result: PASS
Evidence: `pnpm audit --prod` reported no known vulnerabilities.

2026-08-30 00:23 BRT — M1 frontend and desktop startup
Result: PASS
Evidence: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, and
`pnpm build` pass. `pnpm tauri dev` compiled and launched the Basis desktop
process with the native folder-picker integration and progressive scan status.

2026-08-30 00:25 BRT — M1 library/index contract
Result: PASS
Evidence: `cargo fmt`, `cargo test --all-features`, and strict
`cargo clippy --all-targets --all-features -- -D warnings` pass. The 10 Rust
tests cover portable path rejection/normalization, atomic manifest/workspace
writes, corrupt-file and symlink isolation, unchanged-file skipping, generated
MP3/FLAC/M4A/WAV scanning without a network provider, separate copied-root
databases, and rebuilding after deletion of only the local SQLite file.

2026-08-30 04:03 BRT — interface/interaction documentation contract
Result: PASS
Evidence: `docs/DESIGN_UX.md` defines the normative shell, pinned-View
navigation, SearchView, history restoration, Now Playing, responsive behavior,
required states, UX01–UX09, and anti-drift checklist. D70–D80 lock the resolved
ambiguities; the specification, plan, architecture, acceptance matrix, agent
contract, and README reference it. `git diff --check` passes and repository
search finds no remaining affirmative requirement for a permanent sidebar.

2026-08-30 04:10 BRT — Layout/Theme Engine ownership clarification
Result: PASS
Evidence: D80 and the normative boundary in `docs/DESIGN_UX.md` assign
structure/state transitions to layout and all visual treatment to the Theme
Engine. The specification, architecture, plan, acceptance matrix, and agent
contract now require semantic tokens and explicitly avoid prescribing flatness,
radius size, shadow amount, glow amount, or another fixed theme aesthetic.

2026-08-30 04:40 BRT — M2 headless Query/View Engine gate
Result: PASS
Evidence: generated commands expose parser, paginated entity query, global
search, built-in Views, album detail, and artist detail DTOs. SQLite schema v3
adds FTS5 `unicode61 remove_diacritics 2`, trigger synchronization, deterministic
album identity, migration hydration, and local history projection columns. Rust
tests: 20 passing, covering A06–A10/A09b including precedence/unknown fields,
bound malicious values, FTS insert/update/delete, View roundtrip, combined free
text + structured filters, relational artist search, and isolated disc/track
album order. Strict Clippy passes. `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, and `pnpm build` pass. A brief `cargo run`
regenerated TypeScript bindings and reached `basis.exe` without a startup panic.

2026-08-30 16:21 BRT — M3a definitive interface gate
Result: PASS
Evidence: the React shell now uses a compact top toolbar with portable ordered
pinned Views and adaptive overflow, never a permanent sidebar. GenericView
provides paginated Grid/List/Table representations, filter AST composition,
sorting, grouping, density, cover size, visible fields, multiselect, and a
selection context menu. Search is a grouped main-canvas route distinct from the
fuzzy `Ctrl+K` palette; album and artist routes consume M2 DTOs. Custom Views
roundtrip atomically under `.musiclib/views/`, built-ins duplicate rather than
mutate, `workspace.sidebar` persists pin/order/hide state, and app-data restores
the recent root without leaking absolute paths into portable state. Six
component tests cover the quiet empty state, shell/sidebar invariant, keyboard
entry points, relational SearchView, and Back scroll restoration; 22 Rust tests
cover View persistence and recent-root bounds. Frontend format/lint/typecheck,
tests, production build, rustfmt, strict Clippy, and `git diff --check` pass. A
brief desktop run reached `basis.exe`. Browser checks at 1280, 1000, and 720 px
reported canvas/document widths equal to the viewport with no horizontal
overflow; real `Ctrl+K` focus and `Ctrl+F` Search navigation also passed. Static
audits find no obsolete dashboard/sidebar composition and no visual literals
outside the resolved token boundary.

2026-08-30 17:10 BRT — M3b Theme Engine and portable editor gate
Result: PASS
Evidence: the Rust Theme Engine now owns a complete versioned public token
registry, hard defaults and bounds, sparse built-in inheritance, strict
hex/OKLCH parsing, forward-key preservation, runtime contrast correction,
last-known-good-compatible failures, atomic custom writes, ID collision rules,
selection fallback, v0 migration backups, and a checked-in JSON Schema. Paper,
Nocturne, and Chromatic share the public JSON format. `Settings → Appearance`
provides live Light/Dark selection, system following, preview cards,
Duplicate/Save As, custom rename/delete, searchable Basic/Advanced token
editing, token/section/full reset, contrast status, file/text import with
explicit replacement, and copy/download export. One typed boundary resolves
validated tokens into `--mv-*`; layout components do not parse Theme JSON.
Artwork is decoded with allocation/dimension limits, rendered only from
generated 64/128/256/512 WebP thumbnails, and supplies a cached deterministic
64px OKLCH accent to Chromatic. Missing artwork uses a deterministic
theme-derived treatment. `cargo test --all-features` passes 30 tests including
A14–A19/schema/migration/artwork cases; strict Clippy and rustfmt pass. Eight
frontend tests include live Paper/Nocturne/Chromatic switching while retaining
the same navigation DOM and density/type scaling at the CSS boundary. Prettier,
ESLint, TypeScript, Vitest, the production Vite build, generated Tauri bindings,
`git diff --check`, and repeated brief `basis.exe` launches pass.

2026-08-30 22:00 BRT — M4 playback, queue, and Now Playing gate
Result: PASS
Evidence: `AudioEngine` contains no Voxio types outside its adapter; Voxio
0.2.3 remains behind that boundary after compiling and passing explicit real
default-device smoke tests. `real_default_device_starts_every_target_codec_fixture`
starts generated MP3, FLAC, AAC/M4A, ALAC/M4A, Ogg Vorbis, WAV, and Opus files;
`real_transport_controls_and_gapless_advance_work` verifies volume, pause,
seek, resume, next-track priming, and a real gapless handoff. The smoke exposed
and fixed normal Voxio `NextReady` events being misclassified as errors. The
queue implements replace/next/append, stable shuffle, previous/repeat rules,
recoverable device/codec errors, small transport events, and 5-second local
persistence under `sessions/<library_id>/<root_instance_hash>.json`; a test
proves copied roots restore distinct paused sessions. The React shell mounts a
persistent bottom transport outside the routed canvas, a closable responsive
queue pane, deliberate `/now-playing` navigation, album/artist/View/Search play
actions, Space/media keys, and no navigation from automatic events. A20b passes
by advancing the current track while retaining `/browse`. Browser inspection at
1280, 1000, and 720 px found document/shell/workspace widths equal to the
viewport and no permanent pane/sidebar. `pnpm tauri dev` reached `basis.exe`
without panic. Final evidence: 34 regular Rust tests pass with two explicit
hardware smokes separately passing; strict Clippy/rustfmt, 10 frontend tests,
Prettier, ESLint, TypeScript, production Vite build, generated bindings, and
`git diff --check` pass.

2026-08-30 22:35 BRT — M5 automated implementation gate
Result: PASS
Evidence: static and smart playlists use versioned `<uuid>.json` documents,
atomic writes, portable paths/hints, unavailable-file warnings, bounded
materialization, D30 single-candidate relink suggestions with explicit user
confirmation, virtualized drag/reorder, and library context actions. A stable
local `device_id` writes only `.musiclib/events/<device_id>.jsonl`; played,
skipped, and favorite_set validate bounded RFC 3339 UTC events. Player history
counts wall-clock listened time rather than seek position, applies D32/D33, and
persists in-progress accounting locally. SQLite projection replay deduplicates
played event UUIDs, resolves favorite LWW by timestamp/event UUID, and runs on
open and after every scan. Its integration test appends through two device
files, deletes the SQLite database, reindexes, and recovers play count,
last-played, and favorite. Home composes Recently Added, Recently Played, and
Favorites from the existing built-in View definitions; Search and the command
palette expose playlists. `cargo test --all-features` passes 38 tests with only
the two explicit M4 hardware smokes ignored; rustfmt and strict Clippy pass.
Thirteen frontend tests, ESLint, TypeScript, Prettier, and the production Vite
build pass. `pnpm tauri dev` regenerated bindings and reached `basis.exe`
without startup/runtime output. The M5 checkbox remains open only for the
requested hands-on desktop smoke.

Format for new entries:

```text
YYYY-MM-DD HH:mm TZ — <gate/command>
Result: PASS | FAIL | BLOCKED
Evidence: <objective summary, relevant test/file/log>
```

## Decisions made during implementation

| Date | Decision | Reason/evidence | Impact |
|---|---|---|---|
| 2026-08-29 | D01–D69 accepted; product renamed to Basis | Product-owner decision recorded in `DECISIONS.md` | All implementation follows the locked contracts |
| 2026-08-29 | MusicBrainz WS2 selected for future opt-in enrichment | Official API supports tag-based entity search; local normalization remains authoritative | No MusicBrainz work in M0–M8 |
| 2026-08-29 | No Syncthing-specific conflict handling | Product owner assigns versioning/conflict policy to Syncthing/user strategy | Remove conflict detector/warning acceptance work |
| 2026-08-30 | D70–D79 accepted as the shell/navigation/search/Now Playing contract | Product-owner redesign prompt consolidated in `DESIGN_UX.md` | Replace the planned sidebar/dashboard composition with top-toolbar pinned Views, main-canvas SearchView, restorable history, and non-focus-stealing playback navigation; no implementation milestone was advanced by this documentation change |
| 2026-08-30 | D80 accepted as the strict Layout/Theme Engine boundary | Product owner clarified that structural anti-container rules must not prescribe flatness, radius, shadow, glow, or another aesthetic | Layout owns structure/state transitions; Theme Engine owns all visual treatment through semantic tokens, permitting substantially different themes without changing information architecture |
| 2026-08-30 | D81 assigns the definitive layout to M3a | Building GenericView/detail routes in M2 would create a provisional UI and avoidable rework | M2 remains headless data/contracts; M3a implements the final shell/search/detail/navigation structure; M3b supplies theme values |
| 2026-08-30 | Manual Light/Dark appearance is device-local while both selected Theme IDs remain portable | D49 defines two portable slots plus system following but no portable active-manual slot; the active device appearance is rendering state, not library content | The editor persists Paper/dark selections and follow-system in `workspace.json`; when system following is off, the last manually activated appearance is retained only in the local webview profile |
| 2026-08-30 | Voxio 0.2.3 retained behind `AudioEngine` | It compiled inside the D45 timebox and real Windows default-device tests passed all target codecs, controls, and gapless handoff | No Rodio fallback was activated; normal/future adapter-only events are filtered until assigned explicit domain semantics |
| 2026-08-30 | The installation UUID lives in local `basis/settings.json`; portable history replay runs after open/scan and event append | D32–D37 require one stable local writer identity and a disposable SQLite projection | Each installation appends only its named JSONL file; deleting the local index cannot remove favorites or play history |

## External blockers

None recorded. Production Tauri signing credentials are not required to
write/test the integration, but they are required to publish a real release.
Windows Authenticode is explicitly unavailable for the initial release and is
not an MVP blocker. Never record a secret value here.

## Debt outside the cut

Only M9/non-goal items may appear here. An incomplete M0–M8 requirement is not
“debt”; it is an open gate.

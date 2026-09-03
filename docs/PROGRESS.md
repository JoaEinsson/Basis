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
- [x] M5 — playlists, events, and Home
- [x] M6 — LRC/LRCLIB and offline reuse
- [x] M7 — signed updater and release path
- [x] M8 — watcher, security, integration, and final build

## Current gate

`M0–M8 complete — post-MVP UI/UX polish P0–P4 green; P5 implemented and awaiting the real-library desktop smoke`

The product owner accepted the packaged Arch/KDE result, library acquisition and
indexing, and synchronization behavior on September 1, 2026. P1–P4 are green;
the remaining packaged-platform portions of the P0/P2 matrix stay recorded for
the system-wide P8 pass. P5 now includes D89's deterministic featured-credit
projection and the complete library-surface pass; its final gate is the
real-library desktop observation after the one-time local index reprojection.

## Verification

- [x] frontend format
- [x] frontend lint
- [x] frontend typecheck
- [x] frontend tests
- [x] frontend production build
- [x] rustfmt
- [x] clippy `-D warnings`
- [x] cargo tests
- [x] cargo audit
- [x] pnpm production audit
- [x] Tauri release build
- [x] end-to-end smoke test
- [x] copy-to-another-root + DB-rebuild smoke test
- [x] valid updater and invalid-signature tests

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
palette expose playlists. `cargo test --all-features` passes 39 tests with only
the two explicit M4 hardware smokes ignored; rustfmt and strict Clippy pass.
Fourteen frontend tests, ESLint, TypeScript, Prettier, and the production Vite
build pass. `pnpm tauri dev` regenerated bindings and reached `basis.exe`
without startup/runtime output. The M5 checkbox remains open only for the
requested hands-on desktop smoke.

2026-08-31 02:00 BRT — M5 first manual smoke
Result: FAIL
Evidence: Home passed Recently Added, empty Recently Played/Favorites, and the
no-sidebar invariant. Smart playlist creation, resolution, and restart also
passed. Static-playlist/favorite testing stopped because some track
presentations exposed the native WebView context menu instead of Basis actions.
The original PowerShell handoff also incorrectly assumed variables survive a
new terminal and combined `-LiteralPath` with wildcards.

2026-08-31 02:15 BRT — M5 manual-smoke corrections
Result: PASS
Evidence: every `TrackList` row now suppresses the native context menu and
provides the same actions through an explicit keyboard-accessible ellipsis
button; smart-playlist results now use that shared component. A component test
verifies both right-click suppression and the explicit action path. Portable
inspection was performed directly against the reported temporary library: the
smart playlist is a valid UUID-named schema-v1 query document, contains no
absolute root, and seven bounded `played` events resolve portable paths. That
inspection also exposed a stale-process race between an event filename and the
settings device ID. `device.json` now claims the installation UUID atomically
with no-clobber semantics and mirrors it to settings; an eight-worker test
proves convergence, and a real desktop launch confirmed both local files equal
`9aa51b60-46fd-4c9a-b2a9-5182f379a998`. Final automated evidence is 39 regular
Rust tests plus two ignored M4 hardware tests, 14 frontend tests, strict Clippy,
rustfmt, ESLint, TypeScript, Prettier, production build, and a clean desktop
 startup. Only the user-visible static-playlist/favorite retest remains.

2026-08-31 02:31 BRT — M5 static-playlist manual retest
Result: FIXED; FINAL VISUAL RECHECK PENDING
Evidence: the user confirmed static-playlist operation and order persistence
after restart, and the Favorites view contains the tracks added through the
repaired Basis action menu. One row displayed `Missing track` for
`Café/four.wav`. Direct read-only inspection proved the playlist JSON, physical
file, and indexed SQLite row all contain the same portable UTF-8 path, and the
database resolves it exactly. The row was present; its WAV metadata simply has
no title or artist tags. Static-playlist presentation now uses the shared
filename title fallback and `Unknown artist` for resolved untagged tracks,
reserving `Missing track` for a null resolution. Two regression cases cover
both states. All 16 frontend tests, TypeScript, ESLint, Prettier, and the
production Vite build pass. M5 remains open only until the corrected label is
 observed once in the desktop app.

2026-08-31 03:08 BRT — M3a/M5 stabilization after manual review
Result: FIXED; FOCUSED DESKTOP RETEST PENDING
Evidence: the final WAV presentation recheck passed, but screenshots exposed
that most entity renderers stored density without consuming it, Albums List and
Table shared one branch, Folder/Genre rows were inert, Grid tracks lacked the
shared Basis action menu, and static-playlist drag relied on asynchronous React
state. Density now changes theme-token-driven grid sizing/gaps, list padding,
table padding, and all three virtualized track-row heights. Albums, Artists,
Folders, and Genres have distinct semantic Table renderers. Folder/Genre
activation pushes a history-restorable drill-down that materializes tracks
through the shared Query Engine; a parameterized `startsWith` operator prevents
similarly named folders elsewhere in a path from leaking into the result. Grid
tracks now use the shared Basis context menu and an explicit ellipsis, while the
Generic View canvas suppresses the browser menu outside editable fields.
Static-playlist rows expose a dedicated drag handle whose source index travels
in `DataTransfer`, retaining the existing keyboard Move controls. Regression
tests cover density propagation, distinct Table structure, facet activation and
predicates, Grid menus, and the real drag/drop event path. Evidence is 40
regular Rust tests plus two ignored hardware tests, strict Clippy/rustfmt, 21
frontend tests, ESLint, TypeScript, Prettier, production build, regenerated
bindings, and a clean `basis.exe` startup. M3a is temporarily reopened and M5
remains open only for the listed desktop observations.

2026-08-31 15:15 BRT — M3a/M5 native Windows drag/drop diagnosis
Result: FIXED; FINAL DESKTOP GESTURE RECHECK PENDING
Evidence: the user confirmed the remaining density, representation,
Folder/Genre, and track-action behavior. Album and Artist entities do not expose
an entity context menu; track rows inside their details use the verified shared
track menu. The remaining drag failure was outside React: Tauri's default
WebView2 drag/drop handler replaces frontend HTML5 drag/drop on Windows. The
main window now sets `dragDropEnabled: false`, preserving the playlist's
existing HTML5 `DataTransfer` path and keyboard Move controls. JSON parsing
confirms the resolved setting is false, `cargo check --all-features` passes, the
five focused playlist tests pass, and `git diff --check` reports no errors. A
full desktop restart and one real handle gesture remain required because jsdom
cannot exercise WebView2 drag initiation.

2026-08-31 15:29 BRT — M5 protected DataTransfer drop correction
Result: FIXED; FINAL DESKTOP GESTURE RECHECK PENDING
Evidence: after `dragDropEnabled: false` restored native drag initiation, the
user observed the drag image but no reorder. During `dragover`, Chromium keeps
the `DataTransfer` payload in protected mode, so `getData` returned empty; the
target incorrectly selected `dropEffect = copy` while the source allowed only
`move`, causing WebView2 to reject the drop. Internal reorder now selects the
move effect from the source index retained at `dragstart` and still reads the
portable payload on `drop`. The focused regression test hides dragover data,
asserts the move effect, and verifies the persisted reorder call. All five
playlist tests, TypeScript, ESLint, Prettier, and the production build pass.

2026-08-31 15:35 BRT — M3a/M5 final desktop gesture retest
Result: PASS
Evidence: after a full WebView2 restart, the user confirmed that dragging a
static-playlist row by its handle reorders successfully. Together with the
previous focused manual observations, this closes the reopened M3a gate and the
M5 playlist/events/Home gate. Development resumes at M6.

2026-08-31 16:08 BRT — M6 lyrics automated gate and desktop startup
Result: PASS (manual LRCLIB/offline-reuse smoke still pending)
Evidence: the Rust lyrics service resolves sidecar, conveniently embedded, and
portable-mirror lyrics before making an explicit Now Playing LRCLIB request;
matching normalizes title/artist, bounds duration to +/-3 seconds, uses album as
a tie-breaker, serializes provider traffic, enforces 5/15-second timeouts and a
1 MiB response cap, and atomically persists synchronized lyrics beside the
track or under `.musiclib/lyrics`. Now Playing renders untrusted text, synced
line emphasis, smooth follow with manual suspension/resume, timestamp seeking,
plain/instrumental/missing/error states, and ambiguous-result selection through
semantic theme tokens. `cargo test` passes 45 tests with 2 hardware tests
ignored; strict Clippy and rustfmt pass. `pnpm test` passes 23 tests; ESLint,
TypeScript, Prettier, and the production build pass. Two brief `pnpm run tauri
dev` starts regenerated Specta bindings and reached `target\\debug\\basis.exe`
without a startup panic.

2026-08-31 16:35 BRT — M6 safe synced promotion and independent lyric scroll
Result: PASS (focused desktop retest pending)
Evidence: a valid plain `/api/get` result is now retained as a fallback while
Basis performs `/api/search` for a safe synchronized alternative. Exact
normalized title/artist and the locked +/-3-second duration remain hard gates;
album remains the tie-breaker, incompatible acoustic/remix titles are rejected,
and equally safe synced results require user selection with the plain fallback
still offered. On wide layouts, Now Playing has a definite canvas height and
programmatic follow scrolls only the lyrics element instead of every scrollable
ancestor; the responsive stacked layout retains page scrolling. Three new Rust
regressions cover synced promotion, incompatible-version fallback, and
ambiguous selection. `cargo test` passes 48 tests with 2 hardware tests ignored;
strict Clippy/rustfmt, all 23 frontend tests, ESLint, TypeScript, Prettier, and
the production build pass.

2026-08-31 17:48 BRT — M6 explainable LRCLIB matching hardening
Result: PASS (focused desktop retest pending)
Evidence: LRCLIB retrieval, candidate evaluation, and the final selection
decision are now separate. Production matching uses generic semantic
normalization for Unicode, punctuation, `and`/`&`, leading track numbers, and
release qualifiers; distinguishes recording variants such as live, acoustic,
remix, demo, redux, and bare from release editions; preserves D56's +/-3-second
limit for automatic selection while exposing bounded review-only alternatives;
and validates synchronized LRC structure and timing coverage before automatic
use. Plain lyrics remain visible when a synchronized alternative needs user
confirmation, and the picker explains confidence, album identity, duration,
and timing evidence. No track, artist, album, or provider ID is special-cased in
production; one real failure shape is retained only as a regression fixture.
`cargo test --lib` passes 50 tests with 2 hardware tests ignored, including six
matcher regressions; strict Clippy and rustfmt pass. All 24 frontend tests,
ESLint, TypeScript, Prettier, and the production build pass.

2026-08-31 22:07 BRT — M6 focused desktop acceptance
Result: PASS
Evidence: the user confirmed that the previously failing LRCLIB cases now
resolve correctly, synchronized lyrics and their fallback behavior work, the
wide Now Playing artwork/lyrics panes scroll independently, and the complete M6
experience is stable enough for the MVP. M6 is closed and work advances to M7.

2026-08-31 22:50 BRT — M7 signed updater automated gate and host packaging
Result: PASS (focused desktop Settings/playback smoke pending)
Evidence: the official updater/process plugins use matched 2.10/2.3 frontend
and Rust lines, the production configuration embeds the real public key and
locked HTTPS GitHub Releases endpoint, and main-window capabilities permit only
the updater plus process restart. Device-local policy defaults to non-blocking
startup checks at most once per 24 hours while manual checks bypass the
interval. Settings exposes signed-channel status, automatic-check preference,
release metadata, explicit confirmation, download progress, install, error,
and relaunch states. A checked-in manifest/payload/signature fixture is accepted
by the configured public key and a one-byte modification is rejected; manifest
tests also reject missing signatures, HTTP URLs, missing platforms, prerelease
versions, and version drift. A real release-mode Windows build produced the
6.8 MB NSIS installer and its 416-byte updater signature. The GitHub workflow
builds NSIS and AppImage from frozen lockfiles, keeps the release in draft,
validates both signed targets, and only then publishes it with the required
SmartScreen/Authenticode disclosure. Evidence: `pnpm run release:validate`, 3
Node release tests, 28 frontend tests, 52 effective Rust tests including the
signature integration test (2 hardware tests ignored after M4 evidence),
strict Clippy, ESLint, TypeScript, Prettier, production Vite build, rustfmt, and
`git diff --check` pass. Repository search finds no private-key marker or
developer-specific absolute path outside ignored build/dependency output.

2026-08-31 23:02 BRT — M7 focused desktop acceptance
Result: PASS
Evidence: while local audio was playing, the user confirmed that the manual
check failure remained non-fatal, the automatic-check preference persisted
across restart, and the remainder of the updater Settings flow behaved as
specified. Product-copy review removed unnecessary implementation language
from the About and error states. M7 is closed and work advances to M8.

2026-09-01 04:04 BRT — M8 automated watcher, security, icon, and release gate
Result: PASS (focused desktop watcher smoke pending)
Evidence: a native recursive watcher starts only after the initial scan,
debounces each burst for 500 ms, coalesces normalized paths, waits for stable
size/mtime, incrementally adds/updates/removes audio and directory subtrees, and
falls back to a bounded full rescan only if a burst exceeds 4096 paths. External
atomic changes to Views, playlists, events, themes, workspace, and lyrics emit
typed refresh events; active library pages, details, Home, playlists, themes,
Search state, and Now Playing subscribe without requiring a restart. Rust tests
cover single-file add/change/remove, subtree replacement, and final-path
classification after an atomic portable rename. The frontend event regression
proves that a watcher event refreshes the live library projection.

The provided adaptive and signal SVGs are retained under `assets/brand/`; the
signal mark replaces the app-shell placeholder and generated the Tauri RGBA
PNG/ICO/ICNS desktop set. Release validation checks the icon dimensions and
alpha, a production CSP without localhost/WebSocket origins, and an exact
three-permission main-window allowlist. Linux CI extracts the built AppImage,
resolves its desktop icon, checks linked libraries, and rejects bundled
EGL/GLES/Wayland client ABI libraries; a real Arch/KDE Wayland launch/updater
smoke remains required before the first Linux publication because the Ubuntu
runner cannot emulate that host stack.

Evidence commands: 29 frontend tests, 56 effective Rust tests with the two
previously proven hardware tests still explicitly ignored, strict Clippy,
rustfmt, ESLint, TypeScript, Prettier, Vite production build,
`release:validate`, updater manifest tests, and `git diff --check` pass.
`pnpm audit --prod` reports no known vulnerability. `cargo audit` reports no
denied vulnerability and exits successfully; it lists 18 upstream maintenance
or soundness warnings in target/build-time Tauri/GTK/urlpattern dependency
lines for ongoing upstream tracking. The signed Windows host build produced
`Basis_0.1.0_x64-setup.exe` (6,876,597 bytes) and its 416-byte updater
signature. Existing M1 tests prove copied roots get separate indexes and that
deleting only SQLite rebuilds all portable/authored state.

2026-09-01 04:25 BRT — Library-root recovery and switch UX
Result: PASS (manual folder selection pending)
Evidence: the application menu now exposes `Add music folder…` with no active
root and `Change music folder…` with an active root. Settings shows the current
root and provides the same action. The flow reuses the established native
folder picker and scan pipeline and never deletes portable `.musiclib` data.
All temporary M5/M8 fixture roots and their derived local SQLite/artwork data
were removed without touching settings, device identity, or real music. The
frontend suite passes 30 tests; ESLint, TypeScript, Prettier, and the production
Vite build pass.

2026-09-01 05:17 BRT — M8 Linux AppImage release-candidate correction
Result: PASS (clean CI rerun and Arch/KDE smoke pending)
Evidence: release run 33483360730 successfully built and signed the 88,820,216
byte AppImage, then correctly stopped while it was still a draft because the
payload contained `libwayland-client`, `libwayland-cursor`, `libwayland-egl`,
and `libwayland-server`. Inspection of that exact artifact confirmed the gate
was detecting the anticipated Mesa/Wayland compatibility hazard rather than a
compile or signing failure. The release workflow now extracts the AppImage,
removes every `libwayland-*` ABI library, preserves its original runtime,
rebuilds it with appimagetool 1.9.1 pinned by its published SHA-256, re-signs the
changed payload, and replaces the unsafe draft assets. A final job downloads
the Linux and Windows updater artifacts, verifies both signatures against the
public key embedded in Basis, regenerates `latest.json` from their stable
browser-download URLs, validates it, and only then publishes the draft.

The post-processor was executed locally under WSL against the failed CI
AppImage: it found all four bundled Wayland libraries, rebuilt the real payload,
and direct extraction proved no forbidden EGL/GLES/Wayland library remained.
The remaining local `ldd` check could not pass because that minimal WSL host
lacks system `libwayland-server`; the Ubuntu CI image installs the declared GTK
build dependencies before performing the same check. Shell syntax, workflow
YAML parsing, four updater-manifest regressions, manifest finalization,
`release:validate`, ESLint, TypeScript, the 30-test frontend suite, Prettier, and
`git diff --check` pass.

2026-09-01 05:36 BRT — Post-MVP UI/UX polish plan
Result: DOCUMENTED (implementation intentionally gated by M8 release evidence)
Evidence: `docs/UI_UX_POLISH_PLAN.md` defines a baseline audit plus eight
ordered polish passes, a complete component coverage matrix, motion and
reduced-motion behavior, a
unified custom Windows/Linux window/application toolbar, and packaged-platform
acceptance. D82-D85 lock the gate, titlebar behavior, Signal Cyan Nocturne
identity derived from the Basis icon, and Theme-Engine-owned motion. The
canonical spec, design contract, executable plan, and agent reading order now
cross-reference the accepted direction. No application code or built-in theme
data changed during this planning step.

2026-09-01 12:17 BRT — M8 metadata verifier runner correction
Result: IMPLEMENTED (clean CI rerun pending)
Evidence: the second release run built both platform artifacts and reached the
final metadata job, but Ubuntu 22.04 could not locate the `minisign` APT package;
no signature was rejected. The workflow now bootstraps the official Minisign
0.12 Linux x86_64 archive through `scripts/install-minisign.sh`, pins the
SHA-256 to `9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73`,
and adds only that verified binary to the job path. Release validation rejects
an unpinned installer or any return to `apt-get install minisign`. The detached
AppImage and NSIS signature gate remains mandatory. The installer was then run
end to end under Ubuntu WSL: its TLS download matched the pinned digest,
reported Minisign 0.12, and successfully verified the actual 88,762,872-byte
AppImage and 6,850,114-byte NSIS installer downloaded from the `v0.1.0` draft
against the public key embedded in Basis. Temporary test artifacts were removed
afterward.

2026-09-01 12:28 BRT — Post-MVP motion direction revision
Result: DOCUMENTED (implementation remains gated by M8 release evidence)
Evidence: D85 and `docs/UI_UX_POLISH_PLAN.md` now define expressive, controlled
motion rather than a uniformly restrained pass. The accepted vocabulary covers
directional navigation, shared artwork continuity with deterministic fallback,
spring-like overlays and panes, moving selection indicators, transport-state
transitions, coordinated track changes, active lyrics, drag/reorder settlement,
artwork loading, and bounded short-list staggering. Theme tokens and reduced
motion remain mandatory; perpetual idle effects, virtualized geometry animation,
and input or playback latency remain prohibited. No application code changed.

2026-09-01 12:52 BRT — Lyrics presentation and featured-credit album plan
Result: DOCUMENTED (implementation not started)
Evidence: D86–D89 lock readable editable lyric states, zero horizontal lyric
overflow, device-local Show/Hide Lyrics with temporary instrumental
recomposition, and primary-credit album grouping that preserves full track
display metadata. Inspection found that Paper currently omits `color.lyrics.*`
overrides and therefore inherits the light-on-dark registry defaults; the
scanner also currently passes the first complete track-artist string directly
into per-file `album_key` generation when AlbumArtist is absent. The album
identity correction and rebuildable-index reprojection are assigned to the open
M8 gate with A05d coverage. Visual contrast/editor work belongs to P1, while
wrapping, visibility, centering, and instrumental behavior belong to P6 and P8.
No application code or theme data changed.

2026-09-01 15:07 BRT — Linux native folder-picker deadlock correction
Result: PASS (Arch/KDE packaged-app recheck pending)
Evidence: `library_choose_root` is now asynchronous and waits for the native
dialog callback on Tauri's blocking executor instead of calling
`std::sync::mpsc::Receiver::recv()` on the command thread. This leaves the main
GTK/WebKit event loop free to open and operate Add/Change music folder dialogs.
`cargo fmt --check`, `cargo check --all-features`, all 56 effective Rust tests
(55 unit plus updater-signature integration; 2 hardware smokes ignored), strict
Clippy, and `git diff --check` pass.

2026-09-01 15:14 BRT — Stable AppImage/KDE integration polish contract
Result: DOCUMENTED (implementation intentionally deferred to post-MVP polish)
Evidence: D90, P7/P8, POL21, and `RELEASE_AND_SIGNING.md` now require the final
Linux assets to be exactly `Basis.AppImage` and `Basis.AppImage.sig` while the
application and release metadata remain versioned. Optional per-user desktop
integration uses a stable executable path plus XDG application/icon files,
requires explicit consent, and must survive a signed update and KDE relaunch.
No workflow or application code changed in this planning step.

2026-09-01 15:34 BRT — M8 packaged Arch/KDE and synchronization acceptance
Result: PASS — M8 CLOSED
Evidence: after the nonblocking native-folder correction, the product owner
confirmed that Add/Change music folder opens correctly in the packaged Linux
app, the selected real library indexes, and the exercised synchronization flow
works. Together with the recorded watcher, security, signed release, AppImage,
copy/rebuild, and updater evidence, this closes the final MVP gate. Per the
product-owner scope decision, D89 remains an accepted post-MVP P5 correction and
is not a condition of M8 closure.

2026-09-01 15:46 BRT — Public README and Apache-2.0 licensing
Result: PASS
Evidence: the repository README now documents verified product capabilities,
installation, first indexing, portability, privacy, shortcuts, development,
release behavior, architecture references, scope, and contribution guidance.
The official Apache License 2.0 text is present at the repository root, and both
Node and Rust package metadata declare the `Apache-2.0` SPDX identifier. Tauri
bundle metadata includes that license file, and release validation prevents the
package manifests or bundles from dropping it. Prettier, local README-link
validation, Cargo metadata parsing, release validation, and `git diff --check`
pass.

2026-09-01 16:25 BRT — P0 deterministic visual baseline and first audit
Result: PASS (P0 remains in progress)
Evidence: development-only `visual-fixture` IPC/event data now boots the real
shell, routes, theme resolution, player, queue, and five lyric states without a
personal library or production code path. Browser evidence covers the 640,
800, 1199, 1200, and 1600 width bands plus every primary route. The audit
reproduced Paper's near-white active lyric, synchronized-line scale overflow,
the missing artwork-only/instrumental composition, and queue-open canvas
overflow. `docs/UI_UX_BASELINE.md` records every coverage-matrix row, explicit
unreachable states, keyboard/reduced-motion findings, and remaining packaged
Windows/Arch motion prototypes. TypeScript, ESLint, fixture tests, and build
validation are the automated gate for this slice.

2026-09-01 21:11 BRT — P1 token, Signal Cyan identity, and lyric contrast
Result: PASS
Evidence: the canonical Theme Engine registry and CSS alias bridge now provide
semantic window, overlay, interaction, player, lyric, and expressive motion
roles. Nocturne/startup/Chromatic fallback accents use Signal Cyan; feature CSS
contains no brand-color literals. Paper explicitly overrides every lyric role,
active scale, and inactive opacity. The appearance cards preview effective
Paper/Nocturne lyric hierarchy, while the editor reports contrast after opacity
composition. Browser inspection at 1200 × 800 confirmed readable active, past,
and upcoming Paper states without an exposed horizontal lyric scrollbar. The
theme-provider regression switches Paper, Nocturne, Chromatic, and a divergent
custom theme without replacing the navigation DOM. All 35 frontend tests,
8 focused Rust Theme Engine tests, ESLint, TypeScript production build, Rust
formatting, and `git diff --check` pass. P0's packaged Windows/Arch motion and
keyboard evidence remains open and is not misreported as completed by P1.

2026-09-01 21:24 BRT — P1 bidirectional Theme isolation regression
Result: PASS
Evidence: visual review found Paper-only titlebar/menu variables surviving a
switch to Nocturne, then exposed the inverse class of defect when Paper inherited
the dark registry's player surface. The CSS-variable boundary now removes every
property absent from the next resolved theme, the browser fixture mirrors all
new hard defaults, and Paper explicitly overrides every `color.*` registry
token. A Rust assertion prevents future dark color defaults from entering Paper
implicitly. Clean-browser round trips measured Paper canvas/toolbar/player as
`rgb(247,247,245)`/`rgb(255,255,255)`/`rgb(255,255,255)` and Nocturne as
`rgb(12,13,16)`/`rgb(21,23,28)`/`rgb(21,23,28)`. All 37 frontend tests, ESLint,
the production build, 8 Rust Theme Engine tests, formatting, and
`git diff --check` pass.

2026-09-01 21:32 BRT — P1 adaptive in-app identity mark
Result: PASS
Evidence: the shell now renders the provided adaptive Basis geometry as an
inline, flat `currentColor` SVG instead of the fixed-gradient application icon.
The semantic accent role colors the 32 px mark without increasing toolbar
height: browser inspection measured Paper as `rgb(64, 86, 180)` and Nocturne as
`rgb(73, 217, 199)`, with two paths and no gradient nodes. The focused shell
suite passes 8 tests; ESLint and the TypeScript/Vite production build pass.

2026-09-02 09:21 BRT — P2 unified window chrome automated gate
Result: PASS (packaged desktop acceptance pending)
Evidence: `WindowChrome` and its Tauri/browser adapter now provide a dedicated
empty drag region, double-click maximize/restore, synchronized Minimize,
Maximize/Restore, and Close controls, accessible labels, Theme-Engine-owned
hover/focus/pressed/tooltips, and a distinct Close danger state. Only the drag
region calls `startDragging`; navigation, search, menus, and controls remain
ordinary interactive DOM. The main window is undecorated and the capability
allowlist adds only Close, Minimize, Start Dragging, and Toggle Maximize.
Browser measurements at 1200x800 and the 640x560 minimum found no horizontal
overflow and retained 236 px and 228 px drag targets respectively, including
active Search. Browser preview logged no unavailable-Tauri errors. All 40
frontend tests, ESLint, Prettier, TypeScript/Vite production build,
`release:validate`, `git diff --check`, and a native Tauri debug build pass.
Windows snap/scale and Arch KDE/Wayland packaged behavior remain manual gate
evidence and P2 is not closed until those checks are observed.

2026-09-02 09:33 BRT — P2 Windows desktop acceptance
Result: PASS (Arch/KDE packaged acceptance pending)
Evidence: the product owner exercised the completed custom chrome in the
desktop app and reported all tested behavior working before explicitly
authorizing P3. This closes the Windows acceptance for the tested environment;
the broader Arch KDE/Wayland and scale matrix remains recorded as P0/P2 exit
evidence rather than being inferred from the Windows result.

2026-09-02 10:04 BRT — P3 shared interaction primitives
Result: PASS
Evidence: `src/components/ui/` now owns themed buttons, icon controls,
tooltips, icon swaps, menus, popovers, dialogs/scrims, text/search/select/range
inputs, checkbox/toggle controls, tabs/segmented controls, chips/badges,
feedback states, artwork/entity states, and drag/drop states. Core consumers
now use these primitives in window chrome, track context actions, View controls,
theme settings, updates, playlists, artwork, and the player. Dialog focus is
trapped and restored despite native `autoFocus`; menus and selection controls
provide arrow/Home/End/Escape behavior; semantic tokens own treatment and the
global reduced-motion contract disables their choreography. Browser/WebView
fixtures verified Paper and Nocturne, context-menu keyboard traversal, the
Columns popover, dialog focus restoration, zero horizontal overflow at 640 px,
and no console warnings/errors. `pnpm lint`, `pnpm typecheck`, all 49 frontend
tests, `pnpm build`, `pnpm format:check`, and `git diff --check` pass.

2026-09-02 15:53 BRT — P4 shell, navigation, search, and overlays
Result: PASS
Evidence: the compact `AppShell` now gives pinned Views a measured moving
active indicator and an accessible overflow representation, keeps Search in a
single expanding toolbar surface, uses portal menus for the application and
View overflow, and applies nonblocking directional route motion. History
entries persist exact canvas scroll, focus, and Search track selection state.
`CommandPalette` uses the shared focus-trapped dialog with keyboard
Home/End/arrow selection, emphasized matches, loading/error feedback, and
focus restoration. `SearchView` exposes distinct prompt, loading, grouped,
no-result, parse-error, and transport-error states. `QueuePane` is a focused,
Escape-dismissible responsive overlay with scrim, explicit empty/error states,
and canvas-route preservation. Browser/WebView fixtures verified portal
layering, moving View state, Search expansion/focus continuity, palette and
queue focus restoration, directional Back behavior, active overflow state,
and zero horizontal overflow at 720 px. `pnpm format`, `pnpm typecheck`,
`pnpm lint`, all 54 frontend tests, `pnpm build`, and `git diff --check` pass.

2026-09-02 16:18 BRT — P4 playback-regression correction and v0.2.0 release preparation
Result: PASS (automated; packaged restart smoke remains manual)
Evidence: the route stage now retains a definite canvas height, preventing
Now Playing's artwork/metadata column from being centered against the full
lyrics document. The shared range primitive computes a clamped semantic fill,
and the player session persists duration with a metadata fallback for legacy
session JSON; restored position is no longer hidden behind a zero-duration UI.
The browser fixture measured a visible 384x384 artwork frame, zero horizontal
overflow, and a 31.09% timeline fill in both Paper and Nocturne. The project is
version-aligned at 0.2.0. The Linux workflow renames and re-signs the final
payload as `Basis.AppImage`, deletes the superseded versioned draft assets, and
the manifest/AppImage validators reject versioned Linux updater names.
`release:validate`, all 5 updater-manifest tests, ESLint, TypeScript, all 54
frontend tests, the production build, Prettier, rustfmt, Clippy `-D warnings`,
57 Rust unit tests plus the updater-signature integration test,
`git diff --check`, `pnpm audit --prod`, and `cargo audit` pass; RustSec reports
only the 18 dependency-chain warnings already allowed by the repository policy.

2026-09-02 22:34 BRT — P4 packaged restart acceptance and P5 library/discovery pass
Result: PASS (automated and browser; real-library desktop smoke pending)
Evidence: the product owner confirmed the corrected artwork, restored timeline
fill, and persisted playback position after a real restart, closing P4's manual
smoke. P5 now gives album/artist cards bounded stagger, hover lift and action
reveal; artwork fades from a stable deterministic placeholder; TrackList exposes
the active track, Shift range selection, bulk play/queue/playlist/clear actions,
responsive columns, and action reveal; Home, Views, facets, and detail routes use
shared skeleton/error/empty states; folder/genre facets expose breadcrumbs.
D89 preserves raw AlbumArtist and TrackArtists, recognizes only trailing
`feat.`/`ft.`/`featuring`, requires same album/year corroboration, leaves
ambiguous credits separate, and versions the disposable SQLite reprojection so
startup work runs once rather than on every launch. Rust tests cover structured,
single-string, ambiguous, and different-year cases plus a real DB/query
regression that verifies one album without rewriting the track credit. Browser
fixtures verified Paper card motion/action reveal, Nocturne playing/selected
states, three-item Shift selection and bulk actions, folder breadcrumbs, and
zero horizontal overflow at 720 px; that check also exposed and corrected
over-spaced narrow View controls. An artwork regression verifies that the
deterministic placeholder remains visible until the decoded image fires its
load event. `pnpm lint`, all 57 frontend tests,
`pnpm build`, rustfmt, all 61 Rust tests (59 passing plus 2 hardware smokes
ignored), and the updater-signature integration test pass.

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
| 2026-08-30 | The installation UUID is claimed atomically in local `basis/device.json` and mirrored in `basis/settings.json`; portable history replay runs after open/scan and event append | D32–D37 require one stable local writer identity and a disposable SQLite projection; the first manual smoke exposed concurrent development startups choosing different IDs without a no-clobber claim | Concurrent startups converge on one writer identity; each installation appends only its named JSONL file, and deleting the local index cannot remove favorites or play history |
| 2026-08-31 | LRCLIB matching separates retrieval, semantic evaluation, and selection, with `high` and `review` outcomes | Literal album equality discarded synchronized results for semantically equivalent metadata, while blindly relaxing matching could select a remix/live/acoustic recording | D56 remains the automatic boundary; recording variants are rejected, release variants are ranked, uncertain synchronized results require confirmation, and plain lyrics remain the safe fallback |
| 2026-09-01 | D86–D89 accepted for lyrics presentation and album identity | Paper inherits unsuitable dark lyric defaults, long synchronized lines expose horizontal overflow, instrumental tracks waste a lyric column, and full-string featured credits reach `album_key` as distinct artists | P1 corrects and previews lyric tokens; P6/P8 add wrapping, visibility, instrumental recomposition, and tests; P5 corrects featured-credit album identity and reprojects the disposable index without rewriting track display metadata |

## External blockers

None recorded. Production Tauri signing credentials are not required to
write/test the integration, but they are required to publish a real release.
Windows Authenticode is explicitly unavailable for the initial release and is
not an MVP blocker. Never record a secret value here.

## Debt outside the cut

Only M9/non-goal items may appear here. An incomplete M0–M8 requirement is not
“debt”; it is an open gate.

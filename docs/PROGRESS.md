# Execution board

Update this file during development. Every `[x]` must have evidence under “Latest
verification.” Do not erase blocker history: mark blockers resolved and record
the resolution.

## Milestones

- [x] M0 — bootstrap and command roundtrip
- [x] M1 — library, metadata, artwork, and rebuildable index
- [ ] M2 — query/FTS/View Engine and album/artist detail
- [ ] M3a — UX, navigation, views, and command palette
- [ ] M3b — Theme Engine, built-ins, and portable editor
- [ ] M4 — playback and queue
- [ ] M5 — playlists, events, and Home
- [ ] M6 — LRC/LRCLIB and offline reuse
- [ ] M7 — signed updater and release path
- [ ] M8 — watcher, security, integration, and final build

## Current gate

`M2 — query/FTS/View Engine and album/artist detail`

Next concrete action: implement the serializable query AST, constrained parser,
parameterized SQLite compiler, FTS5 synchronization, and the first generic
track/album/artist view routes.

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

## External blockers

None recorded. Production Tauri signing credentials are not required to
write/test the integration, but they are required to publish a real release.
Windows Authenticode is explicitly unavailable for the initial release and is
not an MVP blocker. Never record a secret value here.

## Debt outside the cut

Only M9/non-goal items may appear here. An incomplete M0–M8 requirement is not
“debt”; it is an open gate.

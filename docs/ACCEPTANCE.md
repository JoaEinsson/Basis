# Acceptance and verification matrix

This matrix is the evidence contract. The agent must record results in
`PROGRESS.md`; marking code as implemented does not replace running the test.

## Expected commands after M0

Scripts may be adapted to the generated structure while preserving equivalent
names and behavior.

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
cargo audit --file src-tauri/Cargo.lock
pnpm audit --prod
pnpm tauri build
```

If `cargo audit` is not installed, record it as a tooling dependency, install it
when permitted, and do not confuse “not run” with “passed.” CI uses
`pnpm install --frozen-lockfile` and `cargo build --locked`.

## Mandatory automated tests

| ID | Test | Level | Milestone |
|---|---|---|---|
| A01 | normalize Windows/Linux paths to relative paths using `/` | Rust unit | M1 |
| A02 | reject absolute, drive, UNC, and `..` escaping paths | Rust unit | M1 |
| A03 | manifest/workspace roundtrip and atomic write | Rust unit/integration | M1 |
| A04 | scanner ignores symlinks and isolates an invalid file | Rust integration | M1 |
| A05 | incremental scan does not reparse unchanged size+mtime | Rust integration | M1 |
| A06 | free-text/quotes/predicate parser produces AST | Rust unit | M2 |
| A07 | AST compiles parameterized SQL using allowlists | Rust unit/integration | M2 |
| A08 | FTS follows insert/update/delete | Rust integration | M2 |
| A09 | `ViewDefinition` preserves a roundtrip | Rust/TS | M2 |
| A10 | album query isolates an album and orders disc/track | Rust integration | M2 |
| A11 | static and smart playlists roundtrip | Rust unit | M5 |
| A12 | DB rebuild recovers portable data/events | Rust integration | M5 |
| A13 | append-only events derive favorite/played state | Rust integration | M5 |
| A14 | theme roundtrip preserves a future token/field | Rust unit | M3b |
| A15 | sparse theme inherits a newly added base token | Rust unit | M3b |
| A16 | old migration preserves unknown metadata | Rust unit | M3b |
| A17 | out-of-range values use a safe fallback | Rust unit | M3b |
| A18 | Paper/Nocturne/Chromatic validate against the schema | Rust/CI | M3b |
| A19 | contrast/onAccent and missing base have fallbacks | unit | M3b |
| A20 | LRC parser selects the line for a timestamp | Rust/TS unit | M6 |
| A21 | lyrics are escaped as text and bounded | component/unit | M6 |
| A22 | updater rejects an invalid signature | integration/manual harness | M7 |
| A23 | LRCLIB/updater failure does not alter library/player | integration | M6/M7 |
| A24 | portable watcher reloads after atomic replacement | integration | M8 |

Add component tests for keyboard/focus behavior in the command palette, theme
editor, filters, and multiselect. Avoid large snapshots; test behavior.

## Minimum fixtures

Create small, legally redistributable or generated test fixtures:

```text
fixtures/library-a/
  Loose/one.mp3
  Odd Structure/two.flac
  Compilation/three.m4a
  .musiclib/...
```

Files must cover: complete tags, missing tags, multiple discs, album artist,
oversized/rejected artwork, corrupt file, Unicode path, and an LRC sidecar.
Fixtures must not contain absolute paths or copyrighted music.

## End-to-end smoke test

Run against a disposable copy of a real folder; the app does not expose delete.

1. First launch shows onboarding and a native folder picker.
2. Select a folder containing MP3, FLAC, and M4A; the shell opens during scanning
   and displays progress.
3. Verify title/artist/album/disc/track/duration for a known sample.
4. Navigate to Albums; open the first and confirm that only its tracks appear in
   disc/track order.
5. Run free-text search and every structured example from spec section 7.2.
6. Switch grid/list/table, filter, group, and save a custom view.
7. Pin/reorder/hide sidebar items; restart and confirm persistence.
8. Open `Ctrl+K` using only the keyboard and navigate to a track/album/action.
9. Switch among Paper/Nocturne/Chromatic without a reload.
10. Duplicate a theme, edit several categories, restart, export/import it, and
    confirm that an unknown key inserted into the fixture is preserved.
11. Play an album; use play/pause/seek/volume/next/previous/shuffle/repeat and
    confirm that the queue is separate from the playlist. Repeat playback with
    MP3, FLAC, AAC/M4A, ALAC/M4A, Ogg Vorbis, and WAV; include Opus when
    enabled/stable.
12. Create/reorder a static and smart playlist; favorite a track and generate a
    played event; restart and check Home/Favorites/Recently Played.
13. For a track without lyrics, query LRCLIB, synchronize lines, click to seek,
    and confirm the sidecar. Restart offline and verify it again.
14. Check for updates using valid signed metadata; observe progress/consent.
15. Repeat with an invalid signature and an offline endpoint; the app remains
    usable.
16. Modify/add audio outside the app; the watcher updates without a full rescan.
17. Create a Syncthing conflict name under `.musiclib`; the app only warns.
18. Close the app, copy the library to another absolute path, and open the copy.
19. Verify views, playlists, themes, favorites, and lyrics; no portable file
    references the former root.
20. Delete only the local SQLite database for that copy, reopen, and verify a
    rebuild with no loss of authored data.

## Definition-of-done traceability

| Spec §28 | Primary evidence |
|---|---|
| 1–5 | smoke 1–4, A01–A05/A10 |
| 6–9 | smoke 5–8, A06–A09 |
| 10–14 | smoke 9–10, A14–A19 |
| 15–16 | smoke 12, A11 |
| 17–18 | smoke 11 |
| 19–21 | smoke 12/18–20, A12–A13 |
| 22–24 | smoke 13–15, A20–A23 |
| 25–27 | source/config review + suite/audits |

## Known-failure policy

A mandatory failure keeps the milestone open. Fix flaky tests; do not disable
them. A hardware/network-dependent test may use a deterministic harness plus a
separate real smoke test, but the progress board must distinguish the two.


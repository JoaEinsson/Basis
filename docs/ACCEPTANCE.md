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
| A01 | normalize Windows/Linux paths to UTF-8/NFC relative paths using `/` | Rust unit | M1 |
| A02 | reject absolute, drive, UNC, NUL, non-UTF-8, and `..` escaping paths | Rust unit | M1 |
| A03 | manifest/workspace roundtrip and atomic write | Rust unit/integration | M1 |
| A04 | scanner ignores symlinks and isolates an invalid file | Rust integration | M1 |
| A05 | incremental scan does not reparse unchanged size+mtime | Rust integration | M1 |
| A05b | copied roots with one `library_id` use distinct local databases | Rust integration | M1 |
| A05c | metadata normalization/grouping is identical with network disabled | Rust integration | M1 |
| A05d | structured and single-string featured track credits preserve their display metadata but produce one corroborated primary-artist album identity; ambiguous/different-year releases remain separate and an existing rebuildable index is reprojected | Rust integration | M8 correction |
| A06 | free-text/quotes/predicate parser produces AST | Rust unit | M2 |
| A07 | AST compiles parameterized SQL using allowlists | Rust unit/integration | M2 |
| A08 | FTS follows insert/update/delete | Rust integration | M2 |
| A09 | `ViewDefinition` preserves a roundtrip | Rust/TS | M2 |
| A09b | global search groups entities and expands an exact artist match to related albums/tracks with stable ranking tiers | Rust integration | M2 |
| A09c | Back/Forward restores Search/View query, representation, selection, and scroll state | component/integration | M3a |
| A10 | album query isolates an album and orders disc/track | Rust integration | M2 |
| A10b | definitive album/artist routes consume M2 DTOs and restore prior View/search state without a provisional shell | component/integration | M3a |
| A11 | static and smart playlists roundtrip | Rust unit | M5 |
| A12 | DB rebuild recovers portable data/events | Rust integration | M5 |
| A13 | append-only events derive favorite/played state | Rust integration | M5 |
| A14 | theme roundtrip preserves a future token/field | Rust unit | M3b |
| A15 | sparse theme inherits a newly added base token | Rust unit | M3b |
| A16 | old migration preserves unknown metadata | Rust unit | M3b |
| A17 | out-of-range values use a safe fallback | Rust unit | M3b |
| A18 | Paper/Nocturne/Chromatic validate against the schema | Rust/CI | M3b |
| A19 | contrast/onAccent and missing base have fallbacks | unit | M3b |
| A19b | shell/layout components contain no built-in-theme visual values and substantially different theme tokens preserve identical navigation/information architecture | static/component | M3a/M3b |
| A20 | LRC parser selects the line for a timestamp | Rust/TS unit | M6 |
| A20b | automatic queue advance updates transport without navigating away from the user's browsing canvas | component/integration | M4 |
| A21 | lyrics are escaped as text and bounded | component/unit | M6 |
| A22 | updater rejects an invalid signature | integration/manual harness | M7 |
| A23 | LRCLIB/updater failure does not alter library/player | integration | M6/M7 |
| A24 | portable watcher reloads after atomic replacement | integration | M8 |

Add component tests for keyboard/focus behavior in the top toolbar, pinned-View
overflow, SearchView, command palette, navigation restoration, theme editor,
filters, and multiselect. Avoid large snapshots; test behavior.

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
structured featured artists, a malformed single-string trailing `feat.`/`ft.`
credit, ambiguous artist text that must not be split, oversized/rejected
artwork, corrupt file, Unicode path, and an LRC sidecar. Fixtures must not
contain absolute paths or copyrighted music.

## End-to-end smoke test

Run against a disposable copy of a real folder; the app does not expose delete.

1. First launch shows the quiet Library empty state and singular `Add folder`
   native picker, with no hero, marketing copy, feature cards, or success banner.
2. Select a folder containing MP3, FLAC, and M4A; the shell opens during scanning
   and displays progress.
3. Verify title/artist/album/disc/track/duration for a known sample.
   Disable network, add another tagged file, and confirm that normalization and
   grouping remain fully functional without MusicBrainz or another provider.
   Include an album whose track credits mix the primary artist with a trailing
   featured credit: it must remain one album while the full track credit stays
   visible.
4. Navigate to Albums; open the first and confirm that only its tracks appear in
   disc/track order.
5. Run free-text search and every structured example from spec section 7.2.
   Search an exact artist and verify entity-grouped Artist, related Album, and
   Track results even when album titles do not contain the query.
6. Switch grid/list/table, filter, group, and save a custom view.
7. Pin/reorder/hide top-toolbar Views; force overflow, restart, confirm
   persistence, and confirm no permanent left navigation sidebar appears.
8. Open `Ctrl+K` using only the keyboard and navigate to a track/album/action;
   separately open main-canvas SearchView with `Ctrl+F` and `/`.
9. Switch among Paper/Nocturne/Chromatic without a reload.
10. Duplicate a theme, edit several categories, restart, export/import it, and
    confirm that an unknown key inserted into the fixture is preserved.
11. Play an album and verify Now Playing opens; use
    play/pause/seek/volume/next/previous/shuffle/repeat and
    confirm that the queue is separate from the playlist. Repeat playback with
    MP3, FLAC, AAC/M4A, ALAC/M4A, Ogg Vorbis, and WAV; include Opus when
    enabled/stable. Back must restore the exact album/search source. After the
    user browses elsewhere, automatic track advance must not reopen Now Playing.
12. Create/reorder a static and smart playlist; favorite a track and generate a
    played event; restart and check Home/Favorites/Recently Played.
13. For a track without lyrics, query LRCLIB in the responsive Now Playing
    artwork/lyrics canvas, synchronize lines, click to seek, and confirm the
    sidecar. Restart offline and verify it again.
14. Check for updates using valid signed metadata; observe progress/consent.
15. Repeat with an invalid signature and an offline endpoint; the app remains
    usable.
16. Modify/add audio outside the app; the watcher updates without a full rescan.
17. Close the app, copy the library to another absolute path, and open the copy.
18. Verify views, playlists, themes, favorites, and lyrics; no portable file
    references the former root.
19. Confirm that original and copied roots use separate local SQLite/session
    state despite carrying the same portable `library_id`.
20. Delete only the local SQLite database for that copy, reopen, and verify a
    rebuild with no loss of authored data.
21. Build/release validation produces Windows x86_64 NSIS, Linux x86_64 AppImage,
    signatures, and one coherent `latest.json`. Release messaging states that
    Authenticode is not available and does not conflate it with Tauri signing.
22. Run UX01–UX09 from `DESIGN_UX.md`, including three width bands, exact
    Back/Forward state restoration, transport-to-Now-Playing, and the final
    anti-dashboard audit. Repeat the shell with visually divergent theme
    fixtures and verify that radius, elevation, glow, typography, density, and
    motion can change without changing regions, navigation, or content order.

## Definition-of-done traceability

| Spec §28 | Primary evidence |
|---|---|
| 1–5 | smoke 1–4, A01–A05/A10 |
| 6–9 | smoke 5–8/22, A06–A09c |
| 10–14 | smoke 9–10/22, A14–A19b |
| 15–16 | smoke 12, A11 |
| 17–18 | smoke 11/22, A20b |
| 19–21 | smoke 12/18–20, A12–A13 |
| 22–24 | smoke 13–15, A20–A23 |
| 25–27 | source/config review + suite/audits |

## Known-failure policy

A mandatory failure keeps the milestone open. Fix flaky tests; do not disable
them. A hardware/network-dependent test may use a deterministic harness plus a
separate real smoke test, but the progress board must distinguish the two.

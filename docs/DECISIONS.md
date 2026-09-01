# Locked product and engineering decisions

Status: **D01–D69 accepted by the product owner on August 29, 2026; D70–D81
accepted on August 30, 2026; D82–D85 accepted on September 1, 2026**.

These decisions remove implementation freedom where two reasonable choices
would produce incompatible behavior. They override earlier optional/suggested
wording in the specification. A change requires an explicit product decision
recorded here and in `PROGRESS.md`.

## Identity and foundation

| ID | Locked decision |
|---|---|
| D01 | Product/display name: **Basis**. Package/executable: `basis`. Initial version: `0.1.0`. Tauri bundle identifier: `io.github.joaeinsson.basis`. Repository: `https://github.com/JoaEinsson/Basis`. |
| D02 | Product UI, documentation, code identifiers, schemas, events, and user-facing errors are English-only for the MVP. Strings should be centralized, but no i18n framework is added today. |
| D03 | First-class release targets are Windows 10/11 x86_64 through NSIS and Linux x86_64 through AppImage. A `.deb` may be an additional convenience artifact. ARM64 and additional formats are outside the initial cut. The release workflow must build and publish both first-class targets. |
| D04 | Basis supports one active library at a time and keeps a local list of recent roots. It does not merge multiple libraries into one search, view, or queue in the MVP. |
| D05 | A copied library preserves its portable `library_id`. Local state is keyed by `(library_id, root_instance_hash)`, where `root_instance_hash = blake3(canonical_root)`, so two copies opened on one machine never share a SQLite database or session. |
| D06 | Basis is a single-instance desktop application. A local lock keyed by the canonical library root protects portable writes; a second writer is rejected rather than racing. No lock file is synchronized under `.musiclib/`. |
| D07 | An MVP managed library must be writable. Selection performs an atomic write probe under `.musiclib/`; failure produces an actionable error and does not create a partially initialized library. Read-only library mode is backlog. |
| D08 | Portable paths are UTF-8/NFC, preserve filename casing, and serialize with `/`. Reject empty, absolute, drive-prefixed, UNC, NUL-containing, non-UTF-8, and escaping `..` references. Filesystem comparisons follow the host OS semantics. |
| D09 | `track_id` is UUIDv5 with the manifest `library_id` as namespace and the normalized portable relative path as name. No alternative hash algorithm is permitted. |
| D10 | Scan extensions case-insensitively: `.mp3`, `.flac`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.opus`, and `.wav`. Do not scan generic `.mp4`. Do not follow symlinks or enter `.musiclib/`. Do not honor Git ignore files inside a music library. |
| D11 | Preserve structured multi-value artists/genres from tags. Never split display strings heuristically on `/`, `&`, or `feat.`. Store normalized relation tables plus original display values. Normalization is deterministic and offline: trim, collapse whitespace, Unicode NFKC, and Unicode case-fold for comparison keys only. |
| D12 | Missing metadata remains `NULL` in the index. `Unknown Artist`, `Unknown Album`, and similar labels are presentation-only fallbacks and are never persisted as if they were file tags. |
| D13 | Preserve a valid source date string and derive `year` separately. SQLite times are UTC epoch milliseconds; portable event times are RFC 3339 UTC. |
| D14 | Portable view/playlist/theme filenames are `<uuid>.json`; the mutable display name lives inside the document. New authored IDs use UUIDv4. JSON uses two-space pretty printing, LF, and deterministic map ordering. |

## Metadata identity, query, and contracts

| ID | Locked decision |
|---|---|
| D15 | `album_key` is UUIDv5 using `library_id` and `normalized_album_artist + NUL + normalized_album + NUL + year_or_empty`. Normalization affects identity only; display strings remain original. |
| D16 | When album artist is absent, use primary artist only when the relevant tracks agree. Use `Various Artists` when the compilation tag is set. Never infer album artist from folder structure or a network request. |
| D17 | A track with no album becomes its own `Unknown Album` pseudo-entity. Do not combine all album-less tracks into one false album. Network availability never changes this grouping automatically. |
| D18 | Different non-null years produce separate album identities. When tags remain contradictory, Basis separates entities rather than combining potentially different releases. |
| D19 | Query grammar supports quoted strings, implicit whitespace `AND`, explicit case-insensitive `OR`, unary `NOT`/`-`, parentheses, and precedence `NOT > AND > OR`. Unknown field names produce a visible parse error. |
| D20 | Text operators: `eq`, `neq`, `contains`, `in`. Number/date operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`. Boolean operators: `eq`, `neq`. `:` maps to `contains` for text and `eq` for booleans/simple numbers. |
| D21 | Permanent public query fields: `title`, `artist`, `albumArtist`, `album`, `genre`, `composer`, `year`, `track`, `disc`, `duration`, `codec`, `sampleRate`, `bitDepth`, `channels`, `bitrate`, `path`, `addedAt`, `lastPlayed`, `playCount`, and `favorite`. SQL column names are never public query fields. |
| D22 | Query page size defaults to 100 and is capped at 500. Every sort ends with `rel_path` as a deterministic tie-breaker. The command palette returns at most 50 items. |
| D23 | FTS5 uses `unicode61 remove_diacritics 2` and BM25 ranking. Nucleo runs in Rust over a bounded candidate set; the full library is never sent to React for fuzzy ranking. |
| D24 | `groupBy` is a hierarchy with at most three levels. The MVP does not support arbitrary aggregate expressions. Invalid entity/field combinations fail validation. |
| D25 | Rust is the DTO source of truth. Use pinned `tauri-specta` bindings generated into the frontend; generated bindings are never hand-edited. |

## Portable data, migration, and recovery

| ID | Locked decision |
|---|---|
| D26 | A document with a schema newer than the app is never rewritten. The item becomes unavailable/read-only, the app applies a safe fallback where necessary, and library playback/indexing continue. |
| D27 | Invalid authored JSON is left untouched. Skip only the invalid item and show its relative path. Invalid manifest/workspace uses a local last-known-good snapshot or a safe default without silently replacing the source. |
| D28 | Before the first write of a migration, create one `<filename>.bak`. Validate the migrated document before atomic replacement. The MVP never prunes these backups automatically. |
| D29 | All portable writes share one cross-platform Rust atomic-write implementation: temp file in the same directory, validation, flush, sync when supported, and OS-appropriate atomic replace. |
| D30 | Missing static-playlist paths may relink only by normalized title + primary artist + album, duration within ±2 seconds, and equal disc/track when present. There must be exactly one candidate, and the user confirms before the new path is persisted. |
| D31 | Unknown/dangling primary-navigation references are not rendered but are preserved on roundtrip so an older app does not erase future entries. The workspace schema v1 field is still named `sidebar` for compatibility; see D72. |

## Events and history

| ID | Locked decision |
|---|---|
| D32 | Emit `played` on natural completion or after actual listened time reaches `min(50% of duration, 240 seconds)`. Tracks shorter than 30 seconds count only on natural completion. |
| D33 | Emit `skipped` when an explicit user action abandons a track before the played threshold. Store actual listened seconds; seeking does not count as listened time. |
| D34 | Play count is the number of unique `played` event IDs, not the number of playback starts. |
| D35 | `favorite_set` resolves by last-write-wins on `(RFC 3339 UTC timestamp, event UUID)`. The MVP assumes approximately correct device clocks; CRDT conflict resolution remains out of scope. |
| D36 | Events store the portable path plus title, artist, album, and duration hints. Rename recovery follows D30 without rewriting old JSONL events. |
| D37 | `added_at` is local derived state based on first-seen/file time and is not guaranteed to remain identical after a copy or complete DB rebuild. Authored data, favorites, and play history do remain portable. |

## Playback and queue

| ID | Locked decision |
|---|---|
| D38 | Play on an album/view/playlist replaces the queue. `Play next` and `Add to queue` are separate explicit actions. |
| D39 | Shuffle creates a stable shuffled order that preserves current track and history. Disabling shuffle restores canonical order while retaining the current track. It never rerolls every `next`. |
| D40 | Previous restarts the current track when position is greater than five seconds; otherwise it selects the previous queue item. |
| D41 | Repeat `track` repeats the current track; repeat `queue` wraps to the first item; repeat `off` stops after the final item. |
| D42 | Persist queue/position locally on track changes and periodically. Reopening restores the session paused and never autoplays. |
| D43 | UI volume is 0–100 on a perceptual curve and is converted to linear gain before `AudioEngine`. Volume is local device state. |
| D44 | MVP uses the system default output device. If it disappears, retry the new default and emit a recoverable error. Manual device selection is backlog. |
| D45 | Voxio receives a 45-minute integration timebox. If it fails, the single specified fallback is Rodio behind the unchanged `AudioEngine` boundary. |

## Themes

| ID | Locked decision |
|---|---|
| D46 | Persisted custom themes may inherit only from a permanent built-in ID. “Create from any theme” copies the selected custom overrides but persists its ultimate built-in base, eliminating inheritance cycles. |
| D47 | Color values accept only strictly parsed `#RRGGBB`, `#RRGGBBAA`, and `oklch(...)`. Values are parsed and canonically reserialized; arbitrary CSS strings are rejected. |
| D48 | Critical contrast corrections are runtime-only resolved values. Basis never silently rewrites the user's token; the editor shows the warning and resolved correction. |
| D49 | Workspace theme state stores `light_selection`, `dark_selection`, and `follow_system_appearance`. Defaults are Paper and Nocturne; Chromatic may be selected for dark appearance. A single selection field is insufficient. |
| D50 | Import rejects built-in ID collisions. A colliding custom ID imports as a new UUID by default; replacement requires an explicit user action. |
| D51 | Deleting the selected theme atomically falls back to Paper for light or Nocturne for dark and displays a warning. |
| D52 | The versioned token registry owns all ranges. Initial global ranges: density `0.75–1.5`, type scale `0.8–1.4`, blur `0–40px`, opacity `0.4–1`, track row `28–72px`, legacy sidebar dimensions `180–420px`, and motion `0–1000ms`. Components may not invent their own bounds. Legacy sidebar tokens remain compatible data but may not reintroduce a permanent sidebar under D71. |
| D53 | Chromatic extracts a deterministic color from a sanitized thumbnail no larger than 64×64, caches it by artwork key, and modifies only accent/ambient tokens. Transition is 200ms and disabled by reduced motion. |

## Artwork, lyrics, watcher, and network

| ID | Locked decision |
|---|---|
| D54 | Generate 64, 128, 256, and 512px WebP thumbnails. Cache key includes source relative path, mtime, size, and requested dimension. Missing art uses a deterministic gradient derived from album key. |
| D55 | Query LRCLIB only when the lyrics panel is opened or the user explicitly requests lyrics; never prefetch every played track. |
| D56 | An automatic LRCLIB match requires normalized title and artist, duration within ±3 seconds when available, and album as a tie-breaker. Multiple remaining candidates require user selection and are not auto-saved. |
| D57 | Save synchronized lyrics first as `<audio-stem>.lrc` beside the audio. If that directory is not writable, mirror the relative directory under `.musiclib/lyrics/<relative-directory>/<stem>.lrc`. |
| D58 | Display plain lyrics but do not automatically persist them in the MVP. Automatic persistence is limited to synchronized LRC. |
| D59 | Manual lyric timing offset is excluded from the MVP. |
| D60 | LRCLIB and future metadata calls use Rust `reqwest`; the webview performs no direct HTTP. The official updater plugin is the only separate network stack. Default limits are 5-second connect timeout, 15-second total timeout, and 1MiB response body. |
| D61 | Filesystem watcher debounce is 500ms. Coalesce events by normalized path and wait for stable size/mtime before reindexing. A rename is remove+add in the MVP. |
| D62 | **Do not implement Syncthing conflict-file detection, warnings, merging, or policy.** Conflict/versioning behavior belongs to Syncthing configuration and the user's synchronization strategy. Basis simply processes the resulting filesystem state through normal validation and watcher rules. |

## Release and test infrastructure

| ID | Locked decision |
|---|---|
| D63 | MVP has one `stable` release channel using GitHub Releases in `JoaEinsson/Basis` and Tauri static update metadata. No beta/nightly channel and no ignored-version feature initially. |
| D64 | Automatic update interval is exactly 24 hours. Manual checks bypass the interval. |
| D65 | Offer only a strictly greater stable SemVer. Stable builds do not consume prerelease updates and never downgrade. |
| D66 | Tauri updater signatures are mandatory. Windows Authenticode is a separate distribution trust mechanism and is not available initially because there is no paid certificate. Releases must document the resulting SmartScreen warning; they must never imply that Tauri signing provides Authenticode trust. |
| D67 | Updater tests use a disposable key pair whose private key remains outside the repository. It is never reused for production. |
| D68 | GitHub Actions builds Windows x86_64 NSIS and Linux x86_64 AppImage, signs updater artifacts with CI secrets, publishes them to GitHub Releases, and publishes `latest.json` at `https://github.com/JoaEinsson/Basis/releases/latest/download/latest.json`. |
| D69 | Commit short synthetic or CC0 audio samples for every target codec with attribution. Automated tests never depend on a developer's private music library. |

## Interface, navigation, and search

| ID | Locked decision |
|---|---|
| D70 | `docs/DESIGN_UX.md` is the normative interface and interaction contract. It supersedes conflicting shell, navigation, search-presentation, Now Playing, and responsive-layout examples elsewhere without changing the data, portability, Theme Engine, playback, or security contracts. |
| D71 | Basis has no permanent left navigation sidebar. The shell uses a compact top app toolbar, an optional contextual View toolbar, a main canvas, and a persistent bottom transport. Primary navigation consists of user-pinned Views and a compact overflow. |
| D72 | For workspace schema v1 compatibility, `workspace.sidebar` and `pinToSidebar` retain their serialized names but mean the ordered pinned primary-navigation Views. This redesign does not rewrite portable files merely to rename those fields. |
| D73 | Toolbar Search and `Ctrl/Cmd+F` or `/` open the global SearchView in the main canvas. `Ctrl/Cmd+K` remains the accessible fuzzy command palette for entities and actions. Suggestions may assist typing but never replace SearchView. |
| D74 | Main-canvas navigation uses explicit typed states/history entries. Back/Forward restores query, filters, sort, grouping, representation, scroll, and selection where practical. The persistent transport and playback service remain outside the navigation stack. |
| D75 | Global search is entity-aware and relationship-aware. Results are grouped by entity and use appropriate representations; ranking tiers are exact entity, exact metadata/facet, prefix, direct textual/fuzzy, then relational expansion. A search for an artist returns related albums and tracks even when their titles do not contain the query. |
| D76 | A deliberate primary play action opens Now Playing by default; `Play next` and `Add to queue` do not navigate. Automatic track advance or playback updates never change the user's current canvas. Clicking the current track artwork/title in the transport opens Now Playing explicitly. |
| D77 | At widths at least 1200px, use the full toolbar and side-by-side artwork/lyrics where applicable; at 800–1199px, overflow lower-priority navigation and adapt panes; below 800px, recompose controls and stack Now Playing. Queue/Info tools are temporary closable context panes, not permanent navigation. |
| D78 | Empty states are quiet desktop-software states. Cards are reserved for naturally card-like entities. Hero sections, marketing copy, feature/explanation cards, readiness/success banners, permanent dashboard search fields, generic card containers, and decorative SaaS composition are forbidden in normal product flows. |
| D79 | D04 remains unchanged: the MVP has one active library root. The Library empty-state action is singular (`Add folder`) and must not imply merged multi-root search or playback. |
| D80 | Layout owns regions, navigation placement, content hierarchy, pane behavior, responsive recomposition, entity structure, and navigation state transitions. The Theme Engine exclusively owns colors, typography, radii, borders, elevation, shadows, blur/glow, bounded density, artwork treatment, state/selection/lyric/progress styling, and motion timing. Layout components consume semantic tokens and contain no Paper/Nocturne/Chromatic-specific values. Layout review forbids containers/elevation added solely to manufacture hierarchy; it does not prescribe flatness, radius size, shadow amount, glow amount, or another theme aesthetic. |
| D81 | M2 is a headless data/contract milestone: AST, parameterized SQL, FTS, entity and relationship projections, built-in View definitions, and album/artist detail DTOs. It must not create a provisional shell or disposable presentation. M3a is the first complete interface milestone and owns the final top-toolbar shell, GenericView renderers, SearchView, album/artist pages, navigation restoration, responsive structure, and layout-token consumption. M3b owns Theme Engine values/editor/validation; M4 and M6 extend the same shell with transport/Now Playing and lyrics respectively. |
| D82 | The post-MVP UI/UX program is defined by `docs/UI_UX_POLISH_PLAN.md`. Planning does not open M9 and implementation may not begin until the M0-M8 release gate and packaged Arch/KDE smoke test are green. The program adds no backend music feature. |
| D83 | On Windows and Linux, the Basis app toolbar becomes one unified custom window/application toolbar with no duplicate native titlebar. It provides real Minimize, Maximize/Restore, and Close actions, an explicit safe drag region, double-click maximize/restore, actual maximized-state feedback, responsive navigation overflow, keyboard accessibility, and only the minimum Tauri window permissions. macOS is not an initial target. |
| D84 | Nocturne's fixed accent identity changes from violet/indigo to the Signal Cyan family already present in the Basis icon (`#F2FFFC`, `#A5F4E6`, `#49D9C7`, `#20AFC8`, and `#5DE1D0`). The last-known-good dark fallback and Chromatic's no-artwork fallback align with that family. Exact semantic mappings require contrast validation. Paper and user themes remain visually independent, and no layout/feature component may contain brand-color literals or built-in-theme conditionals. |
| D85 | The polish pass uses an expressive, controlled, and tokenized motion language. Interaction and navigation transitions may be visibly animated: directional route changes, shared artwork continuity, spring-like pane/menu/dialog entrances, moving selection indicators, transport-icon morphs or crossfades, track-change choreography, lyric emphasis, and drag/reorder settlement are part of the intended Basis character. Layout owns which transitions express a state change; the Theme Engine owns duration, easing, distance, scale, opacity, and other visual motion values. Native CSS/React remains the first implementation choice; a focused cross-platform motion dependency is permitted only when the P0 audit proves it materially improves reliable shared-element or spring choreography. Nonessential perpetual/idle motion is forbidden, virtualized geometry is not animated, advanced effects require deterministic fallbacks, and OS reduced-motion removes nonessential transforms, shimmer, smooth auto-scroll, staggering, and palette interpolation without hiding state. |

## Metadata normalization and optional online enrichment

Basis indexing and grouping are always local and deterministic under D11, D12,
D16, and D17. Adding music while offline produces the same index model as adding
it while online. A network response must never silently change an album identity,
display metadata, portable path, or audio-file tag.

If metadata enrichment is implemented after the MVP, the selected primary
provider is **MusicBrainz Web Service 2**. It is suitable for artist, recording,
release, and release-group lookup and returns JSON. Provider behavior is locked
as follows:

- opt-in/manual enrichment only; never part of the scanner's required path;
- suggestions are cached locally and shown as a diff before acceptance;
- accepted non-file overrides live under `.musiclib/overrides/`;
- no audio tag writing in the MVP;
- use `Basis/<version> (https://github.com/JoaEinsson/Basis)` as User-Agent;
- globally limit MusicBrainz requests to at most one per second and use bounded
  exponential backoff for HTTP 503;
- never poll MusicBrainz for changes;
- use the Cover Art Archive only after a release MBID has been selected;
- AcoustID/Chromaprint remains backlog because it introduces fingerprinting and
  application registration; it is not needed for tag-based normalization.

MusicBrainz currently permits free non-commercial Web Service use without an API
key but requires a meaningful User-Agent and rate limiting. Commercial
distribution requires a separate terms review before enabling this provider.

Official provider references:

- [MusicBrainz Web Service API](https://musicbrainz.org/doc/MusicBrainz_API)
- [MusicBrainz rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API)
- [AcoustID](https://acoustid.org/)

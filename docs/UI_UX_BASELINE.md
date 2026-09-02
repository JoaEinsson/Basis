# UI/UX polish baseline

Status: **P0 in progress — deterministic browser fixture and first visual audit
completed on September 1, 2026; packaged WebView motion prototypes remain
open.**

This is evidence for `UI_UX_POLISH_PLAN.md`, not a second visual
specification. Product and Theme Engine boundaries remain defined by
`DATA_DRIVEN_MUSIC_PLAYER_SPEC.md`, `DECISIONS.md`, and `DESIGN_UX.md`.

## Deterministic fixture

Development builds can boot the real application shell against a deterministic
fixture without Tauri or a personal music folder:

```text
http://127.0.0.1:1420/?visual-fixture=nocturne-synced#/views/builtin%3Aalbums
```

The fixture is installed before React only when `import.meta.env.DEV` is true.
It uses the official Tauri IPC/event mocks and is omitted from production
builds. Unsupported commands fail loudly so a newly added surface cannot
silently produce a misleading baseline.

Available values are:

| Value | State |
|---|---|
| `nocturne-library` | populated library and active player |
| `nocturne-synced` | synchronized lyrics, including an exceptionally long line |
| `paper-synced` | the same synchronized document in Paper |
| `paper-plain` | plain-text lyrics |
| `paper-instrumental` | explicit instrumental document |
| `paper-lyrics-error` | recoverable lyric-provider failure |

Routes are selected after `#`, so any fixture state can exercise the actual
Home, View, Search, detail, playlist, Now Playing, or Settings route. Fixture
tracks deliberately include featured credits, long titles, several artists,
missing artwork, favorites, and a five-item queue.

## Captured widths and routes

Nocturne library baselines were inspected at 640, 800, 1199, 1200, and 1600
CSS pixels. At each width, the document, toolbar, and main canvas stayed within
the viewport. At 640 px, pinned Views correctly moved out of the toolbar, but
the album grid still retained three narrow columns; its density and minimum
card behavior need explicit P4 treatment rather than an accidental squeeze.

The fixture successfully rendered these real routes without a route-level
error or document overflow at 1200 px:

- Home;
- Albums, Artists, Tracks, Folders, and Genres Views;
- populated entity-aware Search;
- album and artist details;
- playlist index;
- Now Playing;
- Settings.

The queue-open baseline revealed a horizontal scrollbar in the remaining
canvas at 1200 px. The pane currently subtracts usable space without making the
active View controls recompose. P3/P5 must replace that overflow with a
directional, focus-safe pane composition.

## Coverage matrix baseline

| Area | Current baseline | Missing or defective state |
|---|---|---|
| Window and shell | wide and narrow toolbar, history, pinned/overflow Views, application menu | custom titlebar/window controls and native drag behavior are not currently reachable |
| Navigation/search | Search route, Search shortcut structure, command palette, route restoration tests | no directional route/search expansion motion; packaged keyboard traversal still needs manual evidence |
| Library views | Home and all five built-in entity Views; Grid/List/Table and all density controls | representations and densities require stronger distinction; album grid squeezes at 640 px |
| Music entities | album tiles, artist tiles, virtualized track rows, placeholders, long metadata | artwork load/reveal and shared continuity are absent |
| Details/facets | album, artist, folders, and genres populated states | partial-metadata and facet failure baselines still need packaged/manual capture |
| Actions | application menu, View filter/column popovers, track action menu | browser-native `details`, `select`, and range presentation is inconsistent; no shared popover primitive |
| Playback | active player, transport, seek, volume, repeat/shuffle, long title | track-change and icon-state choreography are absent |
| Queue | populated open/closed queue | opening is abrupt, reorder feedback is absent, and open pane causes canvas overflow at 1200 px |
| Now Playing | Nocturne/Paper synchronized, Paper plain, instrumental, lyric error, long line | P1 corrected Paper's lyric hierarchy and prevents an exposed horizontal scroller; Hide Lyrics is not currently reachable; instrumental does not recompose to centered artwork |
| Playlists | deterministic populated static/smart index and editor, including a missing static item, plus existing unit coverage | visual drag insertion state remains open |
| Settings | appearance and updater routes with deterministic theme catalog/policy; Paper/Nocturne cards preview their effective lyric hierarchy | editable custom-theme fixture and destructive confirmation baselines remain open |
| Library setup | existing no-library onboarding browser baseline, choosing/indexing code paths | deterministic scanning and folder-picker failure visual states remain open |
| System feedback | route error, error boundary, inline errors, lyric retry | shared skeleton language is absent; several failures use one-off text states |

No row is silently omitted. A state marked not currently reachable is an
implementation requirement, not a passing baseline.

## Findings ordered by impact

1. **Paper lyrics violate the intended hierarchy.** The resolved Paper theme
   inherits `color.lyrics.active = #f4f5f7` from the dark registry while its
   canvas is `#f7f7f5`. The colors are almost identical. Past and upcoming
   states are also weakened again by `0.62` opacity. P1 must give Paper explicit
   lyric roles and validate effective composited contrast.
2. **Synchronized lyrics can overflow horizontally.** The text itself wraps,
   but `component.lyrics.activeScale = 1.04` expands a full-width line beyond
   the scroller. Both Paper and Nocturne reproduced the scrollbar. P1/P6 must
   preserve emphasis without increasing scrollable width.
3. **Artwork-only composition is missing.** Instrumental content still reserves
   the full lyric column, and there is no Show/Hide Lyrics control. P6/P8 must
   center artwork/metadata temporarily for explicit instrumentals and preserve
   the user's device-local manual preference for later vocal tracks.
4. **The queue is an overlay by appearance but a width subtraction by
   behavior.** At 1200 px, opening it exposes horizontal canvas overflow. It
   also has no spatial entry or focus-return treatment.
5. **The current motion vocabulary is only a generic theme crossfade.** Global
   color/background/border/shadow transitions use `fast`, `normal`, and `ease`;
   lyrics add color/opacity/scale. Route direction, overlays, selection
   indicators, track changes, artwork continuity, pane springs, drag settlement,
   and bounded stagger do not exist yet.
6. **Reduced motion is safe but overly broad.** The current data attribute
   forces every transition and animation duration to zero and disables smooth
   scrolling; Now Playing also checks the OS preference before following a
   lyric. P1 needs semantic reduced treatments rather than a single global
   kill-switch, while retaining an immediate fallback.
7. **Native form primitives are visibly mixed with application primitives.** A
   source inventory found 43 `input`, `select`, `progress`, `details`, or
   `summary` instances. They are valid semantic foundations, but popover,
   select, range, progress, and disclosure appearance/interaction need shared
   P3 primitives and WebView parity checks.
8. **CSS ownership is semantic but concentrated.** Feature components contain
   no brand-color literals; current visual literals live in startup tokens,
   built-in theme data, tests, or the development fixture. However,
   `global.css` is a large shared sheet with menu/dialog/control rules in
   separated sections. P3 should consolidate primitives without moving visual
   values into layout components.

## P1 correction evidence

The P1 implementation keeps the findings above as the historical “before”
record and corrects their shared token/identity portion:

- the canonical registry now owns titlebar, window-control, menu, tooltip,
  pressed, drag-insertion, player, lyric, and expressive motion roles;
- startup fallbacks, Nocturne, and Chromatic's no-artwork fallback use the
  Signal Cyan family without feature-component color literals;
- Paper explicitly defines active, past, upcoming, and translation lyric colors
  plus active scale and inactive opacity; it also explicitly owns every color
  token in the dark-default registry so a newly used surface cannot silently
  inherit Nocturne treatment;
- the CSS-variable boundary removes properties that belonged only to the
  previous resolved theme before applying the next one, preventing sparse-theme
  values from surviving a Paper/Nocturne switch;
- synchronized lyrics expose no horizontal scrollbar; text remains wrapped and
  vertical scrolling remains local to the lyric region;
- the appearance cards preview each resolved theme's active/past/upcoming lyric
  hierarchy, and the editor reports effective contrast after inactive opacity;
- an automated theme-provider test switches Paper, Nocturne, Chromatic, and a
  deliberately divergent custom theme while retaining the same navigation DOM.

At 1200 × 800 CSS pixels, browser inspection measured Paper's effective lyric
states as active `rgb(32, 33, 36)` at opacity `1`, past `rgb(79, 83, 89)` at
`0.82`, and upcoming `rgb(52, 55, 60)` at `0.82`. The lyric scroller reports
`overflow-x: hidden` and `overflow-y: auto`. The Paper and Nocturne appearance
cards resolve different lyric values rather than inheriting one shared visual
treatment.

## Keyboard and reduced-motion baseline

Source/DOM inspection gives a logical top-level order: brand, history,
pinned Views, Search, application overflow, page actions/controls/content, then
player transport and queue. Existing tests cover Ctrl/Cmd+K, Ctrl/Cmd+F,
Space outside editable controls, and history restoration. Closed native
`details` descendants and focus return from queue/dialogs still require
packaged-WebView traversal at every width; a DOM selector list is not accepted
as proof of actual Tab behavior.

The reduced-motion baseline currently:

- changes smooth main-canvas and lyric-follow scrolling to immediate;
- forces CSS transition and animation durations to zero;
- keeps every semantic state visible;
- has no alternative directional, pane, artwork, or drag treatment because
  those normal-motion treatments do not exist yet.

## Before/after targets

| Before | Required after |
|---|---|
| violet/indigo Nocturne and startup accents | theme-owned Signal Cyan identity with corrected contrast |
| native title strip plus application toolbar | one tested custom window/application toolbar |
| generic global crossfade and abrupt structural changes | tokenized directional, spring-like, shared-artwork, playback, lyric, and drag motion with deterministic fallbacks |
| Paper active lyric nearly disappears | readable, editable active/past/upcoming hierarchy after opacity |
| active lyric and open queue can create horizontal scroll | zero unintended horizontal overflow at every supported width/state |
| instrumental keeps an empty lyric column | temporary centered artwork-only composition |
| representation/density changes are subtle | distinct, useful layouts and spacing without changing information hierarchy |

## Remaining P0 gate work

- add scan-progress, picker-failure, editable theme-editor, dialog, and
  destructive-action fixture variants;
- capture actual Tab order and focus restoration in packaged Windows and Arch
  WebViews;
- prototype and profile directional route, shared artwork, pane spring,
  track-change, lyric, and reorder motion in both packaged WebViews;
- use that evidence to make the CSS/React versus focused motion-runtime
  decision.

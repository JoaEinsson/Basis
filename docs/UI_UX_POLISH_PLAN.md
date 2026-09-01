# Basis UI/UX polish plan

Status: **accepted post-MVP product direction on September 1, 2026; planning
only until the M8 release gate is green**.

This document is the execution plan for the first general visual and interaction
polish pass after the MVP. It extends `DESIGN_UX.md`; it does not replace its
navigation, information architecture, responsive composition, portability, or
Theme Engine boundaries. It adds no music-library feature and does not start the
M9 recommendation or word-by-word lyric work.

## Entry condition

Implementation begins only after:

1. the corrected Windows and Linux release workflow passes;
2. the signed AppImage passes the Arch/KDE Wayland smoke test;
3. M0-M8 evidence is current in `PROGRESS.md`.

Planning, token inventory, and reference capture may occur before that gate.
No polish change may be mixed into the release-candidate correction.

## Outcome

Basis should feel like one deliberate desktop music product rather than a set
of individually completed screens. The pass is successful when:

- the Basis mark, window chrome, navigation, library, playback, lyrics, and
  settings share one recognizable visual language;
- Nocturne uses the Signal Cyan family from the Basis icon instead of the
  current violet/indigo accent;
- Windows and Linux use a compact custom titlebar with correct native window
  actions and without a duplicate native title strip;
- every interactive component has coherent rest, hover, focus, pressed,
  selected, disabled, loading, empty, and error behavior where applicable;
- motion communicates state and spatial relationships without delaying input,
  distracting from artwork, or destabilizing virtualized lists;
- the interface remains fully data-driven and substantially restylable by a
  user theme.

The desired character is calm, precise, contemporary, and music-led. It is not
a dashboard, neon sci-fi skin, glass-everywhere treatment, or animation demo.

## Locked direction

### Unified custom window and application toolbar

On the first-class Windows and Linux targets, the existing app toolbar becomes
the custom window titlebar. Basis must not display a native titlebar above a
second branded toolbar.

The unified row contains, from left to right:

1. Basis mark and name;
2. Back and Forward;
3. ordered pinned Views and their overflow;
4. a flexible, explicitly marked window-drag region;
5. indexing status when active;
6. Search and application overflow;
7. Minimize, Maximize/Restore, and Close.

At narrow widths, pinned Views move into overflow before the drag region or
window controls become unusable. The window controls never enter the application
overflow.

Implementation uses Tauri window APIs rather than simulated buttons:

- `decorations: false` for the main Windows/Linux window;
- `getCurrentWindow().minimize()`, `toggleMaximize()`, and `close()`;
- actual maximized-state observation so the icon and accessible label switch
  between Maximize and Restore;
- explicit drag regions or `startDragging()` only on non-interactive space;
- double-click on a drag region toggles maximize/restore;
- the minimum capability set for close, minimize, maximize-state query,
  toggle-maximize, and start-dragging.

Interactive descendants, menus, text fields, sliders, and drag-and-drop handles
must never start a window drag. `Alt+F4`, Windows/Linux keyboard window
shortcuts, edge dragging, maximize/restore, and normal resizing must continue to
work. Basis does not add minimize-to-tray behavior or a close confirmation when
there is no unsaved user edit.

The first release targets do not include macOS. A future macOS port should
prefer native/transparent titlebar integration because fully custom chrome
loses platform window behavior there; this plan does not require a macOS
implementation.

### Signal Cyan identity

The Basis icon already defines the brand family:

```text
signal highlight   #F2FFFC
signal soft        #A5F4E6
signal primary     #49D9C7
signal deep        #20AFC8
rim cyan           #5DE1D0
```

Nocturne and the last-known-good dark startup theme use this family for accent,
focus, selection, active playback, progress, and restrained ambient treatment.
The first implementation target is:

```text
accent primary     #49D9C7
accent hover       #5DE1D0
accent active      #20AFC8
focus highlight    #A5F4E6
on-accent          a corrected near-black from the Basis neutral family
```

Exact muted/selection colors must be derived and contrast-tested before being
locked in the built-in JSON. Purple/violet is removed from Nocturne and from the
Chromatic no-artwork fallback, but remains valid in imported or user-authored
themes. Paper keeps its own light-theme direction. Status colors such as error,
warning, and favorite remain semantically distinct; the whole application must
not become monochrome cyan.

This identity is implemented only through built-in theme data, registry hard
defaults, and semantic aliases. Layout and feature components contain no cyan
literal and no `Nocturne` conditional. The icon remains a trusted brand asset
and is not recolored by arbitrary theme data unless the adaptive mark is used
in a semantic icon role.

### Motion language

Layout owns which state transition occurs. The Theme Engine owns its visual
treatment, duration, easing, distance, scale, opacity, and reduced-motion
behavior. The registry must be extended before components invent motion values.

Use native CSS transitions/animations and React state for this pass. Do not add
a general animation framework or a third-party design system. Add a narrowly
scoped headless dependency only if an audited focus/positioning requirement
cannot be met reliably with the current platform.

Motion principles:

- input feedback is immediate;
- animate compositor-friendly `opacity` and `transform` when possible;
- do not animate virtualized row geometry, application resize, playback time
  updates, or large layout reflows;
- no perpetual glow, floating artwork, bouncing controls, or decorative idle
  motion;
- route motion is subtle enough that repeated Back/Forward remains fast;
- loading motion never suggests progress that is not occurring;
- `prefers-reduced-motion: reduce` removes nonessential transforms, shimmer,
  smooth auto-scroll, and accent interpolation while preserving visible state
  changes.

The default motion vocabulary is:

| Interaction | Normal treatment | Reduced-motion treatment |
|---|---|---|
| Button press | small tokenized press response | color/state change only |
| Menu or tooltip | short fade plus subtle origin motion | immediate visibility |
| Dialog | overlay fade and restrained content entrance | fade or immediate |
| Context/queue pane | directional reveal tied to its edge | immediate reveal |
| Main-canvas navigation | restrained crossfade; no long page slide | immediate swap |
| Album/artwork hover | bounded emphasis without layout movement | state color/focus only |
| Track selection | fast semantic highlight | immediate highlight |
| Playlist reordering | live insertion marker and settled-row transition | insertion marker only |
| Track change | artwork/copy crossfade without moving the canvas | immediate replacement |
| Play/pause/repeat state | icon/state transition | immediate icon replacement |
| Lyrics follow | tokenized smooth centering | immediate positioning |
| Active lyric | tokenized color/weight/scale emphasis | color/weight only |
| Theme/Chromatic accent | bounded palette interpolation | immediate palette update |
| Skeleton | restrained pulse only while genuinely loading | static placeholder |

## Execution order

Each phase is a vertical pass with automated checks, the three responsive width
bands, keyboard inspection, reduced-motion inspection, and Windows/Linux manual
evidence. Do not polish one screen to completion while shared primitives remain
inconsistent elsewhere.

### P0 - Baseline and visual audit

1. Capture deterministic screenshots using one fixture library and Nocturne at
   640, 800, 1199, 1200, and 1600 px.
2. Capture every route, menu, dialog, empty/loading/error state, queue state,
   and Now Playing lyric state.
3. Inventory visual literals, duplicated control CSS, unthemed browser-native
   elements, clipping, overflow, inconsistent alignment, and missing states.
4. Record keyboard order and current behavior under reduced motion.
5. Define a short before/after issue list; screenshots are evidence, not a new
   visual specification.

Gate: every component in the coverage matrix below has a baseline or an
explicit “state not currently reachable” note.

### P1 - Token and identity foundation

1. Expand the canonical registry and CSS-variable aliases before editing
   feature styles. Add missing semantic roles for titlebar/window controls,
   player surfaces and progress, hover/pressed states, overlays, menus,
   tooltips, drag insertion, lyrics, and motion.
2. Add missing `slow` and emphasized/exit motion primitives plus any bounded
   component motion overrides proven necessary by the audit.
3. Change Nocturne and the last-known-good startup values from violet to Signal
   Cyan; update Chromatic's fixed fallback to the same identity family.
4. Keep custom themes sparse and migration-safe. New tokens receive hard
   defaults so old themes remain valid without rewriting.
5. Run automated critical-contrast correction and manual contrast checks for
   text, focus, selection, accent controls, progress, and lyrics.

Gate: switching Paper, Nocturne, Chromatic, and a deliberately divergent test
theme changes all visual values without changing component structure. No
feature CSS contains brand-color literals.

### P2 - Unified window chrome

1. Introduce a dedicated `WindowChrome` component and a small window adapter so
   unit tests and browser previews do not invoke unavailable Tauri APIs.
2. Recompose `AppShell` into the unified custom window/application toolbar;
   remove duplicate native decorations only after controls work in development.
3. Add semantic window-control icons, tooltips, accessible names, hover/focus/
   pressed states, the Close danger state, and maximized/restored state sync.
4. Protect every interactive region from accidental window dragging and keep a
   usable drag target at all supported widths.
5. Add only the required Tauri window permissions.
6. Verify Windows 10/11 and Arch KDE Wayland behavior, including 100%, 125%, and
   150% scale where available.

Gate: the user can drag, edge-snap, double-click maximize/restore, minimize,
maximize, restore, resize, and close from mouse and keyboard without dead zones,
click-through, duplicated titlebars, or inaccessible controls. Windows 11's
native hover Snap Layout flyout is not promised by an undecorated WebView
button; Win+Arrow and edge snapping remain required.

### P3 - Shared interaction primitives

Consolidate existing styles and behavior into small, application-owned
primitives without adopting another design system:

- text button, primary button, icon button, destructive button;
- menu, context menu, tooltip, popover, dialog, and scrim;
- input, search input, select, range, checkbox/toggle where present;
- tabs/segmented controls, representation switcher, filter chip, and badge;
- divider, scroll region, skeleton, progress, inline status, quiet empty state,
  and local error state;
- artwork frame/fallback and entity-row interaction states;
- drag handle, drag preview, insertion marker, and drop target.

Gate: each primitive has keyboard behavior, visible focus, accessible naming,
theme-token styling, reduced-motion behavior, and state tests. Browser default
menus or visibly unrelated form styling do not leak into the product.

### P4 - Shell, navigation, search, and overlays

Polish:

- `AppShell`, pinned Views, overflow, Back/Forward, inline indexing state,
  active search, and application menu;
- `CommandPalette`, focus trapping/restoration, keyboard selection, and result
  emphasis;
- SearchView grouped results, typing/loading/no-results/parse-error states;
- QueuePane entrance, focus, empty/error states, and canvas preservation;
- route transitions and exact scroll/focus restoration.

Gate: the shell remains compact at every width, no permanent sidebar or
dashboard field returns, overlays layer correctly above virtualized content,
and Back/Forward never feels delayed by motion.

### P5 - Library and discovery surfaces

Polish every representation:

- Home and reusable Recently Added/Played/Favorites sections;
- GenericView toolbars, filters, sort/group/density controls, Columns, and
  Grid/List/Table switching;
- AlbumGrid, ArtistGrid, ArtworkPlaceholder, and artwork loading/fallback;
- TrackList virtualization, selection, playing state, row actions, context
  menu, columns, truncation, and density;
- album and artist detail hierarchy, metadata, actions, and partial-data states;
- folder and genre navigation, expansion, breadcrumbs, and empty states;
- multiselect and bulk-action feedback.

Grid, list, and table must be meaningfully distinct. Density must visibly and
consistently affect allowed spacing/row-size tokens. Large libraries must not
lose virtualization or suffer layout animation.

Gate: all entity surfaces pass their populated, empty, loading, partial,
selected, keyboard, responsive, and reduced-motion scenarios with one visual
grammar.

### P6 - Playback, playlists, and lyrics

Polish:

- PlayerBar hierarchy, hit targets, current-track navigation, transport states,
  timeline, buffered/progress treatment, volume, repeat/shuffle, errors, and
  narrow recomposition;
- QueuePane current item, upcoming/history distinction, reorder feedback, and
  empty state;
- playlist index, create/rename dialogs, static/smart detail, action hierarchy,
  drag-and-drop insertion, missing-track treatment, and destructive actions;
- Now Playing artwork, metadata, Back context, loading/playback errors, and
  responsive split/stacked layouts;
- synchronized, plain, unavailable, candidate-choice, manual-scroll, and
  follow-mode lyric states.

Artwork/metadata and lyrics must be independent layout and scroll containers.
Lyrics length must never vertically center or displace the artwork column, and
artwork must never share the lyric scrollbar at wide widths. Narrow stacking
uses the main-canvas scroll deliberately and keeps the transport independent.

Gate: changing track, opening/closing queue, reordering, seeking lyrics, and
switching lyric states remain stable during playback and do not steal canvas
focus.

### P7 - Settings, onboarding, updater, and feedback

Polish:

- quiet library acquisition and change-folder flows;
- Settings section navigation and information hierarchy;
- AppearanceEditor token groups, search, previews, dirty/saved feedback,
  validation, dialogs, import/export, and reset actions;
- UpdatePanel idle/checking/available/downloading/installing/success/error
  states using concise product copy;
- route errors, fatal boundary, local errors, scan progress, and recovery
  actions;
- all confirmations and destructive actions.

Gate: no developer-oriented, redundant, or self-congratulatory copy remains.
Errors state what failed and the available action without explaining unrelated
architecture.

### P8 - System-wide verification and release

1. Run deterministic visual regression for stable component states in Paper and
   Nocturne; use a fixed accent fixture for Chromatic.
2. Run interaction tests for titlebar commands, keyboard menus/dialogs,
   navigation restoration, drag-and-drop, player controls, and reduced motion.
3. Audit contrast, focus order, accessible names, live regions, target sizes,
   zoom, text overflow, localization-resistant sizing, and high-DPI artwork.
4. Scroll large virtualized libraries and lyrics while playing audio; reject
   main-thread stalls, layout thrash, and animation-induced input latency.
5. Repeat manual smoke tests on Windows 10/11 and Arch KDE Wayland using the
   packaged builds, not only Vite/WebView development.
6. Update screenshots and release notes only after the behavior is verified.

Gate: the exit matrix below is green and no visual change weakens playback,
portability, updater signing, or the Query/View Engine.

## Complete component coverage matrix

| Area | Components/surfaces | Mandatory polish focus |
|---|---|---|
| Window and shell | WindowChrome, AppShell, app toolbar, history, pinned Views, overflow | native behavior, drag safety, hierarchy, responsive space, focus |
| Navigation/search | SearchView, CommandPalette, route transitions | keyboard, grouped hierarchy, overlays, restoration, empty/error |
| Library views | Home, GenericView, Grid/List/Table, filters, columns | density, meaningful representations, virtualization, progressive states |
| Music entities | AlbumGrid, ArtistGrid, TrackList, ArtworkPlaceholder | artwork rhythm, metadata hierarchy, selection/playing, truncation |
| Details/facets | AlbumDetail, ArtistDetail, Folders, Genres | page hierarchy, navigation, partial metadata, actions |
| Actions | TrackActionMenu, bulk actions, menus/popovers | positioning, dismissal, keyboard, destructive distinction |
| Playback | PlayerBar, transport, timeline, volume | immediate state, progress clarity, narrow layout, errors |
| Queue | QueuePane | spatial entrance, current/upcoming state, reorder, focus restoration |
| Now Playing | artwork/metadata, lyrics, candidates, follow control | independent scrolling, track change, readable emphasis, recovery |
| Playlists | index/detail, static editor, smart query, dialogs, picker | drag/drop, order, missing tracks, validation, confirmation |
| Settings | Settings, AppearanceEditor, UpdatePanel | grouping, previews, form states, concise copy, destructive actions |
| Library setup | Onboarding/library empty state, folder selection, indexing | quiet hierarchy, progress, actionable failure |
| System feedback | error boundary, route error, inline status, skeletons | local failure containment, accessible announcements, consistency |

For every row, “done” includes pointer, keyboard, touchpad, narrow/wide,
reduced-motion, Paper, Nocturne, a divergent custom theme, loading, empty,
failure, and long-content cases where applicable.

## Acceptance matrix

| ID | Acceptance |
|---|---|
| POL01 | No native titlebar is duplicated above Basis chrome on Windows or Linux. |
| POL02 | Minimize, maximize/restore, close, drag, double-click, resize, edge snap, and keyboard window actions work in packaged builds. |
| POL03 | Nocturne and startup fallback use Signal Cyan with corrected contrast and contain no violet accent residue. |
| POL04 | Source inspection finds no Signal Cyan literal or built-in-theme branch in layout/feature components. |
| POL05 | Paper, Nocturne, Chromatic, and a divergent custom theme preserve identical information architecture and window-control usability. |
| POL06 | Every component in the coverage matrix has applicable interaction and failure states. |
| POL07 | All motion uses registered semantic tokens and reduced motion removes nonessential animation. |
| POL08 | Grid/List/Table and Compact/Comfortable/Spacious are visually and behaviorally distinct where supported. |
| POL09 | Menus, dialogs, tooltips, and context panes position and dismiss correctly above virtualized/scrolled content. |
| POL10 | Playlist and queue drag-and-drop show a live insertion target, preserve order, and have keyboard alternatives. |
| POL11 | Now Playing artwork and lyrics use independent wide-layout scroll containers and stable narrow recomposition. |
| POL12 | No polish change introduces a permanent sidebar, dashboard composition, generic cards, or nonessential chrome. |
| POL13 | Automated visual/interaction/contrast checks and packaged Windows/Arch manual smoke tests pass. |

## Implementation discipline

- Work in the phase order above; shared tokens and primitives precede route
  polish.
- Keep commits reviewable by phase or coherent component family.
- Do not mix backend feature additions into this program.
- Preserve all user-authored themes and portable data; built-in changes require
  no portable rewrite.
- Prefer behavior tests over broad snapshots. Visual snapshots use deterministic
  fixtures and never replace keyboard/manual testing.
- A polish regression in playback, navigation, persistence, accessibility, or
  release behavior blocks the phase rather than becoming backlog.

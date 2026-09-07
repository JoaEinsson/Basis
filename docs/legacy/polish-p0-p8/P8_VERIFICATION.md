# P8 system verification

Status: **automated and browser verification passed on September 5, 2026;
final packaged-update smoke remains open**.

This record separates deterministic evidence from checks that require a signed,
installed release. A development fixture or source inspection is not accepted
as proof of native window behavior, audio continuity, or updater replacement.

## Deterministic matrix

| Acceptance | Result | Evidence |
|---|---|---|
| POL01-POL02 | Partial | `WindowChrome.test.tsx` covers command routing and maximize synchronization. The product owner accepted the packaged Windows chrome on September 2 and the packaged Arch/KDE application on September 5. Repeat the complete native window-action matrix with the final P8 artifacts. |
| POL03-POL05 | Pass | `ThemeProvider.test.tsx`, `cssVariables.test.ts`, and `primitivesCss.test.ts` verify theme isolation and the semantic-token boundary. Paper, Nocturne, and the fixed-accent Chromatic fixture preserve one DOM/information structure. |
| POL06 | Pass | All 23 frontend suites pass, covering 77 interaction, state, fallback, and presentation tests. |
| POL07 | Pass | The OS reduced-motion test verifies the complete document mode. Now Playing tests cover both animation completion and interruption while the underlying lyric action remains immediate. |
| POL08 | Pass | `GenericView.test.tsx` verifies distinct density and Grid/List/Table representations. |
| POL09 | Pass | Primitive, shell, and TrackList tests cover focus, Escape dismissal, menus, dialogs, popovers, and virtualized context actions. Browser inspection also verified application-menu and command-palette stacking. |
| POL10 | Pass | Queue and playlist suites verify protected drag payloads, live insertion state, persisted order, announcements, and keyboard alternatives. |
| POL11-POL12 | Pass | Now Playing uses independent wide regions and stable narrow recomposition. Browser inspection found no page-level horizontal overflow. The shell retains its compact top toolbar and has no permanent sidebar. |
| POL13 | Partial | Automated, browser, and prior packaged observations pass. The final P8 artifacts still require the packaged matrix below. |
| POL14 | Pass | `Shell.test.tsx` verifies Back restoration, focus restoration, Search separation, and automatic playback without canvas navigation. |
| POL15 | Pass | Collection artwork keeps its stable fallback until decode; detail and Now Playing heroes request 512 px thumbnails while dense collection surfaces remain at 256 px. |
| POL16 | Pass | Shell, Player, Queue, Playlist, and Now Playing tests verify immediate actions and coordinated state; animation interruption does not defer visibility. |
| POL17 | Partial | Virtualization and bounded-stagger contracts are present and interaction tests pass. Final real-library scroll/audio observation remains part of the packaged matrix because synthetic timing is not evidence of WebView/audio scheduling. |
| POL18 | Pass | Effective Paper contrast measured against `rgb(247, 247, 245)`: active 15.01:1, past 4.61:1, and upcoming 6.50:1. The editor's contrast tests use the same opacity-aware rule. |
| POL19 | Pass | At 1440, 1000, and 720 CSS px, the long synchronized fixture wrapped, the longest line did not exceed its content width, and document `scrollWidth` equaled `clientWidth`. Plain, synchronized, candidate/error, and instrumental tests remain distinct. |
| POL20 | Pass | Manual Show/Hide persists device-locally. An instrumental result temporarily centers artwork, and a subsequent vocal track restores the prior manual lyric mode. |
| POL21 | Partial | Release validation rejects versioned AppImage names and updater-manifest tests require `Basis.AppImage` plus its signature. The workflow signs the post-processed artifact and generates metadata from the final assets. The installed older-to-new Arch update remains open. |
| POL22 | Pass | Rust metadata and real query regressions verify featured-credit coalescing without rewriting display credits or merging ambiguous/different-year releases. |

Browser inspection used the deterministic Paper, Nocturne, Chromatic, plain,
instrumental, and provider-error fixtures. All visible interactive controls in
the inspected Now Playing states measured at least 24 by 24 CSS pixels. Reload
after the matrix added no warning or error to the development fixture console.

## Final packaged matrix

The following checks must use artifacts produced from the P8 commit:

- Windows 10/11: launch, titlebar drag/double-click/minimize/maximize/restore/
  close, edge snap, resize, keyboard menus/dialogs, audio during library and
  lyric scrolling, queue/playlist drag and keyboard reorder, and updater check.
- Arch KDE Wayland: the same interaction/audio pass, including a large real
  library. A slower cold database projection on the reported i3-6006U/4 GB
  machine is an observation, not a failure, unless input/audio stalls or the
  WebKit process becomes unresponsive.
- Arch updater: install an older signed release through the explicit per-user
  integration, update to the P8 release, relaunch, and verify the desktop entry,
  stable `Basis.AppImage` path, icon, executable permission, and user data.
- Release assets: confirm exactly one `Basis.AppImage`, one
  `Basis.AppImage.sig`, the Windows updater pair, and a validated `latest.json`.

Screenshots and release notes are intentionally deferred until this packaged
matrix is complete.

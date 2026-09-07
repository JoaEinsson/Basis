# Basis roadmap

Baseline: 0.3.1, after MVP M0–M8 and polish P0–P8.
Status: planned; no feature work is started by this document.

The next program improves everyday playback, lyrics, and desktop integration
without sacrificing local-first behavior or responsiveness on modest hardware.
Audit existing code/tests first: an item already complete needs verification,
not a replacement subsystem. Current evidence and outstanding release checks
belong in [STATUS.md](STATUS.md).

## Sequence

The V1.1–V1.5 labels below identify roadmap cycles, **not release versions**.
They do not imply a jump to application 1.x. Choose an actual SemVer when a
verified release cut is ready; do not bump versions just for this roadmap.

### V1.1 — Startup performance and reliability

First implementation priority.

- Measure cold/warm launch, time to responsive shell and usable library,
  database open/query/projection work, peak memory, and UI stalls separately.
- Use the reported Arch/KDE i3-6006U with 4 GB RAM as a real validation target;
  distinguish app work, disk pressure, and WebView/platform behavior.
- Render the shell and restored paused session early; load collection data
  progressively. Avoid redundant full scans, full-library transfers, and renders.
- Keep progress/error/retry states usable during indexing and recovery.
- Preserve incremental watcher updates, durable state, and audio continuity.

Exit: reproducible before/after results with hardware, library size, and build
recorded; measurement-based budgets agreed before optimization; input and audio
remain usable during startup/scan/scroll. Test cold and warm starts, missing
folders, rebuildable SQLite, and failure recovery. No invented timing claims
from a browser fixture or a different machine.

### V1.2 — Player and operating-system controls

Depends on the responsive startup baseline.

- Audit and complete Linux MPRIS and Windows SMTC: playback state, title,
  artist, artwork, transport/media keys, and seek where the platform supports it.
- Recover cleanly from suspend/resume and default-output-device changes.
- Complete mute behavior and queue actions: clear upcoming, save as playlist,
  and consistent session restoration, reusing existing implementations.
- Ensure external controls and in-app controls use the same playback state.

Exit: native Windows and Arch/KDE tests cover controls while the window is
unfocused, paused restoration without autoplay, track changes, suspend/resume,
device loss, and queue semantics without duplicate commands or stale metadata.

### V1.3 — Lyrics 2

Depends on reliable playback position and track identity.

- Complete manual candidate search/selection and persist the selected source
  with recording identity; build on existing candidate review rather than replace it.
- Add a per-track synchronization offset with reset and clear feedback.
- Define durable storage/migration for user lyric choices and offsets, separate
  from disposable provider cache and without rewriting audio files.
- Add bounded next-track prefetch only with explicit network behavior/settings,
  cancellation, cache limits, and no whole-library fetching. Record its scoped
  change to D55 before implementation.
- Keep synchronized/plain/instrumental/missing/error states distinct. Preserve
  conservative automatic matching and enable deliberate user correction.

Exit: regression matrix spans original/live/acoustic/remix recordings, differing
release tags, durations, malformed LRC, offline/cache behavior, track-switch races,
and preference survival after restart/index rebuild. No song-specific production
branches. Document the scoped extension of D59 for offsets before implementation.
Translations, word-level timing, and additional providers require separate
feasibility/licensing decisions; they are not promised in this cycle.

### V1.4 — Everyday desktop use

Builds on V1.2; lyric-aware presentation uses V1.3 where relevant.

- Mini-player with accessible controls and reliable window-state persistence.
- Sleep timer with cancel/remaining-time feedback and no surprise autoplay.
- Expose useful listening history and configurable resume behavior, keeping
  default startup paused and portable history semantics intact.
- Configurable shortcuts with conflict handling; current-track navigation to
  album, artist, and folder through existing navigation states.
- Optional notifications and explicit file/folder opening/association flows.
  OS registration must remain user-controlled and reversible.

Exit: keyboard-only operation, narrow/normal layouts, multiple monitors,
restart persistence, timer completion/cancel, and platform entry points pass
without stealing focus or changing the active library implicitly.

### V1.5 — Audio controls

Depends on V1.1/V1.2 measurements and device recovery.

- Explicit output-device selection with safe fallback when a device disappears.
- ReplayGain track/album modes with clipping protection and defined behavior
  for missing/invalid tags; no destructive loudness normalization of files.
- Optional crossfade, with a documented relationship to gapless playback.
- Evaluate a modest equalizer/DSP path behind the existing audio abstraction;
  ship only with bounded CPU/memory use and a transparent bypass mode.

Exit: format/device matrix, transitions, volume/clipping behavior, bypass,
and continuous playback under load pass on Windows and the modest Linux target.
No claims of exclusive or bit-perfect output without independent verification.

## Outside this program

Streaming services, accounts/cloud sync, recommendation radio, automatic online
metadata rewriting, and a new audio architecture are not part of these cycles.
MusicBrainz enrichment remains a separate opt-in proposal. Historical M9/backlog
items do not automatically enter this roadmap.

## Delivery rules

Each cycle is a bounded set of usable vertical slices, with empty/error states,
proportional automated tests, and native evidence where needed. Keep existing
playback, library portability, themes, lyrics, and signed updates working.
An external smoke-test blocker stays explicit while independent work proceeds.
Do not publish a release as fully verified while its required native checks are open.

After each cycle, update STATUS and implemented ARCHITECTURE details; archive
closed evidence rather than growing a perpetual execution diary. Do not create
a new plan document for every small fix.

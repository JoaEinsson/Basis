# Current product contract

Published baseline: Basis 0.3.1; next source release candidate: 0.4.0. This is
the active summary, not a new specification or permission to implement every
roadmap item.

## Authority and scope

Explicit product-owner decisions take precedence. This contract governs current
work; [DESIGN_UX.md](DESIGN_UX.md) governs interface structure and interaction.
[ROADMAP.md](ROADMAP.md) supplies future sequencing, not evidence of delivery.
[STATUS.md](STATUS.md) separates implemented work from verification still open.

The original [specification](legacy/mvp/DATA_DRIVEN_MUSIC_PLAYER_SPEC.md) and
[D01–D90 decisions](legacy/history/DECISIONS_MVP.md) retain detailed data and
behavior contracts unless explicitly superseded. Read the relevant section when
changing that domain, not the entire archive on every task. Archived milestone
instructions and obsolete status statements are not the current execution plan.
A future feature that changes a locked behavior needs its scoped decision recorded
here before implementation; listing it in the roadmap does not silently change it.

## Data, library, and safety

- The user chooses one active music folder. Never move, rename, delete, or retag
  audio. Multiple recent roots do not imply a merged library.
- Metadata is the semantic center; folders are one navigation dimension.
  Identity, normalization, scanning, and album grouping are offline and deterministic.
- `.musiclib/` contains durable, portable authored state and normalized relative
  paths using `/`. SQLite, caches, machine settings, and the transient queue live
  in app-data. Rebuilding SQLite must preserve authored data.
- Validate paths and all external metadata, artwork, lyrics, playlists, and
  themes. Reject traversal and unsupported schemas safely. Do not overwrite
  invalid/newer portable data. Portable writes are validated and atomic.
- Preserve original track credits. Album grouping prefers album-artist metadata;
  the narrow, corroborated featured-credit normalization in D89 changes identity
  projection only. Do not split arbitrary `/` or `&` credits or merge ambiguous releases.
- Use one Query/View Engine with parameterized SQL and field/operator allowlists.
  Centralize typed commands/events. Paginate/virtualize large collections and
  keep scanning off the UI thread; one corrupt file must not abort the library.
- No telemetry, cloud-account requirement, or Syncthing-specific conflict policy.
  Any future online metadata enrichment is opt-in, outside the scanner, and
  requires explicit acceptance of suggestions. No silent network-driven identity changes.

## Playback, lyrics, and interface

- Queue is not playlist. Preserve canonical order, shuffle history, repeat
  semantics, and paused local session restoration; startup never autoplays.
  Preserve the `AudioEngine` boundary. Do not claim gapless/native behavior from mocks.
- Primary navigation is pinned Views in the compact top toolbar, never a
  permanent left sidebar. Search is an entity-aware main-canvas state distinct
  from the command palette. Back/Forward restores navigation; automatic playback
  never steals canvas focus.
- Layout owns structure and transitions. The Theme Engine owns all visual
  treatment through semantic tokens, including motion. Themes are sparse,
  non-executable JSON, with no CSS/JS/HTML or remote URLs.
- Keep Paper, Nocturne, and custom themes independent. Preserve accessible
  effective contrast, keyboard operation, reduced-motion behavior, and responsive
  recomposition. Expressive animation must not block actions or audio, animate
  virtualized geometry, or run perpetually without purpose.
- Lyrics wrap without horizontal scrolling. Artwork and lyric regions scroll
  independently where appropriate. Manual hiding centers artwork; explicit
  instrumental results temporarily do so without overwriting the preference.
  Missing/error lyrics are not instrumental.
- LRCLIB retrieval, semantic evaluation, and selection remain separate. Prefer
  valid synchronized lyrics for the correct recording, not merely the first
  result. Live/remix/acoustic mismatches must not win on availability. Keep safe
  plaintext and review/error states; do not hardcode individual songs.
- D55 is narrowly extended for V1.3: an explicit device-local setting may
  prefetch only the next item in the active queue. It is disabled by default,
  cancels/discards stale targets, uses a bounded disposable app-data cache, and
  never walks the library or writes an automatic choice into portable state.
- D59 is narrowly extended for V1.3: a user may store a bounded per-recording
  line-timing offset with reset. Manual LRCLIB selections and offsets are
  portable authored data under `.musiclib`; provider responses remain an
  app-data cache. Neither operation rewrites an audio file or weakens automatic
  recording matching. New providers remain separately scoped.

## Identity and distribution

- Basis; executable `basis`; application ID `io.github.joaeinsson.basis`;
  repository `JoaEinsson/Basis`; Apache-2.0. The interface remains English-only.
- Supported release targets are Windows x86_64 and Linux x86_64. AMD64 also
  supports Intel x86-64 processors; it is not an AMD-only build.
- Preserve signed stable-channel updates, strictly newer stable SemVer checks,
  and signature verification. Never log/commit production private keys or bypass
  verification. Tauri signatures are not Windows Authenticode.
- Final Linux updater assets are `Basis.AppImage` and `Basis.AppImage.sig`.
  Versioning stays in release tags, application metadata, and update manifests.
  Desktop integration is explicit, per-user, and XDG-compliant, not an automatic
  side effect of launching an AppImage. Preserve its stable path through updates.
- Follow [RELEASE_AND_SIGNING.md](RELEASE_AND_SIGNING.md) for supported bundles,
  validation, signing, publication, and native smoke tests.

## V1.2 scoped decisions (2026-09-07)

V1.1 is deferred, not a prerequisite for V1.2. Preserve the user's confirmed
paused suspension behavior. Output loss must pause playback and require explicit
Play rather than resume unexpectedly on another output (scoped extension to D44).
Mute preserves the selected volume and persists locally. Clearing upcoming items
preserves current playback and history. Native media commands share PlayerService
and never navigate/focus the app. Saving the displayed queue, including repeats,
as a named independent playlist is optional only if existing code makes it small.

## Documentation maintenance

Keep this contract and STATUS concise. ARCHITECTURE describes the implemented
system, not speculative scaffolding. ROADMAP contains only active/future cycles.
Move closed-cycle evidence into a named archive, retain unresolved checks in
STATUS, and update links when moving documents. Never delete historical evidence
or treat an archived checklist as an instruction to restart a finished milestone.

# Current status

Updated: 2026-09-24. Published baseline: `v0.3.1`. The `v0.4.0` tag exists,
but its quality job failed on RUSTSEC-2026-0285; no `v0.4.0` release exists.

## Delivered baseline

- MVP M0–M8 is complete; the user accepted library indexing, playback, lyrics,
  synchronization behavior, and the packaged Arch application in prior work.
- P0–P8 polish implementation is present. This does not imply every final
  packaged verification item was completed.
- Historical automated/browser P8 evidence is preserved in
  [P8_VERIFICATION.md](legacy/polish-p0-p8/P8_VERIFICATION.md), including 77
  frontend tests and the presentation/interaction matrix. These are historical
  results, not tests rerun during this documentation change.

## Outstanding native evidence

Do not infer completion from the general user acceptance above.

- Final P8 artifacts: complete Windows and Arch/KDE native window, keyboard,
  resize/scale, queue/playlist reorder, lyric scrolling, and continuous-audio matrix.
- Real large-library performance on the i3-6006U/4 GB Arch/KDE machine;
  slow startup was reported but its cost breakdown is not yet measured.
- Installed older-to-new signed Arch update through explicit desktop integration:
  preserve `Basis.AppImage` path, executable permission, desktop entry, icon,
  relaunch behavior, and user data.
- Final release-asset verification and release screenshots/notes associated
  with that packaged matrix. A repository tag alone is not publication evidence.

Use the archived [packaged matrix](legacy/polish-p0-p8/P8_VERIFICATION.md#final-packaged-matrix)
and current [release runbook](RELEASE_AND_SIGNING.md) to collect evidence.
Native hardware and installed signed artifacts are needed for these checks;
browser fixtures and unit tests cannot substitute for them.

## Current task and next work

V1.1 performance work is deferred: the reported slow reference machine has an
old HDD, and the product owner chose not to open an optimization program without
evidence of a general product problem.

V1.2 source implementation is ready for native smoke testing:

- Linux MPRIS and Windows SMTC use the same PlayerService as in-app controls for
  play, pause/toggle, stop, previous/next, bounded seek, and volume on MPRIS;
- system metadata carries title, artist, album, duration, position, and a bounded
  local artwork cache with Basis fallback;
- WebView media-key listeners were removed to prevent double dispatch;
- mute persists separately from the selected volume;
- output loss or successful rebind pauses and requires explicit Play;
- Clear upcoming retains history/current playback; Save as playlist reuses the
  static-playlist flow and preserves displayed order and repeated tracks;
- Ubuntu release jobs install the DBus development dependency required by MPRIS.

Evidence on 2026-09-08: 23 frontend suites/81 tests passed; Rust all-targets
passed with 65 library tests, 2 hardware tests ignored, and the updater-signature
integration test; production frontend build, TypeScript, ESLint, Clippy with
warnings denied, release configuration/manifest tests, `git diff --check`, and
RustSec audit passed. RustSec reported the same 18 explicitly allowed upstream
warnings and no new blocking vulnerability. Browser inspection verified the mute
state, queue actions, playlist dialog, retained current item after clearing, and
no console warning/error. Version remains 0.3.1 and no release was published.

Open V1.2 evidence: on packaged Windows, verify SMTC metadata/artwork and every
media key while unfocused; on packaged Arch/KDE, verify MPRIS using the panel and
`playerctl`; on both, disconnect/change the default output while playing, confirm
it remains paused at the preserved position, then press Play and confirm recovery.
Also repeat restart mute persistence and queue/playlist actions with real audio.

V1.3 source implementation is ready for packaged/live-provider smoke testing:

- Now Playing can search LRCLIB with editable recording metadata, review every
  result deliberately, choose a source, and return to automatic matching;
- the chosen provider identity and safe lyric document live under the relative
  track path in portable `.musiclib` data and survive a local index-ID rebuild;
- synchronized lyrics have per-track ±15-second timing adjustment in 500 ms
  steps with reset, persistent feedback, highlighting, and timestamp seeking;
- optional next-track prefetch is explicit, disabled by default, active only
  during playback, limited to one play-order target, and cancels/discards stale
  queue targets;
- provider cache is disposable app-data bounded to 64 entries/8 MiB; opening
  prefetched synchronized lyrics promotes it through the existing local LRC path;
- automatic original/live/acoustic/remix matching remains conservative and no
  song-specific production branch was added.

V1.3 evidence on 2026-09-09: 25 frontend suites/86 tests passed; Rust all-targets
passed with 73 library tests, 2 hardware tests ignored, and the updater-signature
integration test. TypeScript, ESLint, Prettier, production build, Clippy with
warnings denied, release configuration/manifest tests, and `git diff --check`
passed. The remaining manual gate is a packaged online/offline LRCLIB smoke:
choose a nonautomatic version, adjust timing, restart/reindex, confirm offline
reuse, then enable prefetch and rapidly change/reorder the next queue item.

The next release uses `0.4.0` because it adds player and lyrics features since
`0.3.1`; `0.3.2` would describe a fixes-only release. The three manifests and
the Basis entry in Cargo.lock have been aligned. On 2026-09-24,
`cargo metadata --locked --offline`, release configuration validation with
`GITHUB_REF_NAME=v0.4.0`, the five updater-manifest tests, Prettier, and
`git diff --check` passed. On 2026-09-24, the failed release audit traced
RUSTSEC-2026-0285 to rustls 0.23.43 through reqwest and the Tauri updater.
Updating only rustls to 0.23.45 in Cargo.lock made `cargo audit` pass with
eight pre-existing allowed warnings; 73 Rust library tests, the updater
signature test, and Clippy with warnings denied passed. The corrected lockfile
must be committed and included in the tag before re-running the release
workflow. Packaged V1.2/V1.3 checks follow the generated release artifacts.

Keep this file as a current snapshot: replace stale entries, add concrete
commands/results to completed checks, and archive closed-cycle detail. Never
store credentials, private keys, or personal library data here.

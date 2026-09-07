# Current status

Updated: 2026-09-07. Repository baseline: tag `v0.3.1`.

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

Documentation reorganization: historical documents moved unchanged to
[legacy](legacy/README.md); active contracts, roadmap, and task-reading guidance
replace the mandatory full-history reading list. No application feature,
dependency, release workflow, or version is changed by this task.

Verification for this documentation-only change: all eight moved files retained
their SHA-256 hashes; 37 local file links across nine active/index documents
resolved; `git diff --check` passed. Application tests were not rerun because
runtime code was unchanged.

Next implementation priority: [V1.1 startup performance and reliability](ROADMAP.md#v11--startup-performance-and-reliability).
V1.1–V1.5 are planned, not implemented by the documentation approval.

Keep this file as a current snapshot: replace stale entries, add concrete
commands/results to completed checks, and archive closed-cycle detail. Never
store credentials, private keys, or personal library data here.

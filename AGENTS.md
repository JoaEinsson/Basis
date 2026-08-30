# Agent execution contract

## Mission

Implement the MVP described in `DATA_DRIVEN_MUSIC_PLAYER_SPEC.md` end to end. Do
not stop at scaffolding, visual prototypes, pseudocode, or reports of unfinished
work. Make reasonable decisions, validate every milestone, and continue until
the definition of done is satisfied or a genuine external blocker exists.

## Required reading before changing code

1. `DATA_DRIVEN_MUSIC_PLAYER_SPEC.md`.
2. `docs/DECISIONS.md`.
3. `docs/TODAY_PLAN.md`.
4. `docs/ARCHITECTURE.md`.
5. `docs/ACCEPTANCE.md`.
6. `docs/PROGRESS.md`.
7. `docs/RELEASE_AND_SIGNING.md` before M7.

The specification is the canonical product source. `docs/DECISIONS.md` resolves
its optional or ambiguous choices and records explicit product-owner overrides.
The remaining documents convert both into an execution order; they do not reduce
requirements except where a later explicit decision says so.

## Non-negotiable rules

- The library is the folder chosen by the user. Do not move or rename audio.
- `.musiclib/` stores only durable/portable state and relative paths using `/`.
  Machine state, caches, the transient queue, and SQLite belong in app-data.
- SQLite must be deletable and rebuildable without losing user-authored data.
- Metadata is the semantic center. Folders are only one navigation dimension.
- Queue is not playlist.
- Library pages use the same Query/View Engine; avoid separate subsystems for
  Albums, Artists, Genres, or Folders.
- Themes are sparse JSON and non-executable data. Theme files may not contain
  CSS/JS/HTML/remote URLs; components consume semantic variables.
- LRCLIB, the portable theme editor, and the signed updater are mandatory MVP.
- Basis is English-only for the MVP and uses the locked identity/release targets
  in `docs/DECISIONS.md`.
- Metadata normalization, identity, scanning, and grouping are deterministic and
  offline. MusicBrainz is a future opt-in provider, not part of the scan path.
- Do not implement Syncthing-specific conflict detection, warnings, merging, or
  policy; synchronization behavior belongs to the user's Syncthing setup.
- No telemetry and no destructive operations on music files.
- Metadata, artwork, lyrics, playlists, and themes are untrusted input.
- Never disable signature verification to make the updater “work.”
- Do not start M9 while any M0–M8 gate remains open.

## Autonomous work cycle

1. Read `docs/PROGRESS.md` and inspect the repository; do not assume the board is
   accurate without comparing it with the code and tests.
2. Select the first incomplete gate in `docs/TODAY_PLAN.md`.
3. Implement a usable vertical slice, including its error and empty states.
4. Run checks proportional to the change. Fix failures before proceeding.
5. Run the gate's manual test when it involves desktop behavior, audio, files,
   network access, or persistence that a unit test cannot demonstrate.
6. Update `docs/PROGRESS.md` with checkboxes and concrete evidence: a command,
   test, file, or observed result.
7. Continue immediately to the next item. Do not ask for confirmation between
   milestones and do not stop merely to suggest “next steps.”

## When a decision is not explicit

Apply these priorities in order:

1. preserve data and security;
2. preserve the portable/rebuildable model;
3. deliver the simplest complete flow;
4. choose a mature, modest dependency;
5. record the decision in `docs/PROGRESS.md` if it affects architecture or scope.

Ask the user only when the answer requires credentials, a key, hardware, an
external service, data absent from the repository, or a choice that materially
changes the product. While an external blocker is open, continue all work that
does not depend on it.

## Timebox policy

- Voxio integration: spend at most 45 minutes on Voxio-specific friction. If it
  does not produce stable audio in the target environment, preserve
  `AudioEngine` and replace the adapter with Rodio or Symphonia+CPAL. Record the
  reason and evidence.
- Do not polish an isolated component while a mandatory end-to-end flow still
  does not work.
- Optional features are outside the cut. Do not “prepare architecture” for
  non-goals beyond the abstractions explicitly required.

## Minimum quality for every change

- New code contains no `TODO`, `unimplemented!`, permanent mock, or empty handler
  in a core flow.
- A failure in one file does not crash the entire scan, library, or player.
- Portable writes are atomic and validated before replacing the target file.
- Queries use parameters and field/operator allowlists; never concatenate user
  values into SQL.
- Long lists are paginated/virtualized; scanning does not block the UI.
- Types/DTOs are centralized; do not scatter command/event strings.
- Preserve pre-existing changes and do not delete data to “unblock” a test.

## Permitted final report

Declare the MVP done only when `docs/PROGRESS.md` shows M0–M8 green and the
matrix in `docs/ACCEPTANCE.md` has evidence. If an external blocker remains,
report exactly what is ready, the minimum external action required, and how to
repeat the verification afterward; do not call the MVP complete.

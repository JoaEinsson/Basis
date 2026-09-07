# Agent execution contract

## Scope and required reading

Work on the user's current authorized task. The MVP and P0–P8 implementation
are historical baselines, not instructions to restart their milestones.

Before changing code, read:
1. `docs/PRODUCT_CONTRACT.md`.
2. `docs/STATUS.md`.
3. The relevant cycle in `docs/ROADMAP.md`.

Then read the applicable domain reference: `docs/ARCHITECTURE.md` for system/data
changes, `docs/DESIGN_UX.md` for interface work, and
`docs/RELEASE_AND_SIGNING.md` for packaging/updater/release work.
Inspect code and tests before trusting a status statement.

Do not load all of `docs/legacy/` by default. Consult its index and read only
the relevant original specification/decision/evidence section when the active
summary does not settle a detail. Archived contracts remain binding unless
explicitly superseded; archived execution orders and status are historical.
A roadmap is planned scope, not authorization to implement every cycle.

## Invariants

- Never move, rename, delete, or retag the user's audio.
- One active user-chosen library; metadata is its semantic center.
- Durable portable state and slash-normalized relative paths belong in
  `.musiclib/`; SQLite, caches, transient queue, and machine state in app-data.
  Rebuilding SQLite must not lose authored data.
- Queue is not playlist. Library screens share the Query/View Engine.
- No permanent left sidebar. Search and command palette remain distinct.
  Automatic playback must not steal navigation focus.
- Layout owns structure/transitions; themes own visual values through semantic
  tokens. Themes are sparse non-executable JSON; no theme literals in layout.
- Keep normalization/grouping offline and deterministic. No required metadata
  network path, telemetry, or Syncthing-specific conflict policy.
- Treat metadata, artwork, lyrics, playlists, and themes as untrusted input.
- Preserve signed updater verification; never expose or commit private keys.
- Preserve English UI and locked identity/platform targets.
- Follow PRODUCT_CONTRACT and the relevant detailed historical decisions;
  omission from this short list does not waive a requirement.

## Work and verification

1. Inspect the repository and preserve pre-existing changes.
2. Implement the authorized vertical slice, including empty/error states.
3. Run proportional checks and fix failures before advancing within that scope.
4. Verify native behavior with desktop/audio/files/network/persistence tests
   when unit tests cannot prove it. Never claim native success from mocks.
5. Update STATUS with concrete evidence, remaining checks, and the next priority.
   Update ARCHITECTURE only for implemented changes. Record scoped product
   decisions in PRODUCT_CONTRACT before changing locked behavior.
6. Report completion honestly; identify the minimum external action and
   repeatable verification for hardware/credentials/other external blockers.

Keep STATUS compact, replacing stale entries rather than appending a perpetual
diary. Archive closed-cycle evidence and fix references, but carry unresolved
checks forward. Do not create speculative subsystems or implement unrelated
roadmap work merely because one check is blocked.

## Minimum quality and decisions

- No TODO, unimplemented core flow, permanent mock, or empty core handler.
- One bad file must not crash the scan/library/player.
- Portable writes are atomic and validated; preserve invalid/newer input safely.
- SQL uses parameters and field/operator allowlists.
- Long collections are paginated/virtualized; scanning never blocks the UI.
- DTOs and command/event strings are centralized.
- Never delete data to unblock a test or disable security to pass a release.

When unspecified, prioritize data/security, portability/rebuildability, the
simplest complete flow, then mature modest dependencies. Ask for decisions
that materially change scope or require unavailable credentials/data/hardware.
Continue independent authorized work while an external check is blocked.

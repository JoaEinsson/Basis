# Basis

A data-driven desktop player for local music. The music folder is the durable
library; SQLite is only a rebuildable index; portable views, playlists, themes,
and events live under `.musiclib/`.

This repository starts from the product specification. Implementation must be
driven by the following documents, in this order:

1. [`DATA_DRIVEN_MUSIC_PLAYER_SPEC.md`](DATA_DRIVEN_MUSIC_PLAYER_SPEC.md) — the
   canonical source of requirements and the definition of done.
2. [`AGENTS.md`](AGENTS.md) — the operating contract for agents/LLMs.
3. [`docs/DECISIONS.md`](docs/DECISIONS.md) — locked product and engineering
   decisions accepted by the product owner.
4. [`docs/DESIGN_UX.md`](docs/DESIGN_UX.md) — the normative application-shell,
   navigation, search, Now Playing, responsive, and visual-composition contract.
5. [`docs/TODAY_PLAN.md`](docs/TODAY_PLAN.md) — the executable sequence, gates,
   and exit criteria for each milestone.
6. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — resolved technical decisions
   that prevent implementation forks.
7. [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) — the test and smoke-test matrix.
8. [`docs/PROGRESS.md`](docs/PROGRESS.md) — live status, evidence, and blockers.
9. [`docs/RELEASE_AND_SIGNING.md`](docs/RELEASE_AND_SIGNING.md) — Tauri updater,
   signing, and release workflow.

## Completion rule

“Done” does not mean merely compiling or displaying a UI. It means that all 27
criteria in section 28 of the specification have been demonstrated, quality
checks pass, and no core flow relies on a mock, `TODO`, or in-memory-only
persistence.

## Today's scope

The target cut is the MVP described by M0–M8. M9 and the local-recommendation
section are stretch work and must not consume time before the entire primary
path works.

## Release validation

The stable signed-updater path is tag-driven. Run `pnpm run release:validate`
and `pnpm run release:test` before creating a tag that exactly matches the app
version. Maintainer secret setup, local signed-build instructions, the Windows
SmartScreen disclosure, and the draft-to-public GitHub release flow are
documented in [`docs/RELEASE_AND_SIGNING.md`](docs/RELEASE_AND_SIGNING.md).

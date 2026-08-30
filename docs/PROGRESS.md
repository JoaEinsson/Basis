# Execution board

Update this file during development. Every `[x]` must have evidence under “Latest
verification.” Do not erase blocker history: mark blockers resolved and record
the resolution.

## Milestones

- [ ] M0 — bootstrap and command roundtrip
- [ ] M1 — library, metadata, artwork, and rebuildable index
- [ ] M2 — query/FTS/View Engine and album/artist detail
- [ ] M3a — UX, navigation, views, and command palette
- [ ] M3b — Theme Engine, built-ins, and portable editor
- [ ] M4 — playback and queue
- [ ] M5 — playlists, events, and Home
- [ ] M6 — LRC/LRCLIB and offline reuse
- [ ] M7 — signed updater and release path
- [ ] M8 — watcher, security, integration, and final build

## Current gate

`M0 — not started`

Next concrete action: create the Tauri 2/React/TypeScript scaffold at the
repository root without removing the specification or documentation, then prove
a Rust -> React invoke.

## Verification

- [ ] frontend format
- [ ] frontend lint
- [ ] frontend typecheck
- [ ] frontend tests
- [ ] frontend production build
- [ ] rustfmt
- [ ] clippy `-D warnings`
- [ ] cargo tests
- [ ] cargo audit
- [ ] pnpm production audit
- [ ] Tauri release build
- [ ] end-to-end smoke test
- [ ] copy-to-another-root + DB-rebuild smoke test
- [ ] valid updater and invalid-signature tests

## Latest verification

Not run yet: the repository contains only the specification and documentation.

Format for new entries:

```text
YYYY-MM-DD HH:mm TZ — <gate/command>
Result: PASS | FAIL | BLOCKED
Evidence: <objective summary, relevant test/file/log>
```

## Decisions made during implementation

| Date | Decision | Reason/evidence | Impact |
|---|---|---|---|
| — | — | — | — |

## External blockers

None recorded. Production signing credentials and secrets are not required to
write/test the integration, but they are required to publish a real release.
Never record a secret value here.

## Debt outside the cut

Only M9/non-goal items may appear here. An incomplete M0–M8 requirement is not
“debt”; it is an open gate.


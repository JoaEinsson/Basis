# Release and signed updater

This flow is part of the MVP. It separates what can be proven locally from what
requires production infrastructure/secrets without creating a security bypass.

## Contract

- Use the official `tauri-plugin-updater` in Rust and its corresponding frontend
  API.
- Sign Windows and Linux artifacts through the Tauri v2 mechanism.
- Bundle the public key in the app configuration.
- Keep the private key only in the CI/release secret store.
- Use a configurable HTTPS endpoint compatible with static metadata/GitHub
  Releases.
- No silent downgrade, manual execution of downloaded files, or unsigned
  fallback.
- Provide a manual check in Settings/About and an asynchronous automatic check
  no more than once every 24 hours.
- Download/install only after explicit consent; expose progress and errors.
- Store updater preferences in app-data, never under `.musiclib/`.

## Expected files

Names may follow the generated scaffold, but responsibilities must remain clear:

```text
src-tauri/tauri.conf.json                 # updater, public key, production endpoints
src-tauri/capabilities/default.json       # minimum plugin permissions
src-tauri/src/updater/...                 # local policy/state when needed
src/components/settings/UpdatePanel.tsx  # check/consent/progress/error
.github/workflows/release.yml             # Windows/Linux matrix + signing
scripts/ or package scripts               # repeatable local validation
```

## Secrets and variables

Use the names recognized by the installed Tauri version. They normally include:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Confirm the names against the documentation/API for the pinned version before
creating the workflow. The public key is not secret. The private key, password,
key-file contents, and release tokens:

- never enter Git, fixtures, logs, or the bundle;
- are never written under `.musiclib/`;
- are masked in CI;
- are not passed as process arguments when an environment alternative exists.

Add local key patterns to `.gitignore`, but do not rely on `.gitignore` alone.

## Production flow

1. CI triggers from a version tag consistent with `tauri.conf`/package/Cargo.
2. Clean jobs install Node/pnpm/Rust and use frozen lockfiles.
3. Run lint, typecheck, tests, clippy, and audit gates.
4. A build matrix creates Windows and Linux bundles.
5. The signer reads the private key from the secret store and signs each
   artifact.
6. The workflow publishes artifacts, signatures, and updater metadata for the
   same version.
7. Metadata references HTTPS only and includes the signature required by the
   plugin.
8. A job/harness validates metadata shape and the presence of every target
   before publishing or promoting the release.

Never print the complete environment in a release job.

## Controlled test without the production secret

A disposable key pair dedicated to testing may be generated, with its private
key kept outside the repository and artifacts. The test build points to a
controlled HTTPS endpoint/stub and contains only the disposable public key.

Mandatory cases:

1. higher version + matching artifact + signature: update is offered;
2. artifact modified after signing: rejected;
3. missing signature/signature from another key: rejected;
4. same/lower version: no downgrade is offered;
5. timeout/DNS/invalid HTTP: non-fatal error state;
6. close/reopen within 24 hours: automatic check does not repeat;
7. manual check ignores the interval and runs on demand;
8. download starts only after consent, and relaunch occurs through the permitted
   plugin/process mechanism, not through an arbitrary shell.

Record only IDs/versions/results, never key material.

## Definition of release-ready

- local host build passes with the updater enabled;
- workflow contains Windows and Linux and uses lockfiles;
- production configuration has no HTTP endpoint or signature bypass;
- valid and negative tests have evidence in `PROGRESS.md`;
- update failure was tested during playback and did not interrupt audio;
- README/release notes explain which secrets a maintainer must configure and how
  to create a release tag, without including real values.


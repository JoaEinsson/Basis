# Release and signed updater

This flow is part of the MVP. It separates what can be proven locally from what
requires production infrastructure/secrets without creating a security bypass.

Locked release identity:

```text
Product                 Basis
Package                 basis
Bundle identifier       io.github.joaeinsson.basis
Repository              https://github.com/JoaEinsson/Basis
Channel                 stable
Windows artifact        NSIS x86_64 (Windows 10/11)
Linux artifact          Basis.AppImage (x86_64; stable versionless filename)
Updater metadata        https://github.com/JoaEinsson/Basis/releases/latest/download/latest.json
Initial version         0.1.0
```

## Contract

- Use the official `tauri-plugin-updater` in Rust and its corresponding frontend
  API.
- Sign Windows NSIS and Linux AppImage updater artifacts through the Tauri v2
  mechanism.
- Publish the final Linux payload and signature as exactly `Basis.AppImage` and
  `Basis.AppImage.sig`. Keep the version in the app, tag, release, and updater
  metadata rather than in the AppImage filename.
- Bundle the public key in the app configuration.
- Keep the private key only in the CI/release secret store.
- Use the locked GitHub Releases HTTPS endpoint above in production while
  allowing a controlled endpoint override in test builds.
- No silent downgrade, manual execution of downloaded files, or unsigned
  fallback.
- Provide a manual check in Settings/About and an asynchronous automatic check
  no more than once every 24 hours.
- Download/install only after explicit consent; expose progress and errors.
- Store updater preferences in app-data, never under `.musiclib/`.
- Tauri updater signing is mandatory but does not provide Windows Authenticode
  trust. No Authenticode certificate is currently available; release notes must
  disclose the likely SmartScreen warning instead of implying the installer is
  publisher-signed.

## Expected files

Names may follow the generated scaffold, but responsibilities must remain clear:

```text
src-tauri/tauri.conf.json                 # Basis ID, updater, public key, endpoint
src-tauri/capabilities/default.json       # minimum plugin permissions
src-tauri/src/updater/...                 # local policy/state when needed
src/components/settings/UpdatePanel.tsx  # check/consent/progress/error
.github/workflows/release.yml             # NSIS/AppImage matrix + signing/release
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

The production updater key pair was generated with Tauri CLI 2.10.1. Its
public half is embedded in `src-tauri/tauri.conf.json`; its private half remains
outside this repository on the release machine. Back up that private key in a
secure offline location before the first public release. Losing it prevents
existing installations from trusting future updates; rotating it requires a
carefully staged update signed by the old key.

Configure these GitHub repository secrets before pushing the first release tag:

```text
TAURI_SIGNING_PRIVATE_KEY           complete private-key file contents
TAURI_SIGNING_PRIVATE_KEY_PASSWORD  password used when the key was generated
```

The current key was generated without a password, so the password secret may
be absent/empty. Never paste either value into a workflow file, command-line
argument, issue, release note, or CI log.

## Production flow

1. CI triggers from a stable `v<semver>` tag consistent with
   `tauri.conf`/package/Cargo; prerelease tags are not promoted to `latest.json`.
2. Clean jobs install Node/pnpm/Rust and use frozen lockfiles.
3. Run lint, typecheck, tests, clippy, and audit gates.
4. A build matrix creates Windows x86_64 NSIS and Linux x86_64 AppImage bundles;
   `.deb` may be published as a non-updater convenience artifact.
5. The signer reads the private key from the secret store and signs each
   artifact. The final post-processed Linux payload is renamed to
   `Basis.AppImage` before signing, producing `Basis.AppImage.sig`.
6. Matrix jobs upload artifacts, signatures, and `latest.json` to the same
   draft `JoaEinsson/Basis` GitHub Release.
7. A final job downloads `latest.json`, requires both Windows and Linux signed
   targets, and only then promotes the draft to a public stable release.
8. Metadata references HTTPS only and includes the signature required by the
   plugin.
9. If any build or metadata validation fails, the release remains a recoverable
   draft instead of becoming a partial public update.

Never print the complete environment in a release job.

The workflow uses the repository-provided `GITHUB_TOKEN` for release publication.
No paid Windows certificate secret is configured initially. If Authenticode is
added later, it is a separate reviewed change and does not replace the Tauri
updater key.

## Maintainer commands

Before tagging, align the version in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`, commit the change, then run:

```powershell
pnpm install --frozen-lockfile
pnpm run release:validate
pnpm run release:test
pnpm run lint
pnpm run typecheck
pnpm run test
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

Create exactly the matching stable tag and push it:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The tag is the only release trigger. `release:validate` rejects a tag whose
version differs from the three project manifests. The workflow leaves the
release as a draft until the cross-platform `latest.json` passes validation.

For a local signed Windows packaging check, point Tauri at the private key
outside the repository for that shell only, run `pnpm tauri:build:windows`, and
remove the signing environment variables afterward. Do not copy the key into
the workspace. Linux AppImage production packaging is performed by the clean
Ubuntu workflow job.

## Linux AppImage compatibility gate

The Linux build uses the PNG icon set generated from
`assets/brand/basis-icon-signal.svg`; release validation checks the required
32, 64, 128, 256, and 512 pixel RGBA inputs before packaging. After the Ubuntu
job builds the AppImage, `scripts/repack-appimage.sh` extracts it, removes every
bundled `libwayland-*` ABI library, and rebuilds it with appimagetool 1.9.1
verified against its published SHA-256. The original Tauri-selected AppImage
runtime is preserved. Because rebuilding changes the payload, CI discards the
original updater signature and signs the final AppImage again.

`scripts/validate-appimage.sh` then verifies that the desktop entry resolves to
a packaged icon, the Basis executable has no unresolved libraries on the build
host, and the final bundle does not carry EGL/GLES or Wayland ABI libraries.
Those graphics-stack libraries must come from the host. This prevents a known
class of `WebKitWebProcess` `EGL_BAD_PARAMETER` failures caused by mixing an
AppImage's display libraries with a rolling distribution's Mesa/Wayland stack.
The final release job downloads the post-processed AppImage and Windows NSIS
installer, cryptographically verifies both detached signatures against the
public key embedded in Basis, regenerates `latest.json` from those exact assets,
and only then publishes the draft.

The release workflow must accept exactly one Linux updater payload named
`Basis.AppImage` and its adjacent `Basis.AppImage.sig`; a filename containing
the application version fails release validation. GitHub release tags and the
URL namespace still distinguish versions, so different releases may safely
reuse the same asset filename. The updater manifest points at the stable asset
inside the selected tag rather than deriving identity from a versioned local
filename.

Ubuntu 22.04 does not provide a reliable `minisign` package in the runner's APT
sources. `scripts/install-minisign.sh` therefore downloads the official
Minisign 0.12 x86_64 archive over TLS and verifies its pinned SHA-256 before
installing the verifier into `RUNNER_TEMP`. Do not replace this with an
unpinned latest-release lookup or remove artifact verification when a runner
package is unavailable.

Do not add `LD_PRELOAD`, blanket environment overrides, or copied host graphics
libraries as a release workaround. Before the first stable Linux publication,
run the release-candidate AppImage directly on Arch Linux with KDE/Wayland and
record: launch without `LD_PRELOAD`, audio playback, signed update from the
previous version, relaunch into the new version, preserved app-data, and a
second launch from the KDE application menu. When the optional post-MVP desktop
integration is present, install to `~/.local/bin/Basis.AppImage` (or an explicit
stable alternative), write `basis.desktop` and the icon through XDG user paths,
then prove the desktop entry still resolves after the signed update. Direct
AppImage launch never silently installs those files. The clean Ubuntu build and bundle
inspection are deterministic CI gates; the Arch/KDE compositor smoke remains a
real-host release check because GitHub's Ubuntu runner cannot prove it.

## Controlled signature test

`fixtures/updater/latest.json`, its tiny payload, and detached signature are a
non-secret controlled fixture signed by the same updater identity configured in
the app. `src-tauri/tests/updater_signature.rs` decodes the manifest signature,
accepts the original payload, and proves that a one-byte modification is
rejected. The private key is not needed to run this regression and is not in
the repository. `pnpm run release:test` separately validates manifest version,
platform, HTTPS URL, and required-signature structure.

Mandatory cases:

1. higher version + matching artifact + signature: update is offered;
2. artifact modified after signing: rejected;
3. missing signature/signature from another key: rejected;
4. same/lower version: no downgrade is offered;
   stable builds also ignore prerelease versions;
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
- `latest.json` is available from the locked GitHub Releases URL and references
  the NSIS/AppImage artifacts for the same stable version;
- the Linux release contains exactly `Basis.AppImage` and
  `Basis.AppImage.sig`, and any enabled XDG/KDE integration survives a signed
  update without changing its executable path;
- valid and negative tests have evidence in `PROGRESS.md`;
- update failure was tested during playback and did not interrupt audio;
- README/release notes explain which secrets a maintainer must configure and how
  to create a release tag, without including real values;
- release notes distinguish mandatory Tauri updater signatures from the absent
  Authenticode publisher signature and mention the expected SmartScreen warning.

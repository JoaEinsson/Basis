#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: scripts/verify-updater-signatures.sh [asset-directory]" >&2
  exit 2
fi

asset_dir="$(realpath "${1:-.}")"
minisign_command="${MINISIGN_BIN:-minisign}"
if ! command -v "$minisign_command" >/dev/null 2>&1; then
  echo "Minisign is unavailable; run scripts/install-minisign.sh first." >&2
  exit 1
fi
mapfile -d '' appimages < <(
  find "$asset_dir" -maxdepth 1 -type f -name '*.AppImage' -print0
)
mapfile -d '' nsis_installers < <(
  find "$asset_dir" -maxdepth 1 -type f -name '*-setup.exe' -print0
)
if [[ ${#appimages[@]} -ne 1 || ${#nsis_installers[@]} -ne 1 ]]; then
  echo "Expected exactly one AppImage and one NSIS updater." >&2
  exit 1
fi
artifacts=("${appimages[0]}" "${nsis_installers[0]}")

work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
node -e \
  'const c=require("./src-tauri/tauri.conf.json"); process.stdout.write(c.plugins.updater.pubkey)' \
  | base64 --decode >"$work_dir/updater.pub"

for artifact in "${artifacts[@]}"; do
  signature="$artifact.sig"
  if [[ ! -s "$signature" ]]; then
    echo "Missing updater signature for $(basename "$artifact")." >&2
    exit 1
  fi
  decoded_signature="$work_dir/$(basename "$artifact").minisig"
  base64 --decode <"$signature" >"$decoded_signature"
  "$minisign_command" -Vm "$artifact" -p "$work_dir/updater.pub" \
    -x "$decoded_signature" -q
done

echo "Both updater artifacts match the public key embedded in Basis."

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: scripts/repack-appimage.sh [AppImage]" >&2
  exit 2
fi

if [[ $# -eq 1 ]]; then
  appimage="$(realpath "$1")"
else
  shopt -s nullglob
  artifacts=(src-tauri/target/release/bundle/appimage/*.AppImage)
  if [[ ${#artifacts[@]} -ne 1 ]]; then
    echo "Expected exactly one Basis AppImage, found ${#artifacts[@]}." >&2
    exit 1
  fi
  appimage="$(realpath "${artifacts[0]}")"
fi

if [[ ! -f "$appimage" ]]; then
  echo "AppImage not found: $appimage" >&2
  exit 1
fi

chmod +x "$appimage"
work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
(
  cd "$work_dir"
  "$appimage" --appimage-extract >/dev/null
)
appdir="$work_dir/squashfs-root"

mapfile -d '' wayland_libraries < <(
  find "$appdir/usr/lib" -maxdepth 1 \( -type f -o -type l \) \
    -name 'libwayland-*.so*' -print0
)
if [[ ${#wayland_libraries[@]} -eq 0 ]]; then
  echo "The AppImage does not bundle Wayland ABI libraries; no repack was needed."
  exit 0
fi

echo "Removing bundled Wayland ABI libraries:"
printf '  %s\n' "${wayland_libraries[@]##*/}"
rm -f -- "${wayland_libraries[@]}"

# Preserve the runtime Tauri selected while replacing only the SquashFS
# payload. This avoids a second unpinned runtime download during repacking.
runtime_size="$("$appimage" --appimage-offset)"
if [[ ! "$runtime_size" =~ ^[0-9]+$ ]] || [[ "$runtime_size" -le 0 ]]; then
  echo "Could not determine the original AppImage runtime size." >&2
  exit 1
fi
dd if="$appimage" of="$work_dir/runtime" bs=1 count="$runtime_size" status=none

appimagetool="$work_dir/appimagetool-x86_64.AppImage"
curl --proto '=https' --tlsv1.2 -fsSL \
  "https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage" \
  -o "$appimagetool"
echo "ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0  $appimagetool" \
  | sha256sum -c -
chmod +x "$appimagetool"

output="$work_dir/$(basename "$appimage")"
unset SOURCE_DATE_EPOCH
ARCH=x86_64 "$appimagetool" --appimage-extract-and-run \
  --runtime-file "$work_dir/runtime" "$appdir" "$output"
mv -- "$output" "$appimage"
chmod +x "$appimage"

echo "Repacked $(basename "$appimage") without bundled Wayland ABI libraries."

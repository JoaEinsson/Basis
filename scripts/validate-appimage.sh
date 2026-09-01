#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: scripts/validate-appimage.sh [AppImage]" >&2
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
chmod +x "$appimage"
extract_dir="$(mktemp -d)"
trap 'rm -rf -- "$extract_dir"' EXIT
(
  cd "$extract_dir"
  "$appimage" --appimage-extract >/dev/null
)
appdir="$extract_dir/squashfs-root"

desktop_files=("$appdir"/*.desktop)
if [[ ${#desktop_files[@]} -ne 1 ]]; then
  echo "The AppImage must contain exactly one desktop entry." >&2
  exit 1
fi
icon_name="$(sed -n 's/^Icon=//p' "${desktop_files[0]}" | head -n 1)"
if [[ -z "$icon_name" ]]; then
  echo "The AppImage desktop entry has no Icon value." >&2
  exit 1
fi
if ! find "$appdir" -type f \( -iname "$icon_name.png" -o -iname "$icon_name.svg" \) -print -quit | grep -q .; then
  echo "The AppImage does not contain the icon referenced by its desktop entry." >&2
  exit 1
fi

main_binary="$appdir/usr/bin/basis"
if [[ ! -x "$main_binary" ]]; then
  echo "The extracted Basis executable is missing." >&2
  exit 1
fi
if ldd "$main_binary" | grep -q 'not found'; then
  echo "The AppImage executable has unresolved libraries on the build host." >&2
  ldd "$main_binary" >&2
  exit 1
fi

# EGL, GLES, and Wayland ABI libraries must come from the host graphics stack.
# Bundling them can produce WebKitWebProcess EGL_BAD_PARAMETER failures on
# rolling Linux distributions such as Arch/KDE Wayland.
mapfile -t graphics_libraries < <(find "$appdir" \( -type f -o -type l \) \( \
  -name 'libEGL.so*' -o \
  -name 'libGLES.so*' -o \
  -name 'libwayland-*.so*' \
\) -print)
if [[ ${#graphics_libraries[@]} -gt 0 ]]; then
  echo "The AppImage unexpectedly bundles host graphics-stack libraries." >&2
  printf '  %s\n' "${graphics_libraries[@]#$appdir/}" >&2
  exit 1
fi

echo "Validated $(basename "$appimage"): desktop icon, executable, and graphics-library boundary."

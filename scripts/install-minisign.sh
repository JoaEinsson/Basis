#!/usr/bin/env bash
set -euo pipefail

if [[ $# -gt 1 ]]; then
  echo "Usage: scripts/install-minisign.sh [install-directory]" >&2
  exit 2
fi

case "$(uname -m)" in
  x86_64 | amd64) archive_arch="x86_64" ;;
  *)
    echo "The pinned Minisign verifier supports only the x86_64 release runner." >&2
    exit 1
    ;;
esac

install_dir="${1:-${RUNNER_TEMP:-/tmp}/basis-tools}"
mkdir -p -- "$install_dir"
install_dir="$(realpath "$install_dir")"

version="0.12"
archive_name="minisign-${version}-linux.tar.gz"
archive_url="https://github.com/jedisct1/minisign/releases/download/${version}/${archive_name}"
archive_sha256="9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73"

work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
archive="$work_dir/$archive_name"

curl --proto '=https' --tlsv1.2 -fsSL "$archive_url" -o "$archive"
echo "$archive_sha256  $archive" | sha256sum -c -
tar --no-same-owner -xzf "$archive" -C "$work_dir"

source_binary="$work_dir/minisign-linux/$archive_arch/minisign"
if [[ ! -f "$source_binary" ]]; then
  echo "The official Minisign archive did not contain the expected binary." >&2
  exit 1
fi

install -m 0755 "$source_binary" "$install_dir/minisign"
"$install_dir/minisign" -v
echo "Installed pinned Minisign ${version} at $install_dir/minisign."

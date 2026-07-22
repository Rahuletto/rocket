#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
manifest="$root/src-tauri/Cargo.toml"
target="${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV | sed -n 's/^host: //p')}"

# Tauri externalBin requires this exact target-suffixed source filename. For a
# cross build, install the Rust target first and set TAURI_ENV_TARGET_TRIPLE.
cargo build --manifest-path "$manifest" --release --bin rocket-workspace-mcp --target "$target"
mkdir -p "$root/src-tauri/binaries"
extension=""; [[ "$target" == *windows* ]] && extension=".exe"
cp "$root/src-tauri/target/$target/release/rocket-workspace-mcp$extension" \
  "$root/src-tauri/binaries/rocket-workspace-mcp-$target$extension"
echo "prepared rocket-workspace-mcp for $target"

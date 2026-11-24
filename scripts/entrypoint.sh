#!/bin/sh
set -eu
# Railway mounts volumes as root; drop privileges before running Node.
DATA_DIR="/app/data"
UPLOAD_DIR="/app/uploads"
if [ -n "${VIEWLY_DATA_DIR:-}" ]; then DATA_DIR="${VIEWLY_DATA_DIR:-}"; fi
if [ -n "${VIEWLY_UPLOAD_DIR:-}" ]; then UPLOAD_DIR="${VIEWLY_UPLOAD_DIR:-}"; fi
case "$DATA_DIR" in /*) ;; *) echo "VIEWLY_DATA_DIR must be absolute" >&2; exit 1;; esac
case "$UPLOAD_DIR" in /*) ;; *) echo "VIEWLY_UPLOAD_DIR must be absolute" >&2; exit 1;; esac
# Fail closed instead of silently creating an ephemeral database on Railway.
if [ "${VIEWLY_REQUIRE_PERSISTENT_STORAGE:-false}" = "true" ]; then
 VOLUME_PATH="${RAILWAY_VOLUME_MOUNT_PATH:-}"
 if [ -z "$VOLUME_PATH" ] || [ ! -d "$VOLUME_PATH" ] || ! awk -v p="$VOLUME_PATH" '$5 == p {found=1} END {exit !found}' /proc/self/mountinfo; then
  echo "VIEWLY persistent volume is required but not mounted; refusing startup" >&2
  exit 1
 fi
 for dir in "$DATA_DIR" "$UPLOAD_DIR"; do
  case "$dir" in "$VOLUME_PATH"/*) ;; *) echo "VIEWLY storage path is outside the mounted volume" >&2; exit 1;; esac
  case "$dir" in */../*|*/..|*/./*|*/.) echo "VIEWLY storage path must be canonical" >&2; exit 1;; esac
 done
fi
if [ -n "${RAILWAY_VOLUME_MOUNT_PATH:-}" ] && [ -d "${RAILWAY_VOLUME_MOUNT_PATH:-}" ]; then
 chown node:node "${RAILWAY_VOLUME_MOUNT_PATH:-}"
 chmod 700 "${RAILWAY_VOLUME_MOUNT_PATH:-}"
fi
mkdir -p "$DATA_DIR" "$UPLOAD_DIR"
chown -R node:node "$DATA_DIR" "$UPLOAD_DIR"
chmod 700 "$DATA_DIR" "$UPLOAD_DIR"
exec gosu node "$@"

#!/bin/sh
set -eu
# Railway mounts volumes as root; drop privileges before running Node.
DATA_DIR="/app/data"
UPLOAD_DIR="/app/uploads"
if [ -n "$VIEWLY_DATA_DIR" ]; then DATA_DIR="$VIEWLY_DATA_DIR"; fi
if [ -n "$VIEWLY_UPLOAD_DIR" ]; then UPLOAD_DIR="$VIEWLY_UPLOAD_DIR"; fi
case "$DATA_DIR" in /*) ;; *) echo "VIEWLY_DATA_DIR must be absolute" >&2; exit 1;; esac
case "$UPLOAD_DIR" in /*) ;; *) echo "VIEWLY_UPLOAD_DIR must be absolute" >&2; exit 1;; esac
if [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ] && [ -d "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
 chown node:node "$RAILWAY_VOLUME_MOUNT_PATH"
 chmod 700 "$RAILWAY_VOLUME_MOUNT_PATH"
fi
mkdir -p "$DATA_DIR" "$UPLOAD_DIR"
chown -R node:node "$DATA_DIR" "$UPLOAD_DIR"
chmod 700 "$DATA_DIR" "$UPLOAD_DIR"
exec gosu node "$@"

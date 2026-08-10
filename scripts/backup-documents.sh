#!/bin/sh
set -eu
: "${PRIVATE_STORAGE_PATH:?PRIVATE_STORAGE_PATH wajib diisi}"
: "${BACKUP_PATH:?BACKUP_PATH wajib diisi}"
umask 077
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$BACKUP_PATH/documents"
mkdir -p "$destination"
temporary="$destination/$timestamp.tar.gz.partial"
trap 'rm -f "$temporary"' EXIT INT TERM
tar --create --gzip --file="$temporary" --directory="$PRIVATE_STORAGE_PATH" .
sha256sum "$temporary" | sed "s/\.partial//" > "$destination/$timestamp.sha256"
mv "$temporary" "$destination/$timestamp.tar.gz"
trap - EXIT
printf '%s\n' "$destination/$timestamp.tar.gz"

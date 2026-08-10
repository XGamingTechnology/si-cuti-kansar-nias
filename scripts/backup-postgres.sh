#!/bin/sh
set -eu
: "${DATABASE_URL:?DATABASE_URL wajib diisi}"
: "${BACKUP_PATH:?BACKUP_PATH wajib diisi}"
umask 077
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$BACKUP_PATH/postgres"
mkdir -p "$destination"
temporary="$destination/$timestamp.dump.partial"
trap 'rm -f "$temporary"' EXIT INT TERM
pg_dump --format=custom --no-owner --no-acl --file="$temporary" "$DATABASE_URL"
mv "$temporary" "$destination/$timestamp.dump"
trap - EXIT
printf '%s\n' "$destination/$timestamp.dump"

#!/bin/sh
# Operator-installed scheduler wrapper. No cron/VPS configuration is changed by this file.
set -eu
umask 077
: "${REPORT_MAINTENANCE_IMAGE:?pin the maintenance image for the approved commit}"
: "${REPORT_MAINTENANCE_ENV_FILE:?use a mode-specific, operator-owned 0600 env file}"
mode="${1:-}"
case "$mode" in
  files|check)
    : "${REPORT_STORAGE_VOLUME:?dedicated M7 volume, never the domain-document volume}"
    exec docker run --rm --network none --env-file "$REPORT_MAINTENANCE_ENV_FILE" \
      --mount "type=volume,source=$REPORT_STORAGE_VOLUME,target=/reports" \
      "$REPORT_MAINTENANCE_IMAGE" "$mode"
    ;;
  audit)
    : "${REPORT_MAINTENANCE_NETWORK:?private database network for this environment}"
    exec docker run --rm --network "$REPORT_MAINTENANCE_NETWORK" \
      --env-file "$REPORT_MAINTENANCE_ENV_FILE" "$REPORT_MAINTENANCE_IMAGE" audit
    ;;
  *) echo 'Use files | check | audit' >&2; exit 2 ;;
esac

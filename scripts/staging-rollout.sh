#!/bin/sh
set -eu

# Staging-only, build-free rollout. This script deliberately refuses to repair Git
# state: the operator must inspect and resolve every tracked or untracked change.

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

ENV_FILE=${STAGING_ENV_FILE:-.env.staging}
PROJECT=si-cuti-staging
COMPOSE="docker compose --project-name $PROJECT --env-file $ENV_FILE -f compose.yaml -f compose.staging.yaml"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

safe_env_value() {
  key=$1
  file=$2
  awk -v wanted="$key" '
    /^[[:space:]]*#/ { next }
    $0 ~ "^[[:space:]]*" wanted "[[:space:]]*=" {
      sub("^[[:space:]]*" wanted "[[:space:]]*=[[:space:]]*", "")
      sub(/[[:space:]]+$/, "")
      if (($0 ~ /^".*"$/) || ($0 ~ /^\047.*\047$/)) print substr($0, 2, length($0) - 2)
      else print
      found=1
      exit
    }
    END { if (!found) exit 1 }
  ' "$file"
}

check_private_env() {
  file=$1
  [ -f "$file" ] || fail "$file tidak ditemukan. Buat dari template dan isi di VPS."
  mode=$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file" 2>/dev/null || true)
  [ "$mode" = 600 ] || fail "$file harus bermode 0600 (aktual: ${mode:-tidak diketahui})."
}

printf '%s\n' '== Staging source preflight =='
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'bukan Git worktree'
git fetch origin staging
head_sha=$(git rev-parse HEAD)
staging_sha=$(git rev-parse origin/staging)
printf 'Source commit: %s\norigin/staging: %s\n' "$head_sha" "$staging_sha"
[ "$head_sha" = "$staging_sha" ] || fail 'HEAD tidak sama dengan origin/staging; tidak ada reset otomatis.'
[ -z "$(git status --porcelain --untracked-files=all)" ] || {
  git status --short >&2
  fail 'worktree kotor. Periksa setiap file; helper tidak reset atau menghapus file untracked.'
}

check_private_env "$ENV_FILE"
deployment_environment=$(safe_env_value DEPLOYMENT_ENVIRONMENT "$ENV_FILE") || fail 'DEPLOYMENT_ENVIRONMENT tidak ditemukan'
[ "$deployment_environment" = staging ] || fail 'DEPLOYMENT_ENVIRONMENT harus staging'
image_ref=$(safe_env_value IMAGE_REF "$ENV_FILE") || fail 'IMAGE_REF tidak ditemukan'
[ -n "$image_ref" ] || fail 'IMAGE_REF kosong'
printf 'DEPLOYMENT_ENVIRONMENT=%s\nIMAGE_REF=%s\n' "$deployment_environment" "$image_ref"

# Never print rendered Compose config: it contains database credentials.
$COMPOSE config -q
$COMPOSE run --rm --no-deps environment-guard

expected_image_id=$(docker image inspect --format '{{.Id}}' "$image_ref" 2>/dev/null) || \
  fail "image lokal untuk IMAGE_REF tidak ada: $image_ref (BUILD ONCE dilakukan terpisah)"
printf 'Expected local image ID: %s\n' "$expected_image_id"

printf '%s\n' '== Read-only staging database provenance =='
db_parts=$(node - "$ENV_FILE" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((item) => /^\s*DATABASE_URL\s*=/.test(item) && !/^\s*#/.test(item));
if (!line) process.exit(2);
let value = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim();
if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
const url = new URL(value);
process.stdout.write([url.hostname, url.port || "5432", url.pathname.slice(1), decodeURIComponent(url.username)].join("\n"));
NODE
) || fail 'DATABASE_URL tidak valid'
db_host=$(printf '%s\n' "$db_parts" | sed -n '1p')
db_port=$(printf '%s\n' "$db_parts" | sed -n '2p')
db_name=$(printf '%s\n' "$db_parts" | sed -n '3p')
db_user=$(printf '%s\n' "$db_parts" | sed -n '4p')
printf 'App DB host: %s\nApp DB port: %s\nApp DB database: %s\nApp DB username: %s\n' "$db_host" "$db_port" "$db_name" "$db_user"
[ "$db_host" = postgres ] || fail "host DB staging tidak sesuai: $db_host"
[ "$db_port" = 5432 ] || fail "port DB staging tidak sesuai: $db_port"
[ "$db_name" = si_cuti_staging ] || fail "nama DB staging tidak sesuai: $db_name"
[ "$db_user" = si_cuti_staging_app ] || fail "user DB staging tidak sesuai: $db_user"

postgres_id=$($COMPOSE ps -q postgres)
[ -n "$postgres_id" ] || fail 'container PostgreSQL staging tidak berjalan'
postgres_identity=$(docker inspect --format '{{.Name}} image={{.Config.Image}} id={{.Id}}' "$postgres_id" | sed 's#^/##')
actual_database=$($COMPOSE exec -T postgres psql -U postgres -d "$db_name" -Atqc 'SELECT current_database()')
marker=$($COMPOSE exec -T postgres psql -U postgres -d "$db_name" -Atqc 'SELECT environment FROM deployment_control.environment_marker WHERE singleton = true')
active_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Name}}{{end}}{{end}}' "$postgres_id")
printf 'Postgres container: %s\ncurrent_database(): %s\ndeployment marker: %s\nactive PostgreSQL volume: %s\n' "$postgres_identity" "$actual_database" "$marker" "$active_volume"
[ "$actual_database" = si_cuti_staging ] || fail 'current_database() bukan si_cuti_staging'
[ "$marker" = staging ] || fail 'marker database bukan staging'
[ "$active_volume" = si-cuti-staging_postgres_data ] || fail "volume aktif tidak sesuai: $active_volume"
if docker volume inspect staging_postgres_data >/dev/null 2>&1; then
  printf '%s\n' 'INVESTIGATE ONLY: volume staging_postgres_data juga ada tetapi tidak terbukti aktif; jangan hapus.'
fi

printf '%s\n' '== Recreate staging app from the already-built image =='
$COMPOSE up -d --no-deps --force-recreate --no-build --pull never app
app_id=$($COMPOSE ps -q app)
[ -n "$app_id" ] || fail 'container app staging tidak ditemukan setelah recreate'
running_image_id=$(docker inspect --format '{{.Image}}' "$app_id")
printf 'Configured IMAGE_REF: %s\nRunning container image ID: %s\n' "$image_ref" "$running_image_id"
[ "$running_image_id" = "$expected_image_id" ] || fail 'running app image ID berbeda dari expected local image ID'

printf '%s\n' 'Menunggu health container app staging...'
attempt=0
while :; do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$app_id")
  [ "$health" = healthy ] && break
  [ "$health" = unhealthy ] && fail 'app staging berstatus unhealthy'
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || fail "timeout menunggu health app (status: $health)"
  sleep 2
done

$COMPOSE exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>{console.log('live HTTP '+r.status);if(!r.ok)process.exit(1)})"
$COMPOSE exec -T app node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{console.log('ready HTTP '+r.status);if(!r.ok)process.exit(1)})"
printf '%s\n' 'Staging app rollout provenance terverifikasi. Edge belum diubah; jalankan staging-edge-reconcile.sh secara terpisah.'

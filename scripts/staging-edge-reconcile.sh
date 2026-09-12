#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

ENV_FILE=${STAGING_EDGE_ENV_FILE:-.env.edge.staging}
COMPOSE="docker compose --env-file $ENV_FILE -f compose.edge.staging.yaml"
TEMPLATE=docker/edge/staging-templates/default.conf.template
UPSTREAM=http://si-cuti-staging-app:3000

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
assert_route() {
  file=$1
  route=$2
  awk -v route="$route" -v upstream="$UPSTREAM" '
    $0 ~ "^[[:space:]]*location " route "[[:space:]]*\\{" { inside=1; next }
    inside && /}/ { exit found ? 0 : 1 }
    inside && index($0, "proxy_pass " upstream ";") { found=1 }
    END { if (!inside || !found) exit 1 }
  ' "$file" || fail "route '$route' tidak mem-proxy ke $UPSTREAM"
}
safe_env_value() {
  awk -v wanted="$1" '
    /^[[:space:]]*#/ { next }
    $0 ~ "^[[:space:]]*" wanted "[[:space:]]*=" { sub("^[[:space:]]*" wanted "[[:space:]]*=[[:space:]]*", ""); gsub(/^['\''\"]|['\''\"]$/, ""); print; found=1; exit }
    END { if (!found) exit 1 }
  ' "$2"
}

[ -f "$ENV_FILE" ] || fail "$ENV_FILE tidak ditemukan"
mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || true)
[ "$mode" = 600 ] || fail "$ENV_FILE harus bermode 0600 (aktual: ${mode:-tidak diketahui})"
[ -f "$TEMPLATE" ] || fail "template staging tidak ditemukan: $TEMPLATE"
hostname=$(safe_env_value STAGING_HOSTNAME "$ENV_FILE") || fail 'STAGING_HOSTNAME tidak ditemukan'
network=$(safe_env_value STAGING_FRONTEND_NETWORK "$ENV_FILE") || fail 'STAGING_FRONTEND_NETWORK tidak ditemukan'
[ "$network" = si-cuti-staging-frontend ] || fail "network edge bukan staging network yang diharapkan: $network"

printf 'Staging edge hostname: %s\nStaging frontend network: %s\n' "$hostname" "$network"
# Never print rendered Compose config because certificate paths are operational details.
$COMPOSE config -q
assert_route "$TEMPLATE" '\^~ /api/'
assert_route "$TEMPLATE" '= /admin'
assert_route "$TEMPLATE" '\^~ /admin/'
assert_route "$TEMPLATE" '/'
printf '%s\n' 'Source staging template memiliki /api/, exact /admin, /admin/ subtree, dan catch-all ke staging app.'

# Recreate only the edge service in compose.edge.staging.yaml. No production compose is referenced.
existing_edge_id=$($COMPOSE ps -q edge 2>/dev/null || true)
if [ -n "$existing_edge_id" ]; then
  existing_networks=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$existing_edge_id")
  existing_production=$(printf '%s\n' "$existing_networks" | grep -E '(^|[-_])prod(uction)?([-_]|$)' || true)
  [ -z "$existing_production" ] || fail 'container edge yang ada attached ke network production; staging-only helper menolak menyentuhnya'
fi
$COMPOSE up -d --no-deps --force-recreate edge
edge_id=$($COMPOSE ps -q edge)
[ -n "$edge_id" ] || fail 'container staging edge tidak ditemukan'
$COMPOSE exec -T edge nginx -t
effective=$(mktemp)
trap 'rm -f "$effective"' EXIT INT TERM
$COMPOSE exec -T edge nginx -T >"$effective" 2>/dev/null
assert_route "$effective" '\^~ /api/'
assert_route "$effective" '= /admin'
assert_route "$effective" '\^~ /admin/'
assert_route "$effective" '/'

attached=$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$edge_id")
printf 'Effective routes: /api/, exact /admin, /admin/ subtree, / -> %s\nAttached networks:\n%s\n' "$UPSTREAM" "$attached"
printf '%s\n' "$attached" | grep -Fx "$network" >/dev/null || fail "edge tidak attached ke $network"
unexpected=$(printf '%s\n' "$attached" | grep -E '(^|[-_])prod(uction)?([-_]|$)' || true)
[ -z "$unexpected" ] || fail "edge staging attached ke network production: $unexpected"

curl --fail --silent --show-error --location --max-time 15 "https://$hostname/api/health/live" >/dev/null
curl --fail --silent --show-error --location --max-time 15 "https://$hostname/api/health/ready" >/dev/null
printf '%s\n' 'Effective Nginx staging config, network attachment, dan HTTPS health terverifikasi.'

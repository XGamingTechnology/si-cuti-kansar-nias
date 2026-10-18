# Checkpoint Staging Runtime dan Edge — 11 September 2026

Status: **RESTORED / VERIFIED FOR STAGING RUNTIME AND EDGE ROUTING**

Checkpoint ini mencatat pemulihan staging SI CUTI setelah ditemukan perbedaan antara source/config yang sudah terbaru dan container runtime yang masih memakai image lama. Catatan ini tidak menyatakan seluruh UAT aplikasi selesai; yang telah diverifikasi adalah provenance runtime app, identitas database staging, effective Nginx routing, network attachment, dan health endpoint.

## 1. Ringkasan insiden

Kondisi awal yang ditemukan:

- Git `HEAD` lokal sudah sama dengan `origin/staging`.
- `.env.staging` sudah menunjuk ke image baru `si-cuti:app-8816b6c`.
- Container app yang melayani staging masih memakai image lama berbasis commit `034dbc3`.
- Template Nginx staging lokal sempat menjadi file kosong 0 byte.
- Worktree staging sempat kotor oleh file untracked yang merupakan artefak command shell yang terpasta/terpotong.
- Helper deployment terbaru memiliki dua masalah portability:
  1. `scripts/staging-rollout.sh` memanggil `node` langsung dari host VPS untuk parsing `DATABASE_URL`;
  2. `scripts/staging-edge-reconcile.sh` menggunakan pola AWK untuk `location ^~ ...` yang gagal pada implementasi AWK di VPS.

Tidak ada bukti bahwa database staging tertukar dengan production.

## 2. Source checkpoint

Verified on VPS:

```text
HEAD           = 12e67b2ff028243be066cd16b3cabbbbfd8c4178
origin/staging = 12e67b2ff028243be066cd16b3cabbbbfd8c4178
working tree   = clean
```

Template staging dipulihkan dari `origin/staging` dan kembali berisi 33 baris, termasuk:

```nginx
location ^~ /api/ {
  proxy_pass http://si-cuti-staging-app:3000;
}

location ^~ /admin/ {
  proxy_pass http://si-cuti-staging-app:3000;
}

location / {
  proxy_pass http://si-cuti-staging-app:3000;
}
```

## 3. App image provenance

Configured staging image:

```text
IMAGE_REF=si-cuti:app-8816b6c
```

Verified local and running image ID:

```text
sha256:f549f86bc4aaa19bb55243db6967676c32e5b19939eff1cb176eec47fa7cb542
```

After rollout:

```text
CONFIG_IMAGE=si-cuti:app-8816b6c
STATUS=running
HEALTH=healthy
```

This proves the staging app container no longer serves the previous `034dbc3` image.

## 4. Database provenance

Read-only checks during rollout verified:

```text
host                = postgres
port                = 5432
database            = si_cuti_staging
application user    = si_cuti_staging_app
current_database()  = si_cuti_staging
deployment marker   = staging
active PG volume    = si-cuti-staging_postgres_data
```

No database volume was deleted, reset, or replaced during this recovery.

## 5. Edge reconciliation

Before recreate, the existing edge container was verified to be attached only to:

```text
si-cuti-staging-frontend
```

No production-named network was attached.

The staging edge service was then force-recreated using only:

```text
.env.edge.staging
compose.edge.staging.yaml
```

Nginx validation passed:

```text
nginx.conf syntax is ok
nginx.conf test is successful
```

The effective configuration from `nginx -T` showed all three routes proxying to the expected staging upstream:

```text
/api/   -> http://si-cuti-staging-app:3000
/admin/ -> http://si-cuti-staging-app:3000
/       -> http://si-cuti-staging-app:3000
```

The recreated edge remained attached only to:

```text
si-cuti-staging-frontend
```

## 6. Public HTTPS verification

Hostname:

```text
si-cuti-staging.43-134-231-84.sslip.io
```

Verified responses:

```text
GET /api/health/live   -> HTTP 200
GET /api/health/ready  -> HTTP 200
GET /admin/saldo-cuti  -> HTTP 307, Location: /
```

The `307` on `/admin/saldo-cuti` is materially different from the previous routing failure: the request now passes through the effective Nginx configuration to the application and receives an application-level redirect instead of a routing `404`.

Whether an authenticated Admin Kepegawaian session reaches the intended page remains an application/UAT check and is not inferred from this unauthenticated `curl` result.

## 7. Recovery actions performed

1. Verified `HEAD == origin/staging`.
2. Inspected the dirty worktree.
3. Restored only `docker/edge/staging-templates/default.conf.template` from `origin/staging`.
4. Removed only inspected untracked shell-command artefacts.
5. Verified a clean worktree.
6. Verified `.env.staging` and `.env.edge.staging` mode `0600`.
7. Verified local image `si-cuti:app-8816b6c`.
8. Ran staging app rollout with a temporary host-side Node wrapper backed by the approved app image because the VPS host has no `node` binary.
9. Verified the running app image ID and health.
10. Verified the edge was not attached to a production network.
11. Recreated only the staging edge.
12. Verified `nginx -t`, effective `nginx -T`, network attachment, and public HTTPS health checks.

## 8. Known follow-up engineering work

These are follow-up items; they did not block the recovered runtime after the controlled workarounds above.

### A. Remove hidden host Node dependency from `staging-rollout.sh`

The helper currently invokes `node` directly on the VPS host to parse `DATABASE_URL`. On a Docker-only host without Node.js this fails with:

```text
node: not found
ERROR: DATABASE_URL tidak valid
```

The error message is misleading because the URL may be valid. The helper should parse safely without requiring Node installed on the host, or run the parser through an explicitly declared container/runtime dependency.

### B. Make `staging-edge-reconcile.sh` route checks AWK-portable

The current `assert_route` call for `\^~ /api/` and `\^~ /admin/` triggers AWK escape/regex incompatibilities on the staging VPS, even when the source and effective Nginx configuration are correct.

Prefer fixed-string/token comparison or another portable assertion method rather than encoding Nginx's `^~` modifier through AWK regex escaping.

### C. Correct Docker build target in deployment documentation

The Dockerfile final application stage is named `runtime`, while the deployment documentation previously showed `--target runner`. Documentation should use `runtime`.

## 9. Checkpoint conclusion

As of 11 September 2026, the staging runtime/edge deployment chain is verified to this state:

```text
Git source         : 12e67b2ff028243be066cd16b3cabbbbfd8c4178
Configured image   : si-cuti:app-8816b6c
Running image ID   : sha256:f549f86bc4aaa19bb55243db6967676c32e5b19939eff1cb176eec47fa7cb542
App status         : running / healthy
Database           : si_cuti_staging
DB marker          : staging
PG volume          : si-cuti-staging_postgres_data
Edge network       : si-cuti-staging-frontend
/api/ routing      : verified effective
/admin/ routing    : verified effective
catch-all routing  : verified effective
liveness HTTPS     : 200
readiness HTTPS    : 200
/admin/saldo-cuti  : 307 -> /
```

This checkpoint should be used as the known-good staging baseline before the next deployment or UAT investigation.

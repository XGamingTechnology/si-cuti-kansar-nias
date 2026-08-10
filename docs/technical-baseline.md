# SI CUTI — M1 Technical Baseline and Scaffolding Proposal

Status: **Final proposal — menunggu persetujuan stakeholder sebelum scaffolding**  
Tanggal proposal: **10 Agustus 2026**

## 1. Gate dan perubahan arah

Stakeholder menyetujui arah **TypeScript-first** dengan Next.js, React, PostgreSQL, Docker Compose,
Nginx, dan Node.js dalam bentuk **modular monolith**. Arah Laravel yang pernah diusulkan dibatalkan
sebelum source aplikasi atau scaffold dibuat. Karena itu tidak ada migrasi aplikasi, legacy code,
atau perubahan kebutuhan bisnis. Repository tetap documentation-only sampai proposal versi, ORM,
dan dependency pada dokumen ini disetujui.

## 2. Stack dan versi mayor yang direkomendasikan

| Komponen | Pin M1 | Alasan dan kompatibilitas |
|---|---:|---|
| Node.js | **24.x LTS** | Runtime production LTS; gunakan image resmi `node:24-*-slim` dengan digest yang dicatat saat implementasi. |
| Next.js | **16.x** | Stable release, App Router; kompatibel dengan Node 24. |
| React / React DOM | **19.x** | Pasangan stable yang didukung Next.js 16. |
| TypeScript | **5.x** | Stable compiler line untuk Next.js 16 dan package yang dipilih. |
| PostgreSQL | **18.x** | Stable supported server; image resmi major 18 dengan patch + digest terkunci saat scaffold. |
| ORM/migrations | **Prisma 7.x** | Stable major, PostgreSQL, transaksi, migration history, generated types; Node 24 memenuhi runtime Prisma 7. |
| Schema validation | **Zod 4.x** | Server-first runtime validation dengan inferensi TypeScript. |
| Unit/integration runner | **Vitest 4.x** | Stable runner, Node 24, TypeScript/ESM, mocks dan V8 coverage. |
| Lint / format | **ESLint 9.x / Prettier 3.x** | Flat lint config dan formatting deterministik. |
| Logging | **Pino 10.x** | Structured JSON logging dengan redaction. |
| Reverse proxy | **Nginx stable 1.28.x** | TLS termination, proxy, request limits, security headers. |
| Compose | **Docker Compose specification / plugin v2** | Project-owned `compose.yaml`; bukan Kubernetes. |

Pin di atas adalah **major line**, bukan izin memakai `latest`. Tepat sebelum scaffold, maintainer
wajib memeriksa release/support matrix resmi, memilih patch stable terbaru pada major yang disetujui,
menulis versi exact tanpa `^`/`~`, menghasilkan lockfile, dan merekam image digest. Bila major atau
compatibility matrix berubah, berhenti dan ajukan perubahan keputusan; jangan upgrade diam-diam.
Referensi verifikasi resmi: Node.js release schedule, Next.js support policy, Prisma system
requirements, PostgreSQL versioning policy, dan dokumentasi Vitest.

## 3. Evaluasi ORM

| Kriteria | Prisma 7 (rekomendasi) | Drizzle (alternatif) |
|---|---|---|
| PostgreSQL | First-class melalui driver/adapter resmi | First-class dan dekat dengan SQL |
| Transaksi | Sequential/interaktif; raw transaction tersedia | Transaction API ringan; savepoint bergantung driver |
| Migrasi | Prisma Migrate, SQL committed, drift tooling | `drizzle-kit`; SQL migration committed |
| Type safety | Generated client kuat dari schema | Type inference kuat dari schema TypeScript |
| Relasi | Declarative dan mudah dibaca tim kecil | Eksplisit dan fleksibel; perlu disiplin query |
| Testability | Client dapat diinjeksi; test memakai PostgreSQL nyata | Database object mudah diinjeksi; PostgreSQL nyata |
| Maintainability | Dokumentasi/tooling matang, schema terpusat | Sedikit magic; API/tooling lebih cepat berubah |
| Raw SQL | Typed SQL/raw escape hatch | SQL template/native query sangat natural |
| Audit ledger | Cocok; append-only tetap di service + DB permission | Cocok; SQL constraint terlihat langsung |
| Concurrency saldo | Transaction + isolation/locking via raw SQL | Kontrol SQL/locking lebih langsung |
| Developer experience | Client/migrate konsisten; generation menambah build concern | Ringan/SQL-like; tim menanggung lebih banyak keputusan |
| Docker | Generate pada build; migration one-shot | Ringan; migration one-shot |
| Jangka panjang | Ekosistem/governance lebih matang | Kandidat serius; versioning pra-1.0 harus diverifikasi |

**Rekomendasi: Prisma 7.** Untuk tim kecil, workflow schema/migration terarah dan relational modelling
yang mudah direview lebih berharga daripada minimnya abstraction. Kelemahannya adalah generated
client, image/build lebih berat, dan operasi PostgreSQL khusus kadang memerlukan SQL. Operasi saldo
concurrency-sensitive wajib memakai transaction boundary, isolation, conditional update/row lock
melalui raw SQL bila perlu, constraints, idempotency, retry, dan database tests—ORM tidak otomatis
menyelesaikan race condition.

**Alternatif: Drizzle.** Pilih bila stakeholder lebih memprioritaskan kedekatan dengan SQL dan siap
menerima beban standardisasi/version churn yang lebih tinggi. Jangan memasang keduanya.

## 4. Modular monolith dan struktur repository

```text
src/
  app/                         # page/layout, route handlers; delivery only
  components/                  # reusable UI, tanpa business rule
  modules/
    auth/ employees/ leave/ permissions/ documents/
    reports/ notifications/ audit/        # public module APIs + module-local code
  domain/
    leave/{services,rules,types,errors}/   # business-critical pure domain
  application/use-cases/       # orchestration, ports, transaction boundaries
  infrastructure/
    database/ auth/ storage/ logging/      # adapters
  lib/                         # small framework-neutral utilities only
prisma/{schema.prisma,migrations/}
tests/{unit,integration,database,authorization,auth,documents,http}/
scripts/                       # cron/job and operational entry points
docker/{nginx,backup}/
```

`page.tsx`, `route.ts`, Server Actions, dan React components hanya parse input, memanggil use case,
dan memetakan hasil. Business rule tidak diletakkan pada delivery layer, ORM hook, atau trigger DB.
Abstraction dibuat pada external boundary, bukan interface untuk setiap class.

## 5. Authentication, session, dan authorization

Gunakan **internal server-side authentication layer yang kecil**, bukan Auth.js pada M1. Identifier
local masih ambigu, sementara kebutuhan utama adalah credential terpisah dan opaque database session.
Library provider penuh sekarang menambah schema/callback coupling tanpa manfaat SSO langsung.
Boundary `AuthenticationProvider` memungkinkan adapter OIDC/SAML masa depan; library khusus dinilai
kembali ketika provider dipilih.

Model wajib: `User 1-* AuthenticationIdentity 1-0..1 LocalCredential`; `Employee` terkait ke `User`,
bukan credential. Password di-hash **Argon2id** setelah parameter/recovery/identifier disetujui;
hash/verifikasi hanya di server. Jangan membuat JWT architecture tanpa kebutuhan lintas layanan.

Session adalah random opaque token berentropi tinggi. Database hanya menyimpan digest token,
`userId`, expiry, timestamps, dan metadata yang disetujui. Cookie memakai `HttpOnly`, `Secure` di
production, `SameSite=Lax`, `Path=/`, tanpa role/PII. Terapkan rotasi, revocation, expiry setelah
policy, constant-time comparison, same-origin/CSRF protection, PostgreSQL-backed login rate limit,
dan generic login error.

```text
User -> UserRole -> Role -> RolePermission -> Permission
                                      |
                                      v
                         ResourcePolicy(context, resource)
```

Entry point server memanggil policy; UI bukan boundary. Dokumen memerlukan authenticated user dan
(`ADMIN_KEPEGAWAIAN` dengan scope disetujui, atau `PEGAWAI` yang `employeeId`-nya sama dengan owner).
Default deny berlaku untuk role baru, missing owner, dan object reference yang dimanipulasi.

## 6. Validation dan error handling

Zod 4 schema dijalankan server-side di boundary module/application. Schema client boleh dipakai ulang
untuk UX input identik, tetapi authorization/domain invariant tetap authoritative di server/domain.
Error response tidak membocorkan stack, query, path, credential, atau keberadaan object privat; log
internal memakai correlation ID dan redaction.

## 7. PostgreSQL dan migration

- `postgres` hanya pada internal Compose network, tanpa `ports` production.
- Named volume/host mount khusus menyimpan `PGDATA`; container disposable.
- Bootstrap/admin credential hanya provisioning. App memakai non-superuser `si_cuti_app`; migration
  role terpisah direkomendasikan agar runtime tidak dapat DDL.
- Connection string dari secret environment, tidak masuk image/Git.
- Prisma migration SQL committed, immutable setelah diterapkan, direview, dan dijalankan sebagai
  explicit one-shot `prisma migrate deploy` sebelum app baru menerima traffic.
- M1 tidak membuat rule/table BAL-* unresolved. Database test memakai PostgreSQL 18 nyata, bukan SQLite.

## 8. Private document storage

Application port menjadi satu-satunya dependency use case:

```ts
interface DocumentStorage {
  put(input: AuthorizedUpload): Promise<StoredDocument>;
  open(key: DocumentKey): Promise<ReadableStream>;
  delete(key: DocumentKey): Promise<void>;
}
```

`LocalPrivateStorage` menulis ke persistent host/volume di luar `public/` dan Nginx mount. Object key
dibuat server, path dinormalisasi/harus tetap dalam root, write atomik, permission minimum, checksum,
ukuran, detected MIME/signature, dan safe original filename dicatat. Allowlist, size limit, malware
scan, encryption, retention tetap decision gate. Upload dihentikan saat limit terlampaui.

Download: authenticate → metadata by opaque ID → resource/owner policy → audit bila diwajibkan →
stream dengan safe `Content-Disposition`, `nosniff`, dan no-store. Tidak ada public URL/static path/
direct Nginx route. Adapter `S3CompatibleStorage` kelak tidak mengubah leave domain.

## 9. Docker, network, dan production

```text
Internet -> HTTPS :443 -> nginx -> internal network -> app:3000 -> backend -> postgres:5432
                                                   \-> private document volume
```

`compose.yaml` memuat `nginx`, `app`, `postgres`, healthchecks, networks, persistent DB/document
volumes. Hanya Nginx mempublikasikan 80/443; 80 redirect HTTPS. Nginx tidak mendapat mount dokumen.

Satu multi-stage `Dockerfile`: dependency/build lalu minimal Next standalone runtime, production-only,
non-root, read-only root filesystem bila praktis, tmpfs `/tmp`, dropped capabilities. Worker masa
depan memakai image sama dengan command berbeda. M1 tidak perlu queue/Redis/Kafka/RabbitMQ. Scheduled
job adalah idempotent CLI yang dipanggil Ubuntu cron dengan locking dan monitored exit code.

`compose.production.yaml` bernilai untuk TLS mount, secrets, no source bind, resource/log/restart
policy, dan hardening; panggil eksplisit bersama base agar tidak bergantung override implisit.

## 10. Environment, logging, security, supply chain

- Commit `.env.example` tanpa value secret; `.env*`, keys, dumps, uploads di-ignore.
- Validasi env sekali saat boot dengan Zod. Hanya `NEXT_PUBLIC_` non-secret masuk client.
- Production secret melalui protected host file/Docker-secret-compatible mount; rotate tanpa rebuild.
- Pino JSON stdout/stderr berisi UTC, service/version, correlation ID, route template/status/duration;
  redact password, cookie, authorization, session, file content, token, PII. Audit bukan log biasa.
- HTTPS, HSTS setelah tervalidasi, CSP bertahap, frame denial, `nosniff`, Referrer-Policy, body limits,
  timeout, trusted proxy, least privilege, non-root container, secure errors.
- CI: frozen install, lint, format, typecheck, test/coverage, migration validate, secret/dependency/
  container scan. Patch update via PR+tests; tidak auto-upgrade major.

## 11. Backup interface (DEP-002)

Cron-compatible command menghasilkan artifact set: consistent PostgreSQL logical dump; archive
dokumen privat + manifest/checksum; timestamp dan app/schema version; staging terpisah; lalu
`BackupTarget.copy(artifactSet)` ke tujuan di luar data primer. Harus ada exit code, anti-overlap lock,
partial cleanup, free-space check, secret-safe logging, dan automatable restore verification.

Cron host/one-shot container memakai mount minimum, bukan queue daemon. Tujuan off-VPS, schedule,
retention, rotation, encryption, RPO/RTO, dan DR runbook menunggu M8. Same-VPS copy **bukan** DR lengkap.

## 12. Testing proposal

| Jenis | Tool / approach |
|---|---|
| Unit/domain | Vitest 4, pure services, no DB |
| Application/integration | Vitest, use case + real adapter/controlled fake |
| Database/concurrency | PostgreSQL 18, Prisma migrations, real transactions |
| Authorization | Policy matrix/table tests; default deny/owner isolation |
| Authentication | Password/session/cookie/rotation/revocation/rate limit |
| Document | Temp private storage + real metadata DB; traversal/type/size/IDOR |
| HTTP/API | Vitest + native Web `Request`/`Response` |

Mandatory: Employee A → Employee B document = **deny**; anonymous private request = **deny**;
authorized Admin = **allow**. Playwright/Cypress belum masuk M1; tambah kelak hanya bila justified.

## 13. Dependency proposal

Production: `next@16`, `react@19`, `react-dom@19`, Prisma client/adapter `@7`, `zod@4`, `pino@10`,
driver PostgreSQL resmi adapter Prisma, stable Argon2id library yang mendukung Node 24, dan cookie
primitive hanya bila Web/Next API tidak cukup. Development: `typescript@5`, Prisma CLI `@7`,
`vitest@4`, coverage V8 seversi, `eslint@9`, supported Next/TypeScript lint integration,
`prettier@3`, dan compatible type packages. Exact patches ditentukan setelah approval.

Sengaja dihindari: Auth.js/NextAuth, Passport, JWT library, Redis, BullMQ, Kafka, RabbitMQ,
Kubernetes, microservice framework, GraphQL, tRPC, second ORM, SQLite substitute, malware engine
tanpa policy, report/chart/UI suites, dan browser E2E besar.

## 14. Commands — **baru boleh dijalankan setelah approval**

```bash
node --version
corepack --version
docker --version
docker compose version
corepack enable
corepack prepare pnpm@<EXACT_APPROVED_PATCH> --activate
pnpm dlx create-next-app@<EXACT_APPROVED_PATCH> .m1-scaffold \
  --typescript --eslint --app --src-dir --import-alias '@/*' --use-pnpm --no-tailwind
pnpm add --save-exact next@<16.x.patch> react@<19.x.patch> react-dom@<19.x.patch> \
  @prisma/client@<7.x.patch> zod@<4.x.patch> pino@<10.x.patch> <approved-pg-driver> <approved-argon2>
pnpm add --save-dev --save-exact typescript@<5.x.patch> prisma@<7.x.patch> \
  vitest@<4.x.patch> @vitest/coverage-v8@<same-4.x.patch> eslint@<9.x.patch> \
  prettier@<3.x.patch> <approved-eslint-and-types-packages>
pnpm prisma validate
docker compose config
docker compose up -d postgres
pnpm prisma migrate dev --name m1_auth_foundation
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
docker build --pull -t si-cuti:m1 .
docker compose up -d --build
curl --fail http://localhost/health
docker compose down
```

Development: frozen install → PostgreSQL Compose → migrations → `pnpm dev`. Production: backup/
preflight → immutable image → migration one-shot → rollout → health → Nginx → smoke/monitor.
Rollback app memakai image sebelumnya; schema changes harus backward-compatible/forward-fix.

## 15. M1 acceptance criteria

- Stakeholder menyetujui major + exact patch set, Prisma, auth approach, command plan sebelum code.
- Scaffold minimal; tidak ada business feature atau BAL-* unresolved.
- Modular boundaries/import rules diperiksa; PostgreSQL persistent/internal/non-superuser.
- Migration committed; Nginx-only ingress; HTTPS plan; non-root/minimal image; health endpoint.
- Provider-neutral identity/session; server RBAC/resource policy; DOC-003 authorization tests.
- Env/secret isolation, structured/redacted logs, secure errors/headers/upload baseline.
- Unit/integration/database/auth/authz/document/HTTP infrastructure lulus.
- Backup mencakup DB+dokumen + external-copy seam; same-VPS tidak diklaim DR.
- Format, lint, typecheck, tests, migration validate, build, Compose config, health pass.
- Tidak ada secret, data nyata, public upload, queue, Redis, microservice.

## 16. Risks dan tradeoff

1. **Version drift:** mitigasi official re-check, exact pin, lockfile, image digest, smoke test.
2. **Prisma/raw SQL:** locking mungkin keluar happy path; isolasi repository method + DB tests.
3. **Internal auth:** kecil tetapi tim memikul security; review dan nilai library saat SSO nyata.
4. **Single VPS:** failure domain tunggal; external-copy seam sekarang, DR/RPO/RTO sebelum production.
5. **Local volume:** host-bound; abstraction, checksum, backup, future S3 adapter mengurangi lock-in.
6. **No queue:** cukup M1; ukur report/document workload sebelum menambah infrastructure.
7. **Open policy:** foundation schema tidak boleh mengeras menjadi BAL/WF/NOT implementation.

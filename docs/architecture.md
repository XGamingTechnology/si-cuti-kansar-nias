# SI CUTI - Architecture Baseline

Status: **M1 TypeScript/Next.js proposal — requires stack approval before implementation**

> Detail executable, version matrix, ORM comparison, security, commands, dan acceptance criteria ada di `docs/technical-baseline.md`. Belum ada source aplikasi atau kebutuhan migrasi aplikasi.

## 1. Architecture goals

Arsitektur harus mendukung kebutuhan proposal:

- aplikasi web responsif;
- modular design;
- relational database;
- pemisahan Admin Kepegawaian dan Pegawai;
- perhitungan saldo yang konsisten;
- document archive;
- reporting;
- audit trail;
- pengembangan fitur berikutnya tanpa merombak sistem inti.

## 2. Proposed logical architecture

```text
Browser / Responsive Web UI
          |
          v
Application / API Layer
          |
          +-------------------------------+
          |                               |
          v                               v
Domain Services                    File/Document Service
          |                               |
          v                               v
Relational Database                  Document Storage
          |
          v
Audit / Reporting / Analytics
```

Implementasi fisiknya adalah **modular monolith**, bukan microservices. Next.js 16 pada Node.js 24 adalah delivery framework, bukan lokasi seluruh business logic. PostgreSQL 18 adalah relational store dan Prisma 7 direkomendasikan setelah approval M1.

## 3. Layer responsibilities

### Presentation layer

- rendering UI;
- form interaction;
- accessibility;
- client-side convenience validation;
- tidak menjadi sumber kebenaran authorization atau saldo.

### Application/API layer

- authentication/session orchestration;
- RBAC enforcement;
- request validation;
- transaction boundaries;
- API/server actions.

Authentication memakai boundary provider-neutral. Milestone awal menyediakan adapter `LOCAL`;
OIDC, SAML, atau SSO institusi tidak diimplementasikan pada milestone ini. Adapter autentikasi
menghasilkan `User` aplikasi yang sama sehingga penambahan provider di masa depan tidak mengubah
`Employee`, role/permission, authorization policy, atau transaksi domain.

Route Handler/Server Action hanya parsing, validasi boundary, autentikasi, pemanggilan use case, dan mapping response. React, `page.tsx`, `route.ts`, Server Action, ORM hook, dan database trigger bukan lokasi business-critical rule.

### Domain layer

Domain modules minimal:

- Employee
- Leave Balance
- Leave Application
- Joint Leave Claim
- Permission
- Approval/Verification
- Document Archive
- Notification
- Reporting
- Audit

**Leave Balance Engine** harus menjadi service/domain module terisolasi dan memiliki automated tests.

### Persistence layer

- relational database;
- migrations;
- transaction history;
- referential integrity;
- indexes untuk pencarian/filter.

### Document storage

PDF dan bukti pendukung disimpan melalui port `DocumentStorage`. Adapter awal `LocalPrivateStorage` berada di luar `public/` dan tidak di-mount ke Nginx; `S3CompatibleStorage` dapat ditambahkan tanpa mengubah domain. Download selalu authenticate → metadata → owner/resource policy → audit bila wajib → stream.

### Source boundaries

`src/app` dan `src/components` adalah delivery; `src/modules` menjaga feature cohesion; `src/domain/leave` memuat rule kritis; `src/application/use-cases` melakukan orchestration; `src/infrastructure` berisi adapter database/auth/storage/logging. Shared `src/lib` harus kecil. Reports, notifications, audit tetap dalam process/image yang sama.

## 4. Authorization model

Authentication (pembuktian identitas) dipisahkan dari authorization (keputusan akses). Provider
autentikasi tidak memberikan kewenangan aplikasi secara langsung; role dan permission tetap
dikelola serta diperiksa oleh SI CUTI.

Baseline RBAC:

- `ADMIN_KEPEGAWAIAN`
- `PEGAWAI`

Authorization harus diperiksa pada server/backend untuk:

- data pegawai;
- pengajuan;
- dokumen;
- laporan;
- perubahan saldo;
- approval/verifikasi;
- audit logs.

Credential `LOCAL` disimpan sebagai hash yang aman, tidak pernah plaintext, dan terpisah dari data
`Employee`. Baik autentikasi maupun authorization wajib ditegakkan di server/backend. Business
logic tidak boleh bercabang berdasarkan provider autentikasi.

Model enforcement adalah `User → Role → Permission → ResourcePolicy`, server-side dan default deny. Policy dokumen juga memeriksa `ownerEmployeeId`; menu/tombol tersembunyi bukan boundary. M1 mengusulkan opaque database session, bukan JWT; cookie `HttpOnly`, `Secure` production, `SameSite=Lax`, dengan rotasi/revocation server-side.

## 5. Audit architecture

Operasi sensitif harus membuat event audit yang immutable dari perspektif user normal.

Minimal mencatat:

- actor/user;
- timestamp;
- action;
- entity type;
- entity id;
- IP address jika tersedia dan sesuai kebijakan;
- perubahan nilai untuk operasi saldo/data kritis.

## 6. Leave balance consistency

Jangan hanya menyimpan satu angka `current_balance` tanpa histori.

Rekomendasi:

- simpan bucket entitlement/balance per tahun/sumber;
- simpan ledger/transaction untuk setiap penambahan/pengurangan;
- proses pengurangan dilakukan dalam satu database transaction;
- prioritaskan bucket sesuai aturan proposal;
- rollback/compensation harus dirancang untuk pembatalan atau koreksi.

## 7. Reporting strategy

Reporting membaca data terstruktur dari database, bukan menghitung ulang dari tampilan.

Export target:

- PDF
- Excel

## 8. Deployment baseline - APPROVED FOR M1

Target produksi awal yang disetujui adalah **VPS berbasis Ubuntu** dan tidak boleh diubah tanpa
keputusan stakeholder baru. M1 boleh merancang detail berikut selama kompatibel dengan target itu:

- containerization, reverse proxy, TLS/HTTPS, firewall, dan process management;
- deployment pipeline dan environment variable handling;
- database topology;
- framework frontend/backend;
- RDBMS spesifik;
- object storage;
- identity provider/SSO;
- CI/CD platform;
- topology staging dan kapasitas.

Dokumen privat harus berada di storage non-publik tanpa URL anonim permanen. Download dilayani
backend setelah autentikasi dan pemeriksaan authorization untuk Admin Kepegawaian atau Pegawai
pemilik; role masa depan ditolak secara default. Object-reference authorization, metadata, dan akses
sensitif harus dapat diaudit.

Backup otomatis dijadwalkan dengan cron dan minimal mencakup database serta dokumen privat.
Implementasi harus dapat menyalin hasil keluar dari lokasi data aplikasi utama. Tujuan sekunder,
retensi/rotasi, enkripsi salinan, interval uji restore, RPO/RTO, dan runbook DR diputuskan sebelum
M8/production. Salinan yang hanya berada di VPS produksi yang sama bukan DR lengkap.

Topologi M1 adalah `nginx`, `app`, `postgres`; hanya Nginx mengekspos 80/443. DB dan dokumen memakai volume persistent, PostgreSQL tidak public. Multi-stage Dockerfile menghasilkan Next standalone runtime non-root. Worker masa depan dapat memakai image sama, tetapi M1 tidak memasang Redis/queue; Ubuntu cron memanggil CLI job idempotent.

## 9. Suggested engineering properties

Ini adalah rekomendasi teknis, bukan requirement eksplisit proposal:

- typed codebase;
- database migrations;
- automated unit/integration tests;
- linting and formatting;
- environment-based configuration;
- secure secret management;
- pagination untuk dataset besar;
- structured logging;
- backup policy;
- least-privilege database/service accounts.

## 10. Decision dependencies

Arsitektur ini tetap konseptual. Pilihan berikut tidak boleh dikunci sebelum Decision ID terkait
berstatus Resolved di `docs/decision-log.md`.

| Architecture concern | Decision IDs |
|---|---|
| Transaction boundary dan ledger saldo | BAL-001, BAL-002, BAL-003, BAL-004, BAL-005 |
| Workflow/approval domain dan authorization transition | WF-001, WF-002, WF-003, WF-004, AUTH-002 |
| Document service, versioning, retention, dan storage | DOC-001, DOC-002, DOC-003 (access policy resolved), DOC-004 |
| Calendar/notification adapters | CAL-001, NOT-001, NOT-002 |
| Audit/report security boundary | AUD-001, RPT-001, RPT-002 |
| Identity provider dan employee hierarchy | AUTH-001 (resolved), AUTH-002, DATA-001 |
| Hosting, persistence topology, backup/DR, observability | DEP-001 (resolved), DEP-002 (M1 baseline resolved; production details deferred), DEP-003 |

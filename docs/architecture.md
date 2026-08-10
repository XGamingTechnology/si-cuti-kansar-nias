# SI CUTI - Architecture Baseline

Status: **Proposed technical architecture - requires approval before implementation**

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

PDF dan bukti pendukung sebaiknya disimpan melalui abstraction layer agar deployment dapat menggunakan local storage atau object storage tanpa mengubah domain logic.

## 4. Authorization model

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

## 8. Deployment assumptions - NOT YET DECIDED

Proposal memperbolehkan server lokal/cloud instansi. Keputusan berikut masih terbuka:

- cloud vs on-premise/local server;
- framework frontend/backend;
- RDBMS spesifik;
- object storage;
- identity provider/SSO;
- CI/CD platform;
- backup and disaster recovery strategy.

Codex tidak boleh mengunci pilihan teknologi ini sebagai requirement bisnis tanpa persetujuan.

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
| Document service, versioning, retention, dan storage | DOC-001, DOC-002, DOC-003, DOC-004 |
| Calendar/notification adapters | CAL-001, NOT-001, NOT-002 |
| Audit/report security boundary | AUD-001, RPT-001, RPT-002 |
| Identity provider dan employee hierarchy | AUTH-001, AUTH-002, DATA-001 |
| Hosting, persistence topology, backup/DR, observability | DEP-001, DEP-002, DEP-003 |

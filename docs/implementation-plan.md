# SI CUTI - Implementation Plan

Status: **Proposed phased roadmap**

Prinsip: jangan membangun seluruh aplikasi dalam satu task. Setiap milestone harus direview sebelum lanjut.

## M0 - Product & Documentation Foundation

Deliverables:

- source PDF tersimpan di repo;
- AGENTS.md;
- requirements;
- architecture;
- database schema;
- user flows;
- design system;
- traceability;
- daftar ambiguity;
- laporan review produk dan teknis terhadap teks serta gambar/flowchart PDF.

Exit criteria:

- stakeholder menerima interpretasi requirement;
- ambiguity kritis diberi keputusan atau secara eksplisit ditunda.

## M1 - Technical Foundation

Setelah teknologi disetujui:

- initialize framework/project;
- environment configuration;
- linting/formatting;
- testing framework;
- database migration baseline;
- CI checks;
- base application shell.

Dependency: M0 approved.

## M2 - Authentication, Employee & RBAC

- autentikasi provider-neutral dengan provider `LOCAL`;
- credential lokal terpisah dari `User` dan `Employee`, hanya menyimpan password hash aman;
- role model;
- employee master data;
- employee profile;
- server-side authorization;
- contract/test yang memastikan domain dan authorization tidak bergantung pada provider `LOCAL`;
- mock seed data (bukan data nyata).

Dependency: M1.

## M3 - Leave Balance Domain Engine

- balance buckets;
- ledger/transactions;
- Cuti N;
- carry-over N-1/N-2 sesuai rule yang telah dikonfirmasi;
- Klaim Cuti Bersama entitlement;
- deduction priority;
- non-annual leave exclusions;
- automated unit/integration tests.

Exit criteria: seluruh test skenario saldo kritis lulus.

Dependency: M2 + keputusan ambiguity saldo.

## M4 - Employee Leave & Permission Workflows

- pengajuan cuti;
- draft/submit;
- validation;
- upload evidence;
- izin non-cuti;
- history/status;
- generation/linking of standard document as applicable.

Dependency: M3 + workflow state approved.

## M5 - Admin Verification & Document Archive

- admin queues;
- search/filter;
- Klaim Cuti Bersama verification;
- approval/rejection flow;
- document archive upload/download;
- audit records.

Dependency: M4.

## M6 - Dashboards, Calendar & Analytics

Admin:

- summary indicators;
- leave calendar;
- latest applications;
- leave analytics;
- readiness-related summary based only on approved definition.

Employee:

- profile summary;
- balance breakdown;
- active application;
- personal calendar;
- history;
- usage chart;
- notifications.

Dependency: M4-M5 data flows stable.

## M7 - Reporting & Export

- multi-parameter filter;
- PDF export;
- Excel export;
- archive search;
- pagination;
- access-control tests.

Dependency: M5-M6.

## M8 - Notifications, Audit Hardening, Security & UAT

- reminder H-2 before return to work;
- complete audit review;
- authorization penetration checks;
- file upload security;
- error handling;
- backup/deployment documentation;
- UAT scenarios;
- accessibility/responsive review;
- performance baseline.

Dependency: all previous milestones.

## Relationship to the proposal timeline

PDF sumber mengusulkan jadwal kalender Juli-November: development (Juli-Agustus), testing
(September), pelatihan (Oktober), dan launching/monitoring awal (November). Milestone M0-M8 di atas
adalah urutan dependency/gate rekayasa, bukan perubahan sepihak atas jadwal tersebut. Tahun target,
kapasitas tim, pemetaan milestone ke minggu, serta kelayakan jadwal PDF harus disetujui stakeholder
sebelum dijadikan baseline delivery.

## Milestone operating rule

Untuk setiap milestone:

```text
READ REQUIREMENTS
      -> PLAN
      -> IMPLEMENT SMALL SCOPE
      -> TEST
      -> VERIFY AGAINST TRACEABILITY
      -> HUMAN REVIEW
      -> MERGE
```

Jangan lanjut milestone berikutnya hanya karena kode berhasil dibangun; requirement dan behavior harus direview.

## Decision gates

Status dan keputusan final dikelola di `docs/decision-log.md`; rekomendasi tidak membuka gate.

| Gate | Required resolved Decision IDs |
|---|---|
| Sebelum M1 | DEP-001, DEP-002, keputusan minimum DOC-003 (AUTH-001 telah resolved) |
| Sebelum M2 | AUTH-002, DATA-001 |
| Sebelum M3 | BAL-001, BAL-002, BAL-003, BAL-004, BAL-005 |
| Sebelum M4 | WF-001, WF-002, WF-003, WF-004, PERM-001, PERM-002, VAL-001 |
| Sebelum M5 | DOC-001, DOC-002, DOC-003, DOC-004, AUD-001 |
| Sebelum M6 | CAL-001, RPT-002; NOT-001 bila penerima muncul di dashboard |
| Sebelum M7 | RPT-001, AUTH-002, AUD-001 |
| Sebelum M8/production | NOT-001, NOT-002, DEP-002, DEP-003 serta seluruh keputusan security/retention yang relevan |

M0 belum memenuhi exit criterion selama keputusan blocking tetap “Belum diputuskan”. Tidak ada
bagian tabel ini yang mengizinkan dimulainya M1.

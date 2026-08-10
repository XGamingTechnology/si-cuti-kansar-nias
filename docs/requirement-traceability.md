# SI CUTI - Requirement Traceability Matrix

Status: **Initial mapping plus M1 technical-foundation traceability**


## M1 technical foundation traceability

| Constraint/control | Proposed artifact | Verification at M1 |
|---|---|---|
| TypeScript modular monolith | Next.js 16/Node 24 after approval | boundary review/typecheck; no business feature |
| PostgreSQL | PostgreSQL 18 + Prisma 7 | migration test, private port, non-superuser |
| Server authorization | Role/Permission/ResourcePolicy | policy matrix + HTTP authorization tests |
| AUTH-001 | User/Identity/LocalCredential/opaque Session | auth lifecycle; Employee decoupling |
| DOC-003 | DocumentStorage/LocalPrivateStorage | anonymous deny, Employee A/B deny, Admin allow, traversal deny |
| Persistent containers | DB/document volumes | recreate containers, data persists |
| Nginx/HTTPS | Nginx-only ingress | Compose network/ports, headers/health smoke |
| DEP-002 | DB+documents artifact + external-copy port | backup/restore dry run; no false DR claim |
| Security/testability | env/cookies/CSRF/rate limit/upload/logging + Vitest/PostgreSQL | auth/authz/document/HTTP/database suites and scans |

TECH-002/TECH-003 require approval before executable artifacts. This is acceptance mapping, not evidence of scaffold.

| PDF Requirement | System Module | Main Data Entity | UI / Surface | Server / Domain Action | Test Requirement |
|---|---|---|---|---|---|
| Saldo cuti otomatis | Leave Balance | LeaveBalanceBucket, LeaveBalanceTransaction | Dashboard Pegawai, Saldo Cuti | Calculate / deduct / grant | bucket priority, insufficient balance, rollback |
| Cuti N = 12 hari | Leave Balance | LeaveBalanceBucket | Admin master balance, Dashboard Pegawai | Annual entitlement grant | exactly 12; idempotent annual grant |
| N-1 carry-over | Leave Balance | LeaveBalanceBucket | Saldo Cuti | Carry-over service | boundary around 6 days |
| N-2 untuk kondisi 2 tahun | Leave Balance | LeaveBalanceBucket | Saldo Cuti | Carry-over/eligibility service | two-year eligibility cases |
| Prioritas Klaim -> N-2 -> N-1 -> N | Leave Balance | LeaveBalanceTransaction | Not directly editable UI | Deduction engine | mixed bucket deduction ordering |
| Cuti non-tahunan tidak memotong saldo tahunan | Leave Application / Balance | LeaveType, LeaveApplication | Form Pengajuan | Validate leave type | each excluded category preserves balance |
| Pegawai mengajukan cuti | Leave Application | LeaveApplication | Pengajuan Cuti | Create/submit | valid submit, invalid dates, auth boundary |
| Klaim Cuti Bersama + bukti | Joint Leave Claim | JointLeaveClaim, Document | Klaim Cuti Bersama | Submit claim | evidence validation, duplicate rules after decision |
| Admin memverifikasi klaim | Verification | JointLeaveClaim, AuditLog | Admin Verification | Approve/reject | authorization + balance grant on approve only |
| Upload PDF persetujuan final | Document Archive | Document | Detail Pengajuan Admin | Upload/link document | file validation + authorization |
| Histori dan download arsip | History / Archive | LeaveApplication, Document | Riwayat Pegawai | Query/download | owner isolation |
| Akses dokumen privat | Document Archive / Authorization | Document, Employee, AuditLog | Download/detail dokumen | Authenticated server-authorized stream | Admin scope, owner isolation, IDOR denial, anonymous denial, audit |
| Search tanggal/jenis/nama/NIP/status | Search / Reporting | Multiple | Laporan / Arsip | Filter query | combined filters + pagination |
| Export PDF dan Excel | Reporting | Reporting view/query | Laporan | Generate export | role + content correctness |
| Kalender cuti personal | Calendar | LeaveApplication | Dashboard/Kalender Pegawai | Calendar query | only permitted events |
| Grafik penggunaan cuti | Analytics | LeaveApplication | Dashboard | Aggregate analytics | aggregate correctness |
| Reminder 2 hari sebelum aktif | Notification | Notification, LeaveApplication | Notification UI | Scheduled reminder | correct timing + no duplicate reminder |
| Reminder kepada Pegawai dan atasan | Notification | Notification, employee hierarchy (TBD) | Notification UI | Resolve recipients | recipient authorization + no data leakage |
| Audit saldo dan upload | Audit | AuditLog | Admin Audit (if exposed) | Record event | immutable, actor/time/action captured |
| Berkas tidak lengkap dikembalikan untuk perbaikan | Workflow / Verification | LeaveApplication, status history | Detail Pengajuan | Return for correction | transition authorization + audit |
| Cetak form dan tanda tangan Atasan Langsung/Kepala Kantor | Document / Hybrid Workflow | LeaveApplication, Document | Form/Detail Pengajuan | Generate standard PDF / link final scan | content correctness + access control |
| Izin tidak mengurangi saldo Cuti Tahunan | Permission / Balance | PermissionRequest, LeaveBalanceTransaction | Pengajuan Izin | Preserve annual balance | balance unchanged |
| Kalender personal memuat jadwal libur dan agenda kerja | Calendar | Data source TBD | Kalender Pegawai | Calendar query | pending source/ownership decision |
| Dashboard Admin | Analytics | Employee, LeaveApplication | Dashboard Admin | Summary queries | counts match source data |
| Dashboard Pegawai | Dashboard | Employee, balances, applications | Dashboard Pegawai | User summary query | only current employee data |
| Responsive web | UI Platform | N/A | All pages | N/A | desktop/tablet/mobile checks |
| Relational database | Persistence | All entities | N/A | Data access | constraints/migrations |

## Unresolved traceability items

Belum boleh dianggap final sampai ambiguity berikut diputuskan:

- exact approval chain;
- exact status model;
- day-counting calendar;
- cancellation/restore behavior;
- registration number format;
- definition of “personel tersedia/siap gerak”;
- detail teknis file (format/ukuran, malware scan, enkripsi, dan storage); kebijakan akses privat
  Admin/owner telah resolved;
- detail autentikasi lokal (identifier, hashing, recovery, MFA, lockout, dan sesi) serta pemilihan
  provider SSO masa depan; strategi provider awal telah diputuskan pada AUTH-001;
- physical-signature versus digital-approval boundary;
- incomplete-document correction states;
- TUKIN/discipline scope and authoritative rules;
- calendar holiday/work-agenda source and ownership;
- supervisor identity and notification channel.

## Decision ID mapping for unresolved requirements

Kolom implementasi/test pada matriks di atas hanya dapat difinalkan setelah keputusan terkait di
`docs/decision-log.md` disahkan.

| Traceability concern | Decision IDs |
|---|---|
| Saldo otomatis, prioritas, N/N-1/N-2, rollback | BAL-001, BAL-002, BAL-003, BAL-004 |
| Klaim Cuti Bersama dan verifikasi Admin | BAL-005, WF-004, DOC-003 |
| Submit/approval/perbaikan/pembatalan | WF-001, WF-002, WF-003, WF-004 |
| Form, tanda tangan, PDF final, registrasi, dan arsip | DOC-001, DOC-002, DOC-003, DOC-004 |
| Izin non-cuti, TUKIN/disiplin, dan bukti jenis cuti | PERM-001, PERM-002, VAL-001 |
| Kalender cuti/libur/agenda dan hitungan hari | CAL-001, BAL-003 |
| Reminder H-2 kepada Pegawai/atasan | NOT-001, NOT-002, DATA-001 |
| Audit saldo/upload/download/export | AUD-001, DOC-002 |
| Search, PDF/Excel, dashboard, dan kesiapan | RPT-001, RPT-002, AUTH-002 |
| Authentication, owner isolation, dan master/hierarki | AUTH-001 (resolved), AUTH-002, DATA-001 |
| Relational deployment, storage, backup, dan operasi | DEP-001, DEP-002, DEP-003, DOC-003 |

DEP-001, kebijakan akses DOC-003, dan baseline backup cron DEP-002 telah resolved untuk M1. Test
fondasi harus membuktikan storage tidak publik, anonymous/direct-object access ditolak, owner
isolation ditegakkan server-side, dan rancangan backup mencakup database+dokumen serta dapat
menyalin hasil keluar lokasi data utama. Detail DR/retensi/enkripsi/restore/RPO/RTO ditelusuri pada
gate M8/production.

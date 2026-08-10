# SI CUTI - Requirement Traceability Matrix

Status: **Initial mapping**

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
| Search tanggal/jenis/nama/NIP/status | Search / Reporting | Multiple | Laporan / Arsip | Filter query | combined filters + pagination |
| Export PDF dan Excel | Reporting | Reporting view/query | Laporan | Generate export | role + content correctness |
| Kalender cuti personal | Calendar | LeaveApplication | Dashboard/Kalender Pegawai | Calendar query | only permitted events |
| Grafik penggunaan cuti | Analytics | LeaveApplication | Dashboard | Aggregate analytics | aggregate correctness |
| Reminder 2 hari sebelum aktif | Notification | Notification, LeaveApplication | Notification UI | Scheduled reminder | correct timing + no duplicate reminder |
| Audit saldo dan upload | Audit | AuditLog | Admin Audit (if exposed) | Record event | immutable, actor/time/action captured |
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
- file policy;
- authentication/SSO policy.

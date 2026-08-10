# SI CUTI - Conceptual Database Schema

Status: **Conceptual model - technology neutral**

Tujuan dokumen ini adalah menjaga struktur data konsisten sebelum memilih ORM/RDBMS spesifik.

## 1. Core entities

### User

Tujuan: akun autentikasi.

Candidate fields:

- id
- username/email/login identifier
- password hash / external identity id
- role id
- employee id (nullable bila ada akun sistem)
- active flag
- last login
- created at
- updated at

### Role

Baseline values:

- ADMIN_KEPEGAWAIAN
- PEGAWAI

Struktur dibuat extensible untuk penambahan role bila disetujui kemudian.

### Employee

Candidate fields:

- id
- NIP
- full name
- unit/work location (struktur final perlu dikonfirmasi)
- position/title
- employment metadata yang memang diperlukan aplikasi
- active status
- created at
- updated at

Jangan menyimpan atribut pribadi yang tidak dibutuhkan sistem.

### LeaveType

Baseline categories dari proposal:

- Cuti Tahunan
- Cuti Sakit
- Cuti Alasan Penting
- Cuti Besar
- Cuti Melahirkan
- CLTN

Candidate properties:

- id
- code
- name
- deducts annual balance flag
- active flag

### LeaveBalanceBucket

Mewakili sumber saldo tahunan secara eksplisit.

Candidate fields:

- id
- employee id
- leave year
- bucket type: N / N_MINUS_1 / N_MINUS_2 / JOINT_LEAVE_CLAIM
- granted days
- remaining days
- source reference
- locked flag
- created at
- updated at

Catatan: `remaining days` boleh disimpan sebagai cached state hanya jika selalu direkonsiliasi dengan ledger/transaksi.

### LeaveBalanceTransaction

Ledger perubahan saldo.

Candidate fields:

- id
- employee id
- balance bucket id
- application/claim reference
- transaction type: GRANT / DEDUCT / RESTORE / ADJUST
- quantity
- balance before
- balance after
- reason
- actor user id
- created at

### LeaveApplication

Candidate fields:

- id
- registration number
- employee id
- leave type id
- start date
- end date
- requested days
- purpose/reason where required
- current status
- submitted at
- created at
- updated at

### LeaveApplicationStatusHistory

- id
- leave application id
- from status
- to status
- actor user id
- note
- created at

### JointLeaveClaim

- id
- employee id
- claim period/date reference
- requested/granted quantity (rule must be confirmed)
- status
- submitted at
- reviewed by
- reviewed at
- created at
- updated at

### PermissionRequest

Untuk izin non-cuti.

Candidate fields:

- id
- employee id
- permission type
- date/range
- reason
- status
- created at
- updated at

### Document

- id
- owner employee id where applicable
- related entity type
- related entity id
- document type
- original filename
- stored filename/key
- MIME type
- file size
- checksum (recommended)
- uploaded by
- uploaded at

### Approval / Verification

Model final bergantung keputusan workflow.

Candidate fields:

- id
- entity type
- entity id
- step/order
- reviewer user id / role
- decision
- decision note
- decided at

Jangan mengunci multi-level approval sebelum workflow organisasi dikonfirmasi.

### Notification

- id
- user id
- type
- title
- message
- related entity reference
- read at
- created at

### AuditLog

- id
- actor user id
- action
- entity type
- entity id
- old values / diff
- new values / diff
- IP address
- user agent (recommended)
- created at

### SystemSetting

Untuk parameter yang secara sah dapat dikonfigurasi dan bukan aturan yang harus hard-coded.

- id/key
- value
- value type
- description
- updated by
- updated at

## 2. Key relationships

```text
Employee 1 --- 1? User
Role     1 --- * User
Employee 1 --- * LeaveApplication
Employee 1 --- * LeaveBalanceBucket
LeaveBalanceBucket 1 --- * LeaveBalanceTransaction
LeaveApplication 1 --- * LeaveApplicationStatusHistory
LeaveApplication 1 --- * Document
Employee 1 --- * JointLeaveClaim
Employee 1 --- * PermissionRequest
User 1 --- * AuditLog
```

## 3. Data integrity requirements

- NIP harus unik bila digunakan sebagai identifier pegawai.
- Jumlah hari tidak boleh negatif.
- Pemotongan saldo harus atomic/transactional.
- User Pegawai hanya boleh mengakses data dirinya sesuai policy.
- Dokumen harus memiliki ownership/reference yang jelas.
- Audit log tidak boleh dapat diedit oleh user normal.
- Nomor registrasi otomatis harus unik sesuai pola final.

## 4. Open decisions

- definisi unit kerja;
- pola nomor registrasi;
- exact workflow statuses;
- penyimpanan tanggal vs datetime/timezone;
- cara menghitung hari kerja;
- apakah saldo dihitung decimal atau integer day;
- retention policy dokumen dan audit;
- soft delete vs hard delete;
- identity/authentication scheme.

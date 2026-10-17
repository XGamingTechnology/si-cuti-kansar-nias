# M7 — Desain Laporan dan Ekspor PDF/Excel SI CUTI

**Status R1/R2: disetujui stakeholder melalui percakapan 17 Oktober 2026 WIB.**
R3–R5 tetap usulan ditunda, bukan lingkup implementasi fase pertama.
Base `origin/staging`: `e81b6f0261f35cf7265e27c0680b381cdb186c0b`, diperiksa 17 Oktober 2026 WIB.
PR #113 merged pada base tersebut; #110 dan #112 juga sudah merged. UAT bisnis masih tertunda.
Tidak ada bukti operator baru yang menetapkan commit ini sudah deploy. Desain awal di PR #114 masih open ketika implementasi dimulai; dokumen ini disertakan agar PR
implementasi mandiri. Tidak melakukan merge desain secara otomatis.

## 1. Sumber, keputusan dan audit kemampuan existing

AGENTS.md dan tujuh dokumen wajib diperiksa: `requirements.md`, `architecture.md`,
`database-schema.md`, `user-flows.md`, `design-system.md`, `implementation-plan.md`,
`requirement-traceability.md`. Proposal sumber
`source/Laporan-Kerangka-Inovasi-SI-CUTI-KANSAR-NIAS.pdf` halaman 5–8 menetapkan pelaporan
Admin, filter, PDF/Excel dan histori Pegawai; tidak menetapkan kontrak laporan terperinci.
`decision-log.md` masih mencatat **RPT-001 dan cakupan/akses AUD-001 belum diputuskan secara global**;
amendment M7 yang disetujui di bawah menetapkan keduanya khusus R1/R2.
Hak ekspor baru R1/R2 kini disahkan melalui keputusan stakeholder di bawah. Definisi M6 yang sudah disetujui
(`m6-dashboard-calendar-design.md`), WF-001–004, BAL, aturan klaim, DOC-003 dan kompensasi
pengembalian tetap dipakai; tidak diajukan ulang. Register historis bukan alasan membuka kembali
aturan yang sudah diamendemen dalam dokumen keputusan khusus.

| Kemampuan                                        | Path kode aktual                                                                                                                         | Dapat digunakan / batas                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autentikasi, dua role, owner policy              | `src/application/authorization/{http,policy}.ts`                                                                                         | Reuse principal dan requireAdmin; akses record sendiri tidak otomatis memberi hak ekspor massal                                                                                                   |
| Query periode, current revision, agregat, cursor | `src/infrastructure/dashboard/reader.ts`, `src/application/dashboard/contracts.ts`                                                       | JOIN nomor revisi yang dirujuk parent, overlap inklusif, distinct employee, RepeatableRead; DTO M6 tidak memuat NIP/unit sehingga perlu reader laporan tersendiri, bukan menambah PII ke kalender |
| Workflow cuti/izin                               | `src/infrastructure/workflow/prisma-workflow-repository.ts`, `src/application/workflow/{leave-service,permission-service}.ts`            | Parent status kini, revisi dan transition history tersedia; bukan query status historis akhir periode yang sudah siap                                                                             |
| Posisi saldo dan readiness                       | `src/application/leave-balance/administration.ts`, `src/infrastructure/leave-balance/prisma-annual-balance-administration-repository.ts` | `annualBalanceReadiness`, pembacaan account/counter; available adalah hasil pembacaan layanan, bukan kolom historis; tidak panggil initialize/rollover                                            |
| Klaim                                            | `src/application/joint-leave/{ports,service}.ts`, `src/infrastructure/joint-leave/prisma-repository.ts`                                  | Snapshot identitas/kebijakan, tahun kredit, status parent/per tanggal, operationId dan waktu review; parent APPROVED dapat memuat tanggal ditolak                                                 |
| Keputusan dan pengembalian                       | `src/application/leave-records/{ports,service}.ts`, `src/infrastructure/leave-records/prisma-repository.ts`                              | Arsip snapshot final, LeaveBalanceReturn immutable + kaitan operasi kompensasi; bukan tabel tanggal pemakaian aktual                                                                              |
| PDF                                              | `src/application/leave-records/decision-pdf.ts`, `public/fonts/DejaVuSans.ttf`, `package.json`                                           | pdf-lib/fontkit dan font existing; renderer laporan baru harus terpisah dari generator formulir/arsip keputusan                                                                                   |
| Excel                                            | `src/infrastructure/leave-balance/xlsx-balance-template.ts`, `src/infrastructure/employees/xlsx-workbook-reader.ts`                      | Writer OOXML existing memakai string cells dan ZIP/CRC; terbatas satu sheet/template. Reuse pola packing/escaping, bukan menyatakan sudah ada renderer laporan multi-sheet                        |
| Storage privat                                   | `src/application/ports/document-storage.ts`, `src/infrastructure/storage/local-private-storage.ts`                                       | Reuse put/read/delete dan checksum; download laporan tetap melalui server, tanpa key di DTO                                                                                                       |
| Audit domain                                     | `prisma/schema.prisma`: transition, AnnualBalanceOperation, LeaveBalanceReturn, official correction, CalendarOverlayVersion              | Bukti audit per domain tersedia. **Belum ada ReportRun/ReportAuditEvent atau layanan audit ekspor umum**; logger aplikasi bukan pengganti audit persisten                                         |
| UI                                               | `src/components/{authenticated-shell,dashboard-workspace,admin-floating-window}.tsx`, `src/components/indonesian-date.ts`                | Sidebar, dialog, format WIB dan states dapat dipakai; belum ada workspace laporan                                                                                                                 |

Audit tabel ini merekam keadaan base sebelum implementasi; realisasi M7 dijelaskan di
[m7-reporting-implementation.md](m7-reporting-implementation.md).
Audit dibatasi pada sumber data/renderer/otorisasi ini. Tidak ada akses database staging/produksi.

## 2. Satu rekomendasi fase pertama

**Implementasikan R1 Rekap Pengajuan Cuti dan R2 Rekap Izin, Admin-only, masing-masing preview,
PDF dan XLSX dari satu snapshot baca.** Kedua laporan memiliki basis periode/status yang sama
dengan M6 dan dapat dituntaskan sebagai satu task. Tidak ada report builder atau pilihan basis
tanggal dinamis pada fase ini.

R3 Posisi Saldo, R4 Klaim, R5 Pengembalian dievaluasi dan dikontrakkan di bawah sebagai rancangan
lanjutan, **tidak otomatis masuk acceptance fase pertama**. Sumbernya sudah ada, tetapi berbeda
unit dan waktu: posisi kini, peristiwa kredit, dan transaksi kompensasi. Menyatukannya dalam
“penggunaan cuti” berisiko salah makna. Laporan status historis akhir periode, saldo historis,
pemakaian aktual, TUKIN, disiplin dan kesiapan personel memerlukan kebijakan/sumber lain dan ditunda.

Selesainya coding/CI M7 nanti bukan penerimaan UAT atau bukti deployment.

## 3. Kontrak umum

Ketentuan fase pertama R1/R2 disetujui sesuai §10; kontrak R3–R5 tetap rancangan lanjutan.

- Bahasa Indonesia. Timestamp absolut memakai Asia/Jakarta dan label WIB; disimpan UTC.
  Date-only PostgreSQL DATE tetap `YYYY-MM-DD`, tidak dikonversi melalui timezone browser.
- R1/R2: `from` dan `to` inklusif, overlap `startDate <= to AND endDate >= from`.
  Rentang 1–366 hari, tahun 1900–9999. Default bulan WIB berjalan. Tidak ada filter tanggal
  submit/keputusan terselubung. Timestamp pada calon R4/R5 memakai interval setengah terbuka
  `[awal from WIB, awal hari setelah to WIB)`; akhir hari tidak dipotong pada 23:59:59.
- Status berarti **status saat snapshot laporan dibuat**, bukan status pada akhir periode filter.
  `capturedAt` diambil dari transaksi baca; label “Data dibaca … WIB”. Download kemudian juga
  menunjukkan waktu unduh, tanpa mengklaim data berubah mengikuti waktu unduh.
- Filter umum: satu employeeId opsional, pencarian nama/NIP maksimal 100 karakter, unit kerja
  sebagai nilai master exact opsional, keaktifan `all/active/inactive` default **all**.
  Filter nama/NIP/unit untuk R1/R2/R3/R5 memakai Employee kini; perubahan master setelah snapshot
  tidak mengubah output yang sudah dibekukan. Direktori/filter hanya Admin. Tidak ada wildcard SQL
  mentah; parameter binding dan escape pencarian literal `%`/`_`.
- Pegawai nonaktif tetap masuk histori default; status keaktifan adalah nilai master **saat dibaca**.
  Tidak menyimpulkan pegawai aktif/nonaktif pada masa cuti. Employee ID menjadi kunci distinct,
  bukan nama/NIP. Jenis izin nonaktif yang pernah dipakai tetap dapat dipilih dan dilaporkan.
- Maksimum **1.000 baris hasil**, sama untuk preview lengkap/PDF/XLSX; query `LIMIT 1001`, bukan
  truncation diam-diam. Jika lebih, 422 `REPORT_TOO_LARGE`, tanpa artefak; minta sempitkan filter.
  Katalog R3 kelak menghitung baris bucket, R4 baris klaim, R5 baris pengembalian.
  Batas teknis tambahan: JSON dataset 5 MiB, setiap artefak 10 MiB, PDF 100 halaman; tidak memotong
  teks/baris untuk lolos. Kegagalan memberi pesan dan tidak memublikasikan hasil sebagian.
- Urutan deterministik per laporan, tie-break ID immutable, nomor urut dihitung setelah filter.
  Preview 25 baris/page, pagination **server atas dataset beku**, bukan refetch tabel live.
- Metadata identik di preview/PDF/sheet Metadata: ID laporan internal, kode dan definitionVersion
  (`m7-operational-v1`), capturedAt WIB/UTC, filter ternormalisasi, scope, basis tanggal, basis
  identitas, rowCount dan checksum dataset. ID laporan bukan nomor surat dinas.
- Tidak ada alasan pribadi/penolakan, alamat, telepon, bukti, nomor SPRIN, source IP, referensi
  dasar yang berpotensi sensitif, dokumen, token atau storage key dalam DTO/ekspor default.
  Identitas NIP/nama/unit yang diizinkan tetap PII dan dilindungi sebagai berkas privat.

## 4. Tabel kontrak setiap laporan

Kolom ditulis **dalam urutan output**, bukan daftar kandidat. PDF menggabungkan Nama + NIP dalam
satu sel dua baris; “No.” hanya nomor urut. XLSX sheet Data memakai kolom identitas terpisah.
Semua ID UUID ditulis utuh sebagai teks di Excel. Sheet Metadata dan Ringkasan mengikuti §3/§5.

### R1 — Rekap Pengajuan Cuti (fase pertama)

| Aspek                 | Kontrak R1/R2 disetujui                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tujuan/pengguna       | Admin memeriksa pengajuan yang beririsan periode; bukan daftar absensi atau pemakaian aktual                                                                                                                                                                                                                                                                                   |
| PDF A4 landscape      | No.; Nama/NIP; Unit kerja kini; Jenis cuti; Periode penuh; Status kini; Revisi; Hari kerja tahunan (revisi); Ada pengembalian saldo                                                                                                                                                                                                                                            |
| XLSX Data             | No.; Request ID; Revision ID; Nomor revisi; Employee ID; NIP; Nama; Unit kerja kini; Keaktifan kini; Jenis cuti; Mulai; Selesai; Status kini; Diajukan pada WIB; Hari kerja tahunan (revisi); Ada pengembalian saldo                                                                                                                                                           |
| Sumber                | LeaveRequest.id/employeeId/status/currentRevisionNumber; JOIN LeaveRequestRevision pada revisionNumber yang ditunjuk parent: id/leaveType/startDate/endDate/submittedAt/calculatedWorkingDays; Employee.nip/fullName/workUnit/isActive kini; EXISTS LeaveBalanceReturn pada requestId **dan revisionId**. Tidak memakai MAX(revisionNumber), snapshot PDF, atau seluruh revisi |
| Snapshot/master       | Revisi adalah isi yang dirujuk saat pembacaan; master identitas kini, dinyatakan pada header. Snapshot keputusan tidak dicampur sebagai fallback nama historis; arsip final tetap terpisah                                                                                                                                                                                     |
| Filter tanggal/status | Periode cuti overlap inklusif. Default APPROVED. Pilihan SUBMITTED, RETURNED_FOR_CORRECTION, APPROVED, REJECTED, CANCELLED atau ALL_NON_DRAFT; DRAFT tidak diekspor. Jenis dari enam jenis cuti existing, default semua                                                                                                                                                        |
| Unit/ringkasan        | COUNT request ID; COUNT DISTINCT employeeId; count per jenis/status. Bukan hari aktual. Hari kerja tahunan per baris hanya nilai calculatedWorkingDays ANNUAL yang tersimpan; selain ANNUAL/null = “—” (Excel kosong), bukan nol. Tidak menjumlahkan kolom ini sebagai penggunaan/periode atau mengurangi dengan return                                                        |
| Kasus khusus          | Rentang lintas bulan/tahun ditampilkan penuh dan dihitung sekali, tanpa prorata. RETURNED dapat menunjuk revisi yang sedang diperbaiki; submittedAt hanya timestamp revisi tersebut, bukan submit terakhir yang ditebak dari history. Pengembalian sebagian/penuh tidak mengubah status/rentang/count; flag tidak menyatakan hari aktual                                       |
| Akses/urutan/batas    | Hak read Admin existing; preview/export laporan adalah hak baru yang diusulkan Admin-only. Urut startDate ASC, requestId ASC. Batas umum §3                                                                                                                                                                                                                                    |

### R2 — Rekap Izin (fase pertama, terpisah dari cuti)

| Aspek              | Kontrak R1/R2 disetujui                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tujuan/pengguna    | Admin merekap pengajuan izin non-cuti; tidak menghitung TUKIN/disiplin                                                                                                                                                                                                                                               |
| PDF A4 landscape   | No.; Nama/NIP; Unit kerja kini; Jenis izin; Periode penuh; Status kini; Revisi                                                                                                                                                                                                                                       |
| XLSX Data          | No.; Request ID; Revision ID; Nomor revisi; Employee ID; NIP; Nama; Unit kerja kini; Keaktifan kini; Kode jenis izin; Nama jenis izin kini; Mulai; Selesai; Status kini; Diajukan pada WIB                                                                                                                           |
| Sumber/identitas   | PermissionRequest.id/employeeId/status/currentRevisionNumber JOIN PermissionRequestRevision.id/permissionTypeId/startDate/endDate/submittedAt dengan currentRevisionNumber; PermissionType.code/name kini; Employee master kini. Semua label dibekukan pada snapshot laporan, bukan klaim label historis saat submit |
| Filter/status      | Overlap periode izin, default APPROVED; status dan non-draf sama R1. permissionTypeId opsional; termasuk jenis nonaktif yang pernah dipakai                                                                                                                                                                          |
| Unit/kasus         | Pengajuan dan pegawai unik; **tanpa kolom jumlah hari** karena belum ada durasi izin otoritatif pada revisi. Lintas tahun satu record/rentang penuh, revisi hanya pointer parent, nonaktif tetap termasuk. REJECTED/CANCELLED/RETURNED tidak menjadi izin disetujui. Tidak ikut pengembalian saldo tahunan           |
| Akses/urutan/batas | Usulan Admin-only preview/export; read record owner existing tetap ada tanpa hak laporan baru. startDate ASC, requestId ASC; batas §3                                                                                                                                                                                |

### R3 — Posisi Saldo Tahunan (ditunda)

| Aspek              | Kontrak calon implementasi berikutnya                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tujuan/pengguna    | Admin rekonsiliasi posisi account pada tahun entitlement terpilih **saat dibaca**, bukan saldo akhir tahun historis                                                                                                                                                                                                                                |
| PDF A4 landscape   | No.; Nama/NIP; Keaktifan kini; Tahun saldo; Readiness; Bucket; Hak diberikan; Direservasi; Dikomit; Tersedia                                                                                                                                                                                                                                       |
| XLSX Data          | No.; Employee ID; NIP; Nama; Unit kerja kini; Keaktifan kini; Tahun saldo; Readiness; Bucket; Hak diberikan; Direservasi; Dikomit; Tersedia                                                                                                                                                                                                        |
| Sumber             | Employee master kini LEFT JOIN AnnualBalanceAccount lewat employeeId/entitlementYear; bucket/grantedDays/reservedDays/committedDays; available dan readiness melalui semantik pembacaan existing `findAccounts`/`annualBalanceReadiness`, dalam transaksi baca yang sama. Tidak membaca endpoint per pegawai dalam transaksi terpisah              |
| Filter/default     | entitlementYear wajib, default tahun WIB kini; tidak menerima from/to/asOf historis. Readiness ALL default, pilihan INITIALIZED/PARTIAL/UNINITIALIZED. Empat bucket urutan N, N1, N2, JOINT_LEAVE_CLAIM                                                                                                                                            |
| Unit/null          | Empat baris per pegawai, termasuk placeholder bucket hilang. INITIALIZED menampilkan counter layanan. Untuk PARTIAL/UNINITIALIZED semua kolom angka ekspor “—”/kosong, tidak disulap menjadi nol atau diperbaiki. Ringkasan pegawai unik per readiness; subtotal numerik hanya account set INITIALIZED dan ditandai tidak mencakup yang belum siap |
| Kasus              | Account tahun lama adalah posisi **kini untuk entitlementYear itu**, dapat mencerminkan pengembalian belakangan. Return sudah masuk counter; tidak ditambahkan lagi. Tidak melakukan init/rollover/mutation; Klaim Cuti Bersama terpisah dari cap regular existing                                                                                 |
| Akses/urutan/batas | Admin-only diusulkan. nip ASC, employeeId ASC, urutan bucket tetap; 1.000 baris = paling banyak 250 pegawai lengkap, tanpa memotong set bucket. Pegawai nonaktif termasuk                                                                                                                                                                          |

### R4 — Rekap Klaim Cuti Bersama (ditunda)

| Aspek                        | Kontrak calon implementasi berikutnya                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tujuan/pengguna              | Admin menelusuri permohonan/kredit klaim; klaim bukan bukti sedang cuti                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PDF A4 landscape             | No.; Nama/NIP snapshot; Tahun kredit; Status klaim kini; Diajukan WIB; Diputuskan WIB; Tanggal klaim + status per tanggal; Hari dikreditkan                                                                                                                                                                                                                                                                                                                                              |
| XLSX Data                    | No.; Claim ID; Employee ID; NIP snapshot; Nama snapshot; Keaktifan master kini; Policy ID; Nama kebijakan snapshot; Tahun kredit; Status klaim kini; Diajukan WIB; Diputuskan WIB; Tanggal PENDING; Tanggal APPROVED; Tanggal REJECTED; Hari dikreditkan                                                                                                                                                                                                                                 |
| Sumber                       | JointLeaveClaim.id/employeeId/employeeNameSnapshot/employeeNipSnapshot/policySnapshot/creditYear/status/submittedAt/reviewedAt; JointLeaveClaimDate.eventDate/status/operationId; SUM AnnualBalanceOperation.days atas operationId unik yang dirujuk tanggal APPROVED. Nama kebijakan dari policySnapshot, bukan policy aktif terbaru; tidak membaca evidence/reason/title/sprinNumber                                                                                                   |
| Filter/default               | Basis tetap submittedAt dalam rentang WIB inklusif-hari §3; creditYear opsional terpisah. Default APPROVED; pilihan SUBMITTED/APPROVED/REJECTED/ALL. Tidak diam-diam memakai tanggal libur atau tanggal kredit. Pencarian nama/NIP di sini memakai snapshot klaim; filter unit jika kelak tersedia harus berlabel master kini                                                                                                                                                            |
| Unit/kasus                   | Satu baris per claimId, tanggal tiap kategori diurutkan dan disimpan sebagai daftar teks ISO, bukan baris join yang menggandakan klaim. Count klaim dan pegawai unik; hari kredit = operasi GRANT terhubung unik, bukan jumlah parent APPROVED. Jika link tidak konsisten, angka kosong dan data ditandai perlu diperiksa, tidak ditebak. Parent APPROVED dapat parsial. Retry ID sama sekali hitung; klaim baru setelah penolakan adalah ID lain, kredit tetap menurut operationId unik |
| Lintas tahun/nonaktif/return | submittedAt, eventDate dan creditYear berbeda, ditampilkan tanpa saling mengganti. Nonaktif tetap masuk; tidak mengubah snapshot identitas. Pengembalian cuti yang bersumber bucket klaim tidak mengurangi ulang nilai kredit klaim historis                                                                                                                                                                                                                                             |
| Akses/urutan/batas           | Usulan Admin-only. submittedAt ASC, claimId ASC; batas §3 dan tambahan 5 MiB menangani daftar tanggal panjang tanpa truncation. Periode review/ledger-kredit sebagai laporan tersendiri membutuhkan keputusan berikutnya                                                                                                                                                                                                                                                                 |

### R5 — Rekap Pengembalian Saldo (ditunda)

| Aspek                        | Kontrak calon implementasi berikutnya                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tujuan/pengguna              | Admin memeriksa transaksi kompensasi terpisah dari persetujuan dan pemakaian aktual                                                                                                                                                                                                                                                                                                                                    |
| PDF A4 landscape             | No.; Nama/NIP kini; Request ID; Revisi; Tahun saldo; Dicatat WIB; Hari dikembalikan; Alokasi bucket                                                                                                                                                                                                                                                                                                                    |
| XLSX Data                    | No.; Return ID; Request ID; Revision ID; Nomor revisi; Employee ID; NIP kini; Nama kini; Unit kerja kini; Keaktifan kini; Tahun saldo; Dicatat WIB; Hari dikembalikan; Alokasi N; Alokasi N1; Alokasi N2; Alokasi Klaim Cuti Bersama                                                                                                                                                                                   |
| Sumber/snapshot              | LeaveBalanceReturn.id/leaveRequestId/revisionId/entitlementYear/recordedAt/restoredDays; revisi terikat dan parent employeeId; Employee master kini. Alokasi dari snapshot.allocations immutable, diverifikasi terhadap LeaveBalanceReturnOperation/AnnualBalanceOperation kompensasi tanpa menjumlahkan kedua representasi. Tidak mengambil alasan/bukti/basisReference                                               |
| Filter/default               | Basis tetap recordedAt WIB; entitlementYear opsional. Tidak ada filter status baru: seluruh transaksi return sah yang tercatat; request tetap APPROVED. Bukan basisDate/tanggal cuti                                                                                                                                                                                                                                   |
| Unit/kasus                   | Satu baris per returnId; jumlah transaksi, pegawai unik dan SUM restoredDays sekali per return. Beberapa operasi bucket pada satu return tidak menggandakan hari; jangan SUM snapshot.originalCommittedDays yang berulang. SUM alokasi per baris harus sama restoredDays atau ditandai tidak konsisten/angka kosong. Pengembalian sebagian/penuh sama-sama kompensasi; tidak menyimpulkan tanggal mana tidak digunakan |
| Lintas tahun/revisi/nonaktif | Filter waktu pencatatan dapat mencakup kompensasi entitlementYear lama. Ikuti **revisionId milik return**, bukan currentRevisionNumber untuk mengganti sumber historis. Nonaktif termasuk. Tidak mengubah status/rentang asli atau mengkredit ulang counter                                                                                                                                                            |
| Akses/urutan/batas           | Usulan Admin-only, recordedAt ASC, returnId ASC; batas §3                                                                                                                                                                                                                                                                                                                                                              |

R3–R5 belum menjadi endpoint/tombol tersembunyi dalam fase pertama; kontrak di atas memerlukan
konfirmasi ketika dimasukkan ke task lanjutan. Tidak perlu meminta stakeholder memutuskan kolomnya
sekarang untuk membuka R1/R2.

## 5. Layout dan contoh sintetis

PDF R1 landscape A4: margin 12 mm, font DejaVu Sans 9 pt (jangan dikecilkan untuk memuat kolom),
header tabel diulang, teks wrap dan tinggi baris mengikuti isi, baris tidak terpotong antarhalaman.
Alokasi lebar konten 273 mm: No 10; Nama/NIP 51; Unit 27; Jenis 30; Periode 43; Status 34;
Revisi 16; Hari 30; Pengembalian 32 (penyesuaian teknis agar header tidak terpecah pada font 9 pt). R2 landscape: 10/52/38/40/55/56/22 mm.
Jika satu baris melampaui halaman, gagal dengan pesan agar filter/teks ditinjau; jangan menghilangkan isi.
R3–R5 juga landscape sesuai kolom; hanya R1/R2 yang dirender fase pertama.

```text
SI CUTI — Kantor Pencarian dan Pertolongan Kelas B Nias
REKAP PENGAJUAN CUTI                     Laporan administratif • bukan surat keputusan
Periode: 1–31 Oktober 2026 • Basis: periode cuti beririsan • Status: Disetujui
Pegawai: Semua • Unit: Semua • Keaktifan: Semua • Identitas: master saat dibaca
Data dibaca: 17 Oktober 2026 pukul 10.00 WIB • Definisi m7-operational-v1

No Nama / NIP sintetis  Unit kini  Jenis     Periode penuh         Status     Rev Hari* Kembali
1  Pegawai Uji A         Unit Uji   Tahunan   28 Sep–2 Okt 2026     Disetujui   2    5   Ada
   UJI-000000000000001
2  Pegawai Uji A         Unit Uji   Sakit     30 Okt–3 Nov 2026     Disetujui   1    —   Tidak
   UJI-000000000000001

2 pengajuan • 1 pegawai unik • 1 pengajuan memiliki pengembalian saldo
* Hari kerja tahunan tersimpan untuk seluruh revisi, bukan hari aktual/periode filter.
Periode persetujuan tetap ditampilkan setelah pengembalian. Tanggal penggunaan aktual tidak ditentukan.
ID laporan internal: [UUID] • Dicetak dari snapshot yang sama • Halaman 1 dari 1
```

Contoh R2: `Pegawai Uji B / UJI-000000000000002 | Unit Uji | Izin Uji | 15–16 Oktober 2026 |
Disetujui | revisi 1`; tidak ada saldo/hari potongan. Contoh R3: `Uji A | 2026 | N |
INITIALIZED | diberikan 12 | direservasi 2 | dikomit 3 | tersedia 7`; R3 PARTIAL menampilkan
empat baris bucket dengan angka kosong. R4: `Klaim-Uji | creditYear 2026 | APPROVED |
tanggal disetujui 2026-10-01; ditolak 2026-10-02 | dikreditkan 1 hari` (nilai sintetis dari operasi,
bukan ketetapan kuota pemerintah). R5: `Return-Uji | revisi 2 | entitlementYear 2026 |
dicatat 17 Oktober 2026 | 2 hari | N:1, Klaim:1`; tidak ada tanggal penggunaan yang ditebak.

XLSX memiliki tiga sheet: **Metadata**, **Data**, **Ringkasan**. R1/R2 Ringkasan memuat total
pengajuan, pegawai unik, count per jenis/status; R1 tambahan jumlah request dengan flag return.
Tidak ada total “hari digunakan”. Autofilter, freeze header, wrap, lebar kolom dan print area.
NIP/UUID/kode/teks bertipe OOXML string, termasuk NIP 18 digit dan awalan nol; jangan numeric casting.
Tanggal DATE dan timestamp ditulis **teks ISO konsisten** (`2026-10-15`,
`2026-10-17T10:00:00+07:00`) dengan tipe didokumentasikan di Metadata; PDF memakai format Indonesia.
Hitungan adalah numeric cells integer, null kosong, boolean label Ya/Tidak; tidak ada formula subtotal.
Sel input pengguna termasuk `=`, `+`, `-`, `@`, whitespace/tab/CR sebelum formula selalu string,
XML-escaped, tanpa `<f>`, hyperlink otomatis, macro atau external link. Jangan memakai CSV berlabel XLSX.

## 6. API, query dan snapshot konsisten (usulan implementasi)

Semua endpoint **baru yang diusulkan**, belum tersedia; hanya R1/R2:

| Endpoint                                          | Kontrak                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/api/reports/runs`                          | Body strict `{reportCode: LEAVE_REQUESTS atau PERMISSION_REQUESTS, from, to, status, type?, employeeId?, search?, workUnit?, activeState?, idempotencyKey}`; validasi role dahulu, lalu filter. Materialisasi satu snapshot; 201 ready dengan ID, metadata, ringkasan, firstPage 25 dan cursor |
| GET `/api/reports/runs/:id?cursor=…&limit=25`     | Preview beku; limit 1–100, cursor terikat run dan identitas pembuat, server authorization diulang                                                                                                                                                                                              |
| POST `/api/reports/runs/:id/exports`              | `{format: PDF atau XLSX, idempotencyKey}`; render dari dataset run yang sama, bukan query live; 201/200 artifact metadata tanpa storage key. Tidak menerima filter baru                                                                                                                        |
| GET `/api/reports/runs/:id/artifacts/:artifactId` | Stream privat setelah sesi, role dan owner-run check serta audit tersimpan; Content-Disposition aman, no-store, nosniff                                                                                                                                                                        |

Metadata run selalu mengembalikan filter efektif agar frontend tidak membandingkan label filter
baru dengan hasil lama. 401 sesi tidak valid; 403 role/run bukan milik pembuat; 404 ID tidak ada;
410 expired; 422 filter/batas; 409 retry key dipakai payload berbeda; 503 query/render/storage/audit
unavailable. Ulangi key sama = run/artefak yang sama, tanpa menciptakan hasil baru dengan timestamp lain.
Tidak menyediakan query `asOf` historis, format bebas atau fallback ke data yang tidak dibatasi.

Arsitektur calon: `application/reporting` (schema, izin, orkestrasi, DTO, definisi versi),
`infrastructure/reporting` (reader terparameter, snapshot repository, PDF/XLSX renderer), route tipis,
`components/reporting-workspace`. UI tidak menghitung ulang saldo/count atau menyusun file.

1. Authenticate + requireAdmin + otorisasi reportCode; retry key terikat actor/filter/versi.
2. Dalam **satu transaksi PostgreSQL read-only RepeatableRead**, ambil capturedAt, parent + current
   revision, label master, readiness jika laporan terkait kelak, dan subquery EXISTS return. Limit
   1001 dan timeout statement 10 detik. Scope diterapkan sebelum join/count. Agregat dihitung dari
   baris yang sama; hitung distinct employeeId, bukan baris Excel atau join return. Tidak mengunci
   workflow untuk update dan tidak memanggil layanan mutasi. Query laporan tidak memakai daftar
   workflow tak berhalaman lalu menggabungkannya di browser.
3. Bentuk dataset allowlist immutable yang bounded di memori; tutup transaksi sebelum render/file
   IO. Simpan JSON kanonik di storage privat, checksum dan manifest run; audit READY harus durable
   sebelum run bisa diakses. Gagal salah satu: run tidak dipublikasikan, file yatim dibersihkan.
4. Preview dan kedua renderer hanya membaca dataset run tersebut. Perubahan status/revisi/master/
   return setelahnya tidak memengaruhi run; tombol “Buat laporan baru” menghasilkan run baru.
   Dua request terpisah tanpa runId **tidak** dijanjikan snapshot identik. Renderer version + checksum
   dipin; retry format sama mengembalikan artefak yang sudah selesai. Temp artifact tidak dapat
   diunduh sampai checksum/ukuran dan audit READY terkomit; duplicate request tidak mengubah domain.
5. Usulan masa akses dataset/artefak **24 jam**, lewat itu 410; purger operasional setiap 10 menit menghapus
   file paling lambat 48 jam sejak dibuat (batas fisik berbeda dari expiry akses). Audit metadata
   tidak ikut dihapus oleh purger artefak. Jangan menyimpan laporan di public/ atau URL anonim.

**Kebutuhan persistence baru pada task implementasi, bukan perubahan task desain ini:** manifest
ReportRun (actor, versi, filter, capturedAt, expiry, rowCount, checksum, pointer privat), metadata
ReportArtifact, dan append-only ReportAuditEvent. Belum ada tabel tersebut. Usulkan satu migration
forward baru ketika desain disetujui; jangan mengubah migration lama/domain. Manifest menyimpan
minimal data, dataset lengkap hanya di file privat. State publik dibaca dari event/manifest readiness;
metadata dataset immutable, pembersihan artefak dicatat terpisah. PostgreSQL/storage tidak memiliki
transaksi lintas resource: publikasi metadata atomik + cleanup file yatim adalah mekanismenya,
bukan klaim file/DB commit atomik. Tidak perlu queue/worker render/job email untuk skala fase ini;
render sinkron dibatasi 20 detik/format, maksimal satu generate aktif per actor, lainnya 429.
Artefak format lain yang sudah selesai tetap sah jika format berikutnya gagal; tidak ada file parsial
yang dipublikasikan dan dataset run tidak berubah. Retry memakai run yang sama.

PDF reuse pdf-lib/fontkit/font existing dengan renderer tabel baru; tidak memanggil generator
keputusan atau menempel tanda tangan/cap/nomor surat. XLSX reuse primitive ZIP/XML string-cell
existing melalui helper teruji terpisah tanpa mengubah kontrak template impor. Multi-sheet/style
baru belum tersedia; uji interoperabilitas Excel/LibreOffice sebelum memutuskan dependency.
Default tidak menambah dependency; kebutuhan nyata yang terbukti dibahas pada task coding.

## 7. Matriks akses dan audit

| Aksi                                             | Admin existing                    | Pegawai existing                    | Usulan hak M7 fase pertama                                                               |
| ------------------------------------------------ | --------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Baca workflow/saldo/klaim/dokumen                | Sesuai policy modul               | Owner-only                          | Tidak berubah                                                                            |
| Preview/generate R1/R2                           | Belum ada hak/endpoint laporan    | Belum ada hak laporan               | Admin-only, seluruh scope administratif; Pegawai 403                                     |
| Baca run / unduh artefak                         | Belum ada objek laporan           | Tidak ada                           | Hanya Admin pembuat run yang masih aktif/terautentikasi; Admin lain 403                  |
| Membaca audit laporan                            | Belum ada permission UI umum      | Tidak ada                           | Tidak ada UI audit pada fase ini; akses operator terbatas melalui prosedur yang disahkan |
| Ekspor pribadi / kirim ke pimpinan / public link | Tidak tersedia sebagai kontrak M7 | Read owner bukan hak ekspor laporan | Ditunda; tidak memberi role atau penerima baru                                           |

Server memeriksa sesi/keaktifan/role kembali pada setiap page/download, bukan mengandalkan runId,
UI tersembunyi, cursor, signed URL, atau role di request. Demotion/deaktivasi langsung memblokir
run lama. NIP tidak pernah menjadi kunci otorisasi. Default deny untuk role baru.

Usulan audit durable append-only: actorUserId, role saat aksi, occurredAt UTC (tampilan WIB),
correlationId, sourceIp hanya dari mekanisme proxy tepercaya (null jika tidak tersedia, bukan header client bebas), reportCode/definitionVersion/runId, filter ternormalisasi, format (null untuk preview),
resultCode/status, rowCount (null jika belum diketahui), dataset checksum dan artifact checksum jika
tersedia. Search nama/NIP di filter **tidak** disimpan mentah dalam audit/log: simpan keyed digest
untuk korelasi + indikator filter terpasang; employeeId/unit/status/tanggal ternormalisasi dapat
disimpan dalam audit terbatas. Raw filter ber-PII hanya pada dataset file privat dengan akses 24 jam (SQL manifest menyimpan filter teredaksi).
Jangan serialize principal/DTO/body/stack dengan payload ke Pino.

Event: RUN_REQUESTED, RUN_READY/FAILED/REJECTED, PREVIEW_READ, EXPORT_REQUESTED,
EXPORT_READY/FAILED, DOWNLOAD_AUTHORIZED, CLEANUP. RowCount menyatakan seluruh dataset,
bukan isi page. Audit failure sebelum publikasi/stream = **fail closed 503**; client abort bukan
bukti file diterima. DOWNLOAD_AUTHORIZED berarti server mengizinkan dan mulai melayani, bukan
klaim file dibaca/disimpan penerima; catat STREAM_FAILED bila terdeteksi tanpa menjamin delivery.
403 untuk user terautentikasi diaudit minimal tanpa membocorkan objek; 401 memakai kontrol keamanan
existing tanpa mencatat cookie/token. DB aplikasi tidak boleh update/delete event audit normal.
Tidak mengklaim WORM/anti-tamper absolut dari append-only DB.

Retensi audit M7 **90 hari** disetujui, akses operator administratif terbatas, tanpa UI audit umum;
mekanisme purge terotorisasi terpisah dari role aplikasi biasa. Ini amendment AUD-001 khusus M7 yang
sudah disahkan, bukan anggapan retensi seluruh histori/arsip domain menjadi 90 hari.

## 8. UI

Menu Admin **Laporan** mengikuti sidebar/nav existing. Tab Cuti dan Izin terpisah. Filter periode,
jenis/status/pegawai/unit/keaktifan; default APPROVED dan seluruh pegawai termasuk nonaktif.
Keterangan tetap: periode beririsan, status kini saat dibaca, identitas master kini. Tombol
“Buat pratinjau” membekukan run; setelahnya “Unduh PDF” / “Unduh Excel” memakai run yang sama.
Filter diedit = hasil lama ditandai tidak sesuai filter, tombol ekspor dinonaktifkan sampai run baru;
tidak mencampur request asynchronous. Saat return flag dibuka tampil penjelasan M6 yang sudah disetujui.

Preview loading, error/retry, 0 hasil, batas terlampaui, expired dan audit unavailable dibedakan.
0 hasil dapat menghasilkan laporan kosong dengan header/filter/ringkasan 0 dan kalimat “Tidak ada
pengajuan sesuai filter”; tidak berarti saldo nol atau tidak ada aktivitas di luar filter.
Pagination 25 baris server, hanya metadata/allowlist page; desktop tabel, mobile kartu ringkas/form
filter dialog existing, heading/label, keyboard/Escape/focus restoration, no overflow dan live status.
Disable double-submit, retain retry key saat respons tidak pasti, abort/sequence untuk respons lama.
Tidak ada tab Pegawai M7, reminder, ekspor otomatis atau report PDF yang dianggap surat keputusan.

## 9. Acceptance criteria dan pengujian implementasi

1. PostgreSQL disposable: R1/R2 currentRevisionNumber eksplisit dengan revisi lebih tinggi yang
   **tidak dirujuk**; tidak ada double count. Query periode lintas bulan/tahun inklusif, termasuk
   hanya bersentuhan tanggal batas; request penuh tetap ditampilkan. Dua request pegawai sama = dua
   pengajuan, satu pegawai unik. Seluruh default/status termasuk REJECTED/RETURNED/CANCELLED/izin
   nonaktif diuji; DRAFT ditolak oleh filter laporan, tanpa mengubah akses workflow owner.
2. Unit/HTTP: role Admin/Pegawai/anonymous, Admin A/B, pemalsuan owner/format/cursor/filter,
   deaktivasi/demotion setelah run; DTO/file tidak mengandung alasan/alamat/telepon/bukti/key/IP.
   Daftar employee/filter tidak bocor pada Pegawai. Semua endpoint fail closed.
3. Snapshot integration: ubah master/status/current pointer/return di transaksi konkuren antara
   preview dan PDF/XLSX; kedua artefak tetap dataset/checksum/count sama, run baru mencerminkan
   perubahan. CapturedAt, filter, identitas, versi renderer terpin. Tidak menyatakan snapshot ini
   sebagai status historis akhir periode. Rendering/file IO tidak menahan transaksi baca.
4. Return parsial/penuh dan beberapa return/operasi pada request sama: flag satu boolean, status
   tetap APPROVED/rentang utuh/count tidak berkurang; angka workingDays tersimpan tidak dinamai
   pemakaian aktual dan tidak diprorata. Tidak ada penjumlahan saldo/return di UI.
5. Validasi: 1/366/367 hari, invalid calendar date, from > to, tahun batas, leap day; 1000/1001 baris,
   byte/page/timeout limit, pagination stabil/total benar/empty. Untuk laporan timestamp calon
   R4/R5 uji 16:59:59.999/17:00 UTC dan akhir rentang setengah terbuka WIB; bukan gate coding R1/R2.
6. PDF render test dan inspeksi visual A4: panjang nama/unit, Indonesian font, wrap, header berulang,
   footer Halaman x/y, teks tidak terpotong, dokumen kosong dan maksimum. Tidak ada pengesahan palsu.
   XLSX unzip/reader: 18 digit/awalan nol tetap string, DATE/TIMESTAMP ISO, null vs angka 0,
   numeric counts, formula injection `= + - @` dengan tab/CR/whitespace, XML metacharacters,
   multi-sheet/style/header sesuai; tidak ada formula/external relationship/macro. Buka Excel/
   LibreOffice jika fasilitas ada dan laporkan bila belum dilakukan.
7. Audit/persistence: sukses/gagal/rejected/format/rowCount, retry/concurrency, actor binding,
   rollback metadata, orphan cleanup, expiry 24 jam dan purge maksimal 48 jam, audit 90 hari setelah
   disetujui. Inject kegagalan audit/storage/renderer; tidak ada file tanpa otorisasi/audit READY,
   no content sensitif di log, unduh terputus tidak diberi status “diterima”.
8. No-mutation integration: bandingkan saldo/operasi/workflow/revisi/klaim/return/arsip/
   WorkingCalendarException sebelum-sesudah preview/export/download; identik. Hanya storage dan
   manifest/audit laporan baru bertambah. R3–R5 tidak diselundupkan ke fase pertama.
9. Browser desktop/tablet/mobile: filter, run baru/expired, empty/error/retry, PDF/XLSX run sama,
   respons lambat/double-click, pagination server, keyboard/Escape/fokus. Bedakan interception
   dengan sesi/API/database nyata; data sintetis saja. UAT bisnis menilai makna kolom dan contoh
   angka terpisah dari CI. Lint/typecheck/test relevan/build untuk task coding nanti.

**Verifikasi task dokumen ini:** review silang sumber/kode, Prettier dokumen, `git diff --check` dan
pemeriksaan diff hanya satu Markdown. Tidak menjalankan seluruh tes aplikasi atau mengklaim
renderer/API yang diusulkan sudah diuji. Tidak merge/deploy/menutup issue.

## 10. Keputusan stakeholder disetujui — 17 Oktober 2026 WIB

Empat paket berikut **disetujui** oleh stakeholder melalui percakapan 17 Oktober 2026 WIB,
beserta klarifikasi berikut (bukan usulan yang masih menunggu jawaban):

1. R1/R2 dan kolom sesuai desain; R3–R5 ditunda.
2. Admin-only; run, preview dan artefak hanya Admin pembuat dengan sesi/role aktif.
3. Audit durable wajib sebelum hasil/unduhan; metadata audit M7 90 hari.
4. Akses snapshot/artefak 24 jam; dataset dan berkas sementara aktif dihapus maksimal 48 jam.
5. Batas 48 jam **tidak menjamin penghapusan backup**; cakupan/retensi backup didokumentasikan terpisah.
6. Tidak mengubah retensi pengajuan, ledger, bukti, histori koreksi atau PDF keputusan final.

Tabel berikut merekam default yang disetujui, bukan membuka ulang keputusan. R3–R5 tetap backlog.

| Keputusan terbuka                               | Satu rekomendasi default                                                                                                                                       | Alasan                                                                                                       | Dampak alternatif                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M7-SCOPE / RPT-001: katalog dan semantik ekspor | Setujui R1/R2 saja, periode overlap, APPROVED default/non-draf opsional, status saat snapshot, identitas master kini, kolom tepat §4 dan tanpa total pemakaian | Reuse makna M6 yang sudah disetujui; persetujuan ini untuk penerapannya pada laporan, bukan membuka ulang M6 | Menambah saldo/klaim/return perlu aktivasi kontrak masing-masing; status akhir periode/identitas historis perlu query dan sumber historis terpisah     |
| M7-ACCESS / RPT-001: penerima ekspor baru       | Admin-only; run/artefak hanya pembuat; NIP/nama/unit minimal sesuai kontrak, Pegawai tetap read owner existing                                                 | Ekspor organisasi meningkatkan risiko distribusi; tidak menyamakan read dengan bulk export                   | Ekspor pribadi memerlukan scope owner di seluruh query/artefak/test; akses Admin lain atau pimpinan memerlukan permission/transfer audit baru          |
| M7-AUDIT / AUD-001: cakupan, akses dan retensi  | Event §7 untuk preview/generate/download/gagal, fail closed, metadata minimal, audit 90 hari, hanya operator terbatas tanpa UI audit umum                      | Jejak ekspor faktual tanpa menyimpan isi sensitif; kegagalan pencatatan tidak membiarkan unduhan tanpa jejak | Retensi lebih lama menambah kewajiban storage/privacy; audit best-effort menurunkan ketertelusuran dan tidak memenuhi rekomendasi fase ini             |
| M7-LIFETIME: snapshot/berkas laporan            | Akses 24 jam, purge fisik maksimal 48 jam; laporan administratif tanpa tanda tangan/cap/nomor surat                                                            | PDF/XLSX konsisten tanpa menjadikan laporan temporer arsip keputusan baru                                    | Arsip permanen memerlukan kebijakan retensi, akses/versi dan kapasitas; tanpa snapshot lintas format tidak dapat menjamin identik setelah data berubah |

Batas 1.000 baris, 366 hari, preview 25 dan renderer bounded merupakan default teknis untuk diuji
pada skala proposal 93 pegawai, bukan kuota/hak cuti atau keputusan bisnis baru. Tidak perlu membuka
kembali rule saldo, approval, eligibility, hari kerja, identitas atasan atau koreksi Pejabat Cuti.
Berdasarkan empat paket yang sudah disetujui, implementasikan R1/R2 berikut snapshot, audit, renderer, UI, migration
forward yang diperlukan dan seluruh gate sebagai **satu task fitur lengkap**; rollout/UAT tetap gate
tersendiri dengan bukti operator.

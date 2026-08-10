# SI CUTI - Product and Technical Review

Status: **M0 decision review updated; M1 policy gate satisfied**
Review date: **10 August 2026**

## 1. Review scope and method

Review membandingkan seluruh 10 halaman PDF sumber, termasuk teks, flowchart, mockup Dashboard
Admin/Pegawai, dan gambar timeline, terhadap seluruh dokumen turunan. Mockup diperlakukan sebagai
arah visual/contoh, bukan sebagai sumber rule atau data pegawai.

## 2. Requirements already covered

Dokumen turunan telah mencakup tujuan otomatisasi saldo, arsip digital, dashboard keputusan, konteks
kesiapsiagaan SAR, cakupan 93 pegawai, aplikasi web responsif, modularitas, RDBMS, dua role utama,
dan pembatasan akses berbasis role. Modul inti untuk profil/master pegawai, pengajuan cuti dan izin,
Klaim Cuti Bersama, verifikasi, arsip, kalender, reporting, analitik, notifikasi, audit, dan konfigurasi
juga sudah dipetakan.

Aturan saldo yang tertulis di PDF telah tercakup: Cuti N 12 hari; carry-over N-1 dengan batas 6 hari;
kondisi tidak mengambil Cuti Tahunan selama dua tahun untuk Cuti N-1 dan Cuti N-2; klaim yang
disetujui Admin; total empat bucket; prioritas Klaim Cuti Bersama -> Cuti N-2 -> Cuti N-1 -> Cuti N;
serta pengecualian pemotongan untuk Cuti Sakit, CAP, Cuti Besar, Cuti Melahirkan, dan CLTN.

Pencarian multi-parameter, nomor registrasi otomatis, ekspor PDF/Excel, kalender, grafik, reminder
H-2, metadata audit, validasi otomatis, dashboard terpisah, serta histori/download arsip juga sudah
terwakili. Arsitektur konseptual konsisten dengan PDF dan dengan aturan repository: authorization di
server, domain saldo terisolasi, ledger dan transaksi atomik, abstraksi document storage, dan audit.

## 3. Gaps found and added to derived documents

Review gambar menemukan detail yang sebelumnya belum dinyatakan secara memadai:

1. hybrid workflow mencetak form, memperoleh tanda tangan Atasan Langsung/Kepala Kantor, lalu
   menyerahkan dokumen kepada Admin;
2. Admin memvalidasi kelengkapan dan mengembalikan berkas yang belum lengkap untuk perbaikan;
3. flowchart menempatkan pengurangan saldo Cuti Tahunan setelah berkas lengkap, walau titik transaksi
   final masih ambigu;
4. flow izin mencetak form, meminta tanda tangan Atasan Langsung, dan menyerahkannya ke Admin;
5. izin dinyatakan tidak mengurangi saldo Cuti Tahunan; catatan TUKIN/disiplin ditandai belum siap
   menjadi otomasi;
6. reminder ditujukan kepada Pegawai dan atasan;
7. kalender personal disebut memuat jadwal libur dan agenda kerja;
8. syarat/contoh untuk Cuti Sakit, CAP, Cuti Besar, dan Cuti Melahirkan dicatat tanpa mengubahnya
   menjadi rule deterministik;
9. timeline sumber Juli-November dicatat dan dibedakan dari milestone dependency rekayasa.

Perubahan tersebut ditambahkan ke requirements, user flows, traceability, dan implementation plan.

## 4. Conflicts and internal consistency findings

Tidak ditemukan konflik langsung yang mengharuskan memilih antara PDF dan dokumen turunan.
Namun, flow sebelumnya menulis "Simpan draft" seolah requirement; PDF tidak menyatakannya. Opsi
tersebut kini ditandai sebagai rekomendasi yang belum dikonfirmasi.

Ada potensi salah tafsir pada N-1: PDF memakai "minimal 6" dan "maksimal 6", sehingga nilai tepat
6 masuk kedua cabang, tetapi keduanya menghasilkan 6 hari. Rumus selain kasus ini, masa berlaku,
dan proses pergantian tahun tetap belum deterministik.

Contoh nama, NIP, angka dashboard, tahun/tanggal, dan pesan "paling lambat 3 hari kerja" pada mockup
tidak dinyatakan sebagai requirement naratif. Semuanya tidak boleh disalin sebagai data demo atau
rule tanpa persetujuan.

## 5. Ambiguities requiring decisions

Keputusan manusia diperlukan sebelum milestone terkait:

- approval chain dan batas proses fisik versus approval/tanda tangan digital;
- status final, status berkas tidak lengkap, hak edit/reject/cancel, dan siklus perbaikan;
- titik pemotongan, pembatalan, koreksi, dan restore saldo;
- penghitungan hari, overlap, retroaktif, perpanjangan, dan carry-over lintas tahun;
- jumlah/eligibility/duplikasi Klaim Cuti Bersama;
- pola nomor registrasi;
- rule resmi bukti dan batas setiap jenis cuti, termasuk contoh Cuti Sakit lebih dari 14 hari;
- apakah dampak TUKIN/disiplin izin ada dalam scope dan apa dasar resminya;
- struktur unit kerja dan definisi personel tersedia/siap gerak;
- sumber/owner jadwal libur serta agenda kerja;
- identitas atasan dan kanal reminder;
- file type/size/security/retention, retensi audit, serta delete policy;
- authentication, SSO/MFA, session, dan recovery;
- detail implementasi Ubuntu VPS; tujuan backup sekunder/off-VPS, retensi/rotasi, enkripsi salinan,
  interval uji restore, RPO/RTO, runbook disaster recovery, dan target availability;
- status jadwal Juli-November: tahun target, kapasitas, dan penerimaan delivery baseline.

## 6. Architecture recommendations awaiting approval

Rekomendasi yang belum boleh dianggap keputusan bisnis/teknologi final:

1. layered web architecture dengan API/application boundary dan domain modules;
2. relational schema dengan balance bucket + immutable ledger, database transaction, dan idempotency;
3. server-enforced RBAC serta owner isolation untuk Pegawai;
4. append-oriented audit untuk saldo, status, dokumen, dan operasi Admin;
5. document-storage abstraction dengan checksum, allowlist MIME, size limit, malware scanning, dan
   authorized download;
6. scheduler idempotent untuk reminder dan outbox/queue bila kebutuhan delivery menuntutnya;
7. generated-document versioning agar form awal dan scan persetujuan final tidak tertukar;
8. adapter kalender untuk hari libur/agenda setelah sumber data disetujui;
9. typed codebase, migrations, automated tests, CI, structured logging, secrets management, backup,
   dan least privilege;
10. framework, RDBMS, object storage, containerization, reverse proxy, TLS, firewall, process
    management, pipeline, environment handling, dan database topology boleh dirancang pada M1,
    dengan constraint target produksi awal Ubuntu VPS.

## 7. Proposed milestone order

Urutan yang direkomendasikan tetap M0 Product & Documentation Foundation; M1 Technical Foundation;
M2 Authentication, Employee & RBAC; M3 Leave Balance Domain Engine; M4 Employee Leave & Permission
Workflows; M5 Admin Verification & Document Archive; M6 Dashboards, Calendar & Analytics; M7
Reporting & Export; dan M8 Notifications, Audit Hardening, Security & UAT.

M3 tidak boleh dimulai sebelum ambiguity saldo diputuskan. M4-M5 memerlukan keputusan hybrid
workflow dan status. Kalender agenda, indikator kesiapsiagaan, dan reminder atasan harus menunggu
definisi data/authorization. Timeline kalender sumber harus dipetakan ke milestone ini melalui planning
kapasitas; urutan dependency tidak boleh dikorbankan hanya untuk mencocokkan nama fase pada gambar.

## 8. M0 exit recommendation

Repository tetap documentation-first; tidak ada source aplikasi dibuat. Stakeholder kini telah
menyetujui target Ubuntu VPS, kebijakan akses dokumen privat, dan baseline backup cron untuk database
serta dokumen privat. Keputusan ini menutup seluruh kebutuhan kebijakan untuk memulai **M1 - Technical
Foundation**, sehingga M1 tidak lagi terblokir. Detail teknis deployment boleh dirancang M1.

Tujuan backup sekunder/off-VPS, retensi, rotasi, enkripsi salinan, interval uji restore, RPO, RTO,
dan runbook DR tetap terbuka, tetapi dipindahkan secara eksplisit ke gate M8/production readiness.
Arsitektur M1 wajib mendukung keputusan mendatang tersebut; backup hanya pada VPS produksi tidak
boleh dilaporkan sebagai disaster recovery lengkap.

## 9. Decision log follow-up

Seluruh ambiguity pada review ini sekarang memiliki ID, pilihan implementasi, rekomendasi yang
secara eksplisit non-final, dampak, owner confirmation, dan gate milestone di
`docs/decision-log.md`. Kelompok referensinya adalah:

- saldo: BAL-001–BAL-005;
- workflow/approval: WF-001–WF-004;
- dokumen: DOC-001–DOC-004;
- izin/validasi: PERM-001, PERM-002, VAL-001;
- kalender/notifikasi: CAL-001, NOT-001, NOT-002;
- audit/reporting: AUD-001, RPT-001, RPT-002;
- identity/organisasi: AUTH-001, AUTH-002, DATA-001;
- deployment/operasi: DEP-001–DEP-003.

Kesimpulan gate berubah: M1 terbuka berdasarkan keputusan stakeholder yang dicatat sebagai final,
bukan berdasarkan rekomendasi. Keputusan workflow, saldo, retensi dokumen, operasi, dan fitur lain
tetap terbuka dan terus memblokir milestone masing-masing sebagaimana decision log.

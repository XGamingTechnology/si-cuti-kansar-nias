# SI CUTI - Product Requirements

Status: **Initial baseline derived from Proposal & Kerangka Inovasi 2026**  
Source: `docs/source/Laporan-Kerangka-Inovasi-SI-CUTI-KANSAR-NIAS.pdf`

> Dokumen ini adalah interpretasi terstruktur dari proposal. Jika terdapat konflik, periksa kembali PDF sumber dan jangan menambah aturan bisnis tanpa persetujuan.

## 1. Product objective

SI CUTI adalah aplikasi web layanan kepegawaian untuk digitalisasi administrasi cuti dan izin ASN di Kantor Pencarian dan Pertolongan Kelas B Nias.

Tujuan yang dinyatakan dalam proposal:

1. Otomatisasi akurasi perhitungan saldo cuti.
2. E-Archiving dokumen kepegawaian.
3. Mendukung pengambilan keputusan pimpinan melalui dashboard data.
4. Mengurangi ketergantungan pada pencatatan manual Excel dan pencarian dokumen manual.
5. Mendukung kesiapsiagaan operasional SAR dengan informasi personel yang sedang cuti.

## 2. Users and roles

### 2.1 Admin Kepegawaian

Kemampuan yang dinyatakan:

- mengelola master data;
- menginput, mengedit, dan mengunci kuota awal Cuti N, N-1, dan alokasi Klaim Cuti Bersama;
- memverifikasi bukti Klaim Cuti Bersama;
- mengunggah PDF persetujuan cuti resmi yang telah ditandatangani/distempel;
- mengunggah surat izin/sakit sebagai dasar pencatatan absensi non-cuti;
- menarik rekap laporan;
- mengendalikan dashboard monitoring.

Flowchart proposal juga memperlihatkan Admin menerima berkas cuti/izin dari pegawai, memvalidasi
kelengkapan, dan mengembalikan berkas yang belum lengkap untuk diperbaiki. Arti tepat "menerima"
(serah-terima fisik, pencatatan di sistem, atau keduanya) masih perlu dikonfirmasi.

### 2.2 Pegawai

Kemampuan yang dinyatakan:

- mengisi formulir pengajuan cuti secara elektronik;
- menghasilkan dokumen standar kedinasan/PDF dari pengajuan;
- mengajukan Klaim Cuti Bersama dengan bukti pendukung;
- melihat status pengajuan aktif;
- melihat histori pengajuan;
- mengunduh arsip PDF yang tersedia;
- mengajukan izin non-cuti dengan dokumen pendukung;
- melihat saldo cuti secara langsung.

Flowchart proposal memperlihatkan bahwa form cuti/izin yang dihasilkan sistem dicetak lalu
ditandatangani oleh Atasan Langsung dan Kepala Kantor sebelum diserahkan kepada Admin untuk
diunggah. Batas antara langkah di dalam sistem dan proses fisik ini harus dipertahankan sampai
stakeholder menyetujui digitalisasi tanda tangan/approval.

### 2.3 Akses dokumen privat (disetujui)

- Admin Kepegawaian dapat mengakses dokumen privat sesuai otorisasi administratifnya.
- Pegawai hanya dapat mengakses dokumen yang terkait dengan akun/record pegawainya sendiri.
- Dokumen privat tidak boleh disajikan dari direktori web publik atau melalui URL anonim permanen;
  seluruh akses/download wajib melewati autentikasi dan otorisasi server-side.
- Manipulasi identifier objek tidak boleh melewati owner isolation. Metadata dan akses file harus
  dapat diaudit bila diwajibkan.
- Role yang ditambahkan pada masa depan tidak otomatis memperoleh akses dokumen; akses tambahan
  memerlukan keputusan kebijakan yang disetujui.

## 3. Scope baseline

Proposal menyebut sistem dirancang untuk 93 pegawai.

## 4. Main functional modules

1. Authentication
2. Employee Profile
3. Employee Master Data
4. Leave Balance
5. Leave Application
6. Izin / Permission
7. Klaim Cuti Bersama
8. Verification / Approval
9. Digital Document Archive
10. Leave Calendar
11. Reporting
12. Dashboard Analytics
13. Notifications / Reminder
14. Audit Trail
15. System Configuration

## 5. Leave balance requirements

### 5.1 Cuti N

- Cuti Tahunan tahun berjalan (N): 12 hari per pegawai.

### 5.2 Cuti N-1

Proposal menyatakan:

- sisa cuti tahun sebelumnya dapat ditangguhkan pada tahun berjalan;
- jika sisa tahun sebelumnya minimal 6 hari, tambahan Cuti N-1 maksimal 6 hari;
- jika sisa tahun sebelumnya maksimal 6 hari, tambahan sesuai sisa yang ada.

### 5.3 Cuti N-2

Proposal menyatakan pegawai yang tidak mengambil Cuti Tahunan sama sekali selama dua tahun berturut-turut mendapatkan tambahan Cuti N-1 sebanyak 6 hari dan Cuti N-2 sebanyak 6 hari.

### 5.4 Klaim Cuti Bersama

- pegawai dapat mengajukan Klaim Cuti Bersama;
- klaim memerlukan bukti;
- klaim harus disetujui Admin;
- klaim yang disetujui menambah kuota pada kategori Cuti Tahunan.

### 5.5 Total saldo Cuti Tahunan

`Cuti N + Cuti N-1 + Cuti N-2 + Klaim Cuti Bersama`

### 5.6 Prioritas pengurangan Cuti Tahunan

1. Klaim Cuti Bersama
2. Cuti N-2
3. Cuti N-1
4. Cuti N

### 5.7 Jenis cuti yang disebut tidak mengurangi saldo Cuti Tahunan

- Cuti Sakit
- Cuti Alasan Penting (CAP)
- Cuti Besar
- Cuti Melahirkan
- Cuti di Luar Tanggungan Negara (CLTN)

Proposal juga menyebut syarat/contoh berikut, tetapi belum cukup rinci untuk dijadikan rule engine:

- Cuti Sakit disertai surat keterangan dokter;
- contoh Cuti Alasan Penting (CAP): istri melahirkan, kedukaan keluarga inti, dan musibah;
- Cuti Besar dikaitkan dengan masa kerja;
- Cuti Melahirkan disebut untuk pegawai wanita.

## 6. Application and workflow requirements

Proposal menyatakan penggunaan **Hybrid Workflow** dan menggambarkan alur pada halaman 7.

Baseline requirement:

- pegawai login;
- pegawai mengisi form pengajuan;
- sistem dapat menghasilkan dokumen/form kedinasan;
- admin melakukan proses administrasi/verifikasi;
- dokumen persetujuan final dapat diunggah sebagai PDF;
- riwayat dan status harus dapat ditelusuri.
- Admin memvalidasi kelengkapan berkas dan berkas yang belum lengkap dikembalikan kepada Pegawai
  untuk diperbaiki;
- setelah berkas lengkap, Admin mengarsipkan dokumen dan pencatatan masuk ke riwayat Pegawai;
- pengurangan saldo, jika jenisnya Cuti Tahunan, digambarkan terjadi pada proses Admin setelah
  berkas dinyatakan lengkap.

Detail state machine final, titik komit transaksi saldo, serta apakah langkah tanda tangan dan
serah-terima berkas tetap fisik harus diverifikasi sebelum coding.

Untuk izin non-cuti, flowchart menyatakan bahwa izin tidak mengurangi saldo Cuti Tahunan, tetap
dapat dikenai pemotongan TUKIN sesuai ketentuan, dan tidak masuk perhitungan disiplin. Dua dampak
terakhir memerlukan dasar aturan dan konfirmasi stakeholder sebelum diimplementasikan.

## 7. Search and archive

Sistem harus mendukung pencarian/filter historis menggunakan parameter yang disebut proposal:

- rentang tanggal;
- jenis cuti;
- nama pegawai;
- NIP;
- status persetujuan.

Dokumen harus disimpan dalam arsip digital yang dapat dicari kembali sesuai hak akses.

## 8. Reporting

Sistem harus dapat mengekspor rekapitulasi dalam:

- PDF formal;
- Excel untuk analisis internal.

## 9. Calendar and analytics

- kalender cuti personal;
- kalender personal juga digambarkan memuat jadwal libur dan agenda kerja; sumber dan kewenangan
  pengelolaan kedua jenis agenda tersebut belum ditentukan;
- kalender/monitoring cuti untuk Admin;
- grafik penggunaan/jenis cuti;
- dashboard indikator ringkas.

## 10. Notifications

Proposal menyebut reminder otomatis ketika masa cuti tersisa 2 hari sebelum pegawai kembali aktif bekerja.

## 11. Audit trail

Audit log harus mencatat perubahan saldo atau unggahan berkas, termasuk data yang disebut proposal:

- nama/user;
- waktu akses;
- alamat IP;
- aktivitas.

Implementasi boleh mencatat metadata audit tambahan selama tidak mengubah aturan bisnis.

## 12. Automatic validation

Proposal mengharuskan validasi aturan otomatis dan memberikan contoh bahwa pengajuan yang melampaui aturan yang berlaku harus ditolak/ditahan sesuai persyaratan dokumen.

Contoh di proposal terkait Cuti Sakit lebih dari 14 hari **harus dikonfirmasi terhadap aturan resmi sebelum diperlakukan sebagai aturan final implementasi**, karena proposal menyebutnya sebagai contoh.

## 13. Interface requirements

- web-based;
- responsif untuk komputer, tablet, dan smartphone;
- visual mengikuti arah mockup halaman 8;
- dashboard Admin dan Pegawai berbeda sesuai kebutuhan role.

## 14. Non-functional requirements stated or directly implied by proposal

- data terpusat;
- relational database;
- modular architecture;
- integritas data antar tabel;
- keamanan akses berbasis role;
- auditability;
- pencarian arsip;
- maintainability untuk pengembangan berikutnya.

Keputusan stakeholder menambahkan baseline operasional berikut: target produksi awal adalah VPS
berbasis Ubuntu; backup otomatis terjadwal menggunakan cron dan minimal mencakup database serta
dokumen privat; implementasi backup harus mendukung penyalinan ke luar lokasi data aplikasi utama.
Target deployment tidak boleh diubah tanpa keputusan stakeholder baru. Backup yang hanya tersimpan
pada VPS produksi yang sama tidak boleh dinyatakan sebagai disaster recovery lengkap.

## 15. Ambiguities requiring confirmation

1. Siapa pihak approval formal selain Admin Kepegawaian? Mockup/workflow perlu dikonfirmasi terhadap proses organisasi aktual.
2. State pengajuan final apa saja: draft, diajukan, diverifikasi, disetujui, ditolak, dibatalkan, selesai, atau kombinasi lain?
3. Apakah hari cuti dihitung sebagai hari kalender atau hari kerja, dan bagaimana hari libur nasional/akhir pekan diperlakukan?
4. Bagaimana perlakuan saldo jika pengajuan yang sudah memotong saldo kemudian dibatalkan/direvisi?
5. Masa berlaku dan mekanisme carry-over N-1/N-2 pada pergantian tahun perlu dirinci menjadi rule deterministik.
6. Besaran Klaim Cuti Bersama dan hubungan dengan tanggal cuti bersama nasional belum cukup rinci dalam proposal.
7. Format nomor registrasi otomatis belum mencantumkan pola tata naskah dinas final.
8. Jenis, ukuran maksimum, pemeriksaan malware, enkripsi, dan retensi file upload belum ditentukan;
   kebijakan siapa yang boleh mengakses dokumen privat telah disetujui pada DOC-003.
9. AUTH-001 menetapkan akun lokal sebagai provider awal. Identifier login lokal, reset/recovery,
   algoritma/parameter hashing, MFA, lockout, dan session timeout masih perlu ditentukan; pemilihan
   provider OIDC/SAML/SSO masa depan tetap terbuka dan bukan scope milestone awal.
10. Struktur unit kerja dalam dashboard/filter belum cukup terdefinisi.
11. Definisi indikator personel “tersedia/siap gerak” harus dikonfirmasi agar tidak disimpulkan hanya dari status cuti.
12. Kanal notifikasi selain notifikasi web/sistem belum ditentukan.
13. Apakah approval oleh Atasan Langsung/Kepala Kantor tetap berupa tanda tangan fisik atau akan
    direpresentasikan sebagai approval digital di sistem?
14. Apa arti operasional status "berkas lengkap", mekanisme pengembalian untuk perbaikan, dan siapa
    yang boleh mengubah pengajuan setelah dikembalikan?
15. Apakah pengurangan TUKIN untuk izin dan pernyataan bahwa izin tidak masuk perhitungan disiplin
    termasuk scope SI CUTI; jika ya, aturan dan sumber otoritatifnya belum tersedia.
16. Dari mana data jadwal libur dan agenda kerja pada kalender personal berasal dan siapa yang
    berwenang mengelolanya?
17. PDF menyebut reminder kepada Pegawai dan atasan, sedangkan kanal selain web/sistem dan definisi
    "atasan" belum ditentukan.
18. Mockup adalah referensi visual, bukan sumber data demo: nama, NIP, nilai statistik, batas
    pengajuan tiga hari, dan contoh tahun/tanggal di dalamnya belum boleh diperlakukan sebagai rule
    atau data implementasi.

## 16. Decision dependencies

Keputusan yang belum final tidak boleh diperlakukan sebagai requirement. Register lengkap dan
pemisahan fakta PDF/rekomendasi/policy tersedia di `docs/decision-log.md`.

| Area requirement | Decision IDs |
|---|---|
| Saldo, day-count, restore, rollover, dan Klaim Cuti Bersama | BAL-001, BAL-002, BAL-003, BAL-004, BAL-005 |
| Hybrid approval, otoritas, koreksi, dan status | WF-001, WF-002, WF-003, WF-004 |
| Dokumen, penomoran, retensi, dan file | DOC-001, DOC-002, DOC-003, DOC-004 |
| Izin, TUKIN/disiplin, dan validasi jenis cuti | PERM-001, PERM-002, VAL-001 |
| Kalender dan reminder | CAL-001, NOT-001, NOT-002 |
| Audit, reporting, dan kesiapan personel | AUD-001, RPT-001, RPT-002 |
| Identity, scope akses, dan master organisasi | AUTH-001 (resolved), AUTH-002, DATA-001 |
| Deployment, backup, dan operasi | DEP-001, DEP-002, DEP-003 |

DEP-001 dan baseline M1 DEP-002 telah resolved. Tujuan backup sekunder/off-VPS, retensi, rotasi,
enkripsi salinan, interval uji restore, RPO, RTO, dan runbook DR tetap menjadi gate M8/production.

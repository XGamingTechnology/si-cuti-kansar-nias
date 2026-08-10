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

## 6. Application and workflow requirements

Proposal menyatakan penggunaan **Hybrid Workflow** dan menggambarkan alur pada halaman 7.

Baseline requirement:

- pegawai login;
- pegawai mengisi form pengajuan;
- sistem dapat menghasilkan dokumen/form kedinasan;
- admin melakukan proses administrasi/verifikasi;
- dokumen persetujuan final dapat diunggah sebagai PDF;
- riwayat dan status harus dapat ditelusuri.

Detail state machine final harus diverifikasi dari workflow dan keputusan stakeholder sebelum coding.

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

## 15. Ambiguities requiring confirmation

1. Siapa pihak approval formal selain Admin Kepegawaian? Mockup/workflow perlu dikonfirmasi terhadap proses organisasi aktual.
2. State pengajuan final apa saja: draft, diajukan, diverifikasi, disetujui, ditolak, dibatalkan, selesai, atau kombinasi lain?
3. Apakah hari cuti dihitung sebagai hari kalender atau hari kerja, dan bagaimana hari libur nasional/akhir pekan diperlakukan?
4. Bagaimana perlakuan saldo jika pengajuan yang sudah memotong saldo kemudian dibatalkan/direvisi?
5. Masa berlaku dan mekanisme carry-over N-1/N-2 pada pergantian tahun perlu dirinci menjadi rule deterministik.
6. Besaran Klaim Cuti Bersama dan hubungan dengan tanggal cuti bersama nasional belum cukup rinci dalam proposal.
7. Format nomor registrasi otomatis belum mencantumkan pola tata naskah dinas final.
8. Jenis, ukuran maksimum, dan retensi file upload belum ditentukan.
9. Kebijakan login, reset password, MFA/SSO, dan session timeout belum ditentukan.
10. Struktur unit kerja dalam dashboard/filter belum cukup terdefinisi.
11. Definisi indikator personel “tersedia/siap gerak” harus dikonfirmasi agar tidak disimpulkan hanya dari status cuti.
12. Kanal notifikasi selain notifikasi web/sistem belum ditentukan.

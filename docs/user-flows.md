# SI CUTI - User Flows

Status: **Baseline flows derived from proposal; exact approval states require confirmation**

## 1. Pegawai - Login dan dashboard

```text
Login
  -> autentikasi berhasil
  -> Dashboard Pegawai
     -> ringkasan profil
     -> saldo cuti
     -> quick actions
     -> kalender pribadi
     -> riwayat/status
     -> notifikasi
```

## 2. Pegawai - Pengajuan Cuti Tahunan

```text
Dashboard Pegawai
  -> Pengajuan Cuti
  -> Pilih jenis cuti
  -> Isi tanggal dan data permohonan
  -> Sistem menghitung/menampilkan kebutuhan hari sesuai rule final
  -> Sistem memvalidasi saldo dan requirement
  -> Ajukan (opsi draft belum dikonfirmasi)
  -> Status pengajuan tercatat
  -> Cetak form
  -> Tanda tangan Atasan Langsung dan Kepala Kantor (digambarkan sebagai proses fisik)
  -> Serahkan ke Admin untuk diperiksa dan diunggah
  -> Admin memvalidasi kelengkapan
     -> belum lengkap: kembalikan ke Pegawai untuk diperbaiki
     -> lengkap: arsipkan dan catat dalam riwayat
  -> Dokumen persetujuan final dapat diarsipkan
  -> Pegawai dapat melihat status/riwayat dan mengunduh dokumen yang berhak diakses
```

Catatan: flowchart menempatkan pengurangan saldo Cuti Tahunan setelah validasi kelengkapan oleh
Admin, tetapi titik komit transaksi/status final dan mekanisme koreksinya belum cukup rinci dan harus
dikonfirmasi. Opsi draft adalah rekomendasi produk, bukan requirement PDF.

## 3. Pegawai - Klaim Cuti Bersama

```text
Dashboard Pegawai
  -> Klaim Cuti Bersama
  -> Isi klaim
  -> Upload bukti pendukung
  -> Submit
  -> Admin memverifikasi bukti
     -> ditolak: status dan alasan tercatat
     -> disetujui: kuota klaim ditambahkan ke saldo Cuti Tahunan
  -> transaksi saldo + audit log dibuat
```

## 4. Pegawai - Izin Non-Cuti

```text
Dashboard Pegawai
  -> Pengajuan Izin
  -> Isi data izin
  -> Upload surat/pernyataan bila diperlukan
  -> Submit
  -> Generate form izin (PDF)
  -> Cetak dan tanda tangan Atasan Langsung
  -> Serahkan kepada Admin untuk diunggah
  -> status/arsip tercatat
```

Flowchart secara eksplisit menyatakan izin non-cuti tidak mengurangi saldo Cuti Tahunan. Pernyataan
tentang pemotongan TUKIN dan pengecualian dari perhitungan disiplin belum boleh diotomatisasi tanpa
aturan resmi dan keputusan scope.

## 5. Admin - Dashboard Monitoring

```text
Login Admin
  -> Dashboard Admin
     -> total pegawai
     -> pegawai sedang cuti
     -> pengajuan menunggu proses
     -> informasi personel tersedia (definisi final perlu konfirmasi)
     -> kalender cuti
     -> analitik distribusi cuti
     -> daftar pengajuan terbaru
```

## 6. Admin - Verifikasi Klaim Cuti Bersama

```text
Daftar Klaim
  -> filter/search
  -> buka detail
  -> lihat bukti
  -> approve / reject
  -> bila approve: sistem menambah bucket/entitlement
  -> audit log dibuat
```

## 7. Admin - Arsip Dokumen Final

```text
Buka pengajuan
  -> pilih aksi upload dokumen final
  -> validasi file
  -> simpan metadata + file
  -> tautkan ke pengajuan/pegawai
  -> audit log dibuat
  -> dokumen tersedia bagi user yang memiliki akses
```

## 8. Search and reporting

```text
Admin
  -> Laporan / Arsip
  -> filter tanggal / jenis cuti / nama / NIP / status
  -> tampilkan hasil
  -> export PDF atau Excel
```

## 9. Reminder kembali aktif

```text
Scheduled check
  -> temukan pegawai dengan akhir cuti mendekati 2 hari
  -> buat notifikasi web/sistem
  -> tampilkan kepada pegawai dan pihak terkait sesuai keputusan final
```

## 10. Flows requiring stakeholder confirmation

- approval formal Kepala Kantor dan representasinya di sistem;
- siapa yang berhak reject/cancel/edit setelah submit;
- kapan saldo dipotong;
- mekanisme restore saldo saat pembatalan;
- cuti yang overlap;
- pengajuan retroaktif;
- perpanjangan cuti;
- koreksi data oleh Admin;
- workflow izin sakit/CAP/Cuti Besar/Cuti Melahirkan/CLTN secara detail.
- arti dan status "berkas lengkap" serta siklus perbaikannya;
- status tanda tangan fisik versus approval digital;
- aturan/scope TUKIN dan disiplin untuk izin;
- sumber jadwal libur dan agenda kerja pada kalender personal;
- identitas atasan penerima reminder.

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
  -> Simpan draft atau ajukan
  -> Status pengajuan tercatat
  -> Admin memproses sesuai workflow
  -> Dokumen persetujuan final dapat diarsipkan
  -> Pegawai dapat melihat status/riwayat dan mengunduh dokumen yang berhak diakses
```

Catatan: titik pasti pemotongan saldo (saat submit, approval, atau status lain) belum dinyatakan secara cukup rinci dan harus dikonfirmasi.

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
  -> status/arsip tercatat
```

Izin non-cuti tidak boleh diasumsikan mengurangi saldo Cuti Tahunan tanpa rule eksplisit.

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

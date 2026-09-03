# M2 Batch 5 — Kontrak Import Pegawai

Import pegawai hanya tersedia untuk `ADMIN_KEPEGAWAIAN` dan berlangsung dalam dua tahap: preview/validasi tanpa penulisan, lalu commit eksplisit yang mengulang validasi. Workbook tidak disimpan.

## Workbook

- Format `.xlsx`, maksimal 2 MB.
- Worksheet pertama harus memiliki tepat lima header berurutan: `NIP`, `Nama Lengkap`, `Jabatan`, `Unit Kerja`, `Status Aktif`.
- NIP wajib, di-trim, maksimal 32 karakter, dan tidak dibatasi hanya angka.
- Nama Lengkap, Jabatan, dan Unit Kerja wajib, di-trim, maksimal 200 karakter.
- Status Aktif menerima `TRUE`/`AKTIF` sebagai aktif serta `FALSE`/`TIDAK AKTIF` sebagai tidak aktif (tidak peka huruf besar-kecil setelah trim).
- NIP duplikat dalam workbook atau yang sudah ada di basis data membuat baris tidak valid.

Commit dinonaktifkan bila preview memiliki kesalahan. Server tetap membaca dan memvalidasi ulang file saat commit. Repository memeriksa ulang konflik NIP di dalam transaksi dan membuat seluruh Employee secara atomik; konflik atau kegagalan apa pun membatalkan seluruh import. Import tidak mengubah Employee yang ada, tidak menetapkan atasan langsung, dan tidak membuat User, identity, credential, maupun akun login.

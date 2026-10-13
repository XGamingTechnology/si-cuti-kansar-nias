# Ruang kerja Admin: daftar ringkas dan jendela mengambang

Revisi lanjutan pada branch `codex/admin-employee-ui-polish` dari commit
`bd9a125559736609678229756220cc298ce34a9b`, berdasarkan masukan bahwa halaman
Admin terlalu panjang dan formulir/detail perlu dibuka saat dibutuhkan.

Daftar pegawai, saldo, penugasan pejabat, pengajuan Admin, serta hasil impor saldo
memakai pagination lokal 10 baris. Pencarian dan filter tetap berlaku terhadap
seluruh data yang dimuat; perubahan filter/tahun mengembalikan halaman pertama.
Halaman dijepit ke rentang valid jika jumlah data berkurang. Pagination ini
membatasi tampilan, bukan jumlah record yang dikirim backend.

Detail pegawai dan saldo tampil sebagai jendela tengah dengan tinggi terbatas.
Formulir pejabat, impor saldo, detail pengajuan Admin, serta konfirmasi review
menggunakan dialog native, dukungan Escape, fokus keyboard, dan pemulihan fokus.
Konfirmasi review dapat terbuka di atas detail tanpa menghilangkan akses ke
aksi. Formulir pejabat tidak memenuhi halaman sebelum tombol tambah/ubah dipilih.
Ringkasan menjadi satu baris ringkas. Layout tetap responsif untuk tablet dan
ponsel. Alur Pegawai tetap memakai tampilan detail yang sudah ada.

Tidak mengubah endpoint/payload, backend authorization, inisialisasi saldo,
validasi impor, aturan cuti, schema/migrasi Prisma, atau dependencies. Tidak
menambahkan operasi saldo baru. Import tetap preview dahulu lalu konfirmasi.

## File perubahan

- `src/components/admin-floating-window.tsx`
- `src/components/admin-pagination.tsx`
- `src/components/use-admin-panel-focus.ts`
- `src/components/admin-employee-ui.css`
- `src/components/employee-management.tsx`
- `src/components/annual-balance-management.tsx`
- `src/components/annual-balance-import.tsx`
- `src/components/leave-authorized-official-management.tsx`
- `src/components/workflow-workspace.tsx`
- `tests/browser/admin-employee-ui.mjs`
- `docs/admin-floating-workspace.md`

## Verifikasi

Build, typecheck, lint, Prettier file perubahan, `git diff --check`, gate unit/HTTP
341 tests, serta browser runner dengan 16 skenario. Tambahan browser mencakup
pagination >10 data, reset setelah pencarian, halaman terakhir, formulir pejabat
beserta payload penyimpanan, pagination saldo dan dialog impor, serta pagination
pengajuan dan dialog review berlapis. Skenario lama mencakup responsive viewport
320/390/834 piksel, keyboard, create/detail/import pegawai, loading/error/empty,
retry, akses Pegawai, dan reduced motion.

Runner memakai PostgreSQL disposable untuk fixture sesi sintetis dan pengujian
403 API sebenarnya; response daftar serta mutasi dimock untuk pemeriksaan UI
secara deterministik. Semua data screenshot merupakan data sintetis. Perintah
runner dan variabel runtime mengikuti `docs/admin-employee-ui-polish.md`.

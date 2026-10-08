# Issue #98 — Impor batch saldo awal

Halaman `/admin/saldo-cuti` menyediakan **Unduh Template Saldo** dan **Import Saldo** untuk tahun administrasi terpilih. Endpoint template, preview, dan commit memeriksa sesi dan role `ADMIN_KEPEGAWAIAN` di server sebelum membaca file atau data pegawai. Pegawai dan pengguna anonim ditolak.

## Workbook dan preview

- XLSX, maksimal 2 MB dan 1.000 baris data; baris kosong diabaikan. Formula tidak didukung.
- Header persis: `NIP`, `Nama Pegawai`, `Tahun`, `N`, `N-1`, `N-2`, `Cuti Bersama`, `Dasar Administrasi`.
- Template berisi pegawai aktif, tahun terpilih, N=12, Cuti Bersama=0. N-1, N-2, dan Dasar Administrasi sengaja kosong: Admin wajib mengisi berdasarkan data yang sah, termasuk 0 jika sesuai.
- NIP disimpan sebagai sel teks untuk mempertahankan nol awal dan angka panjang. Nama hanya referensi; identitas pegawai berasal dari NIP di database.
- Semua baris harus memakai tahun terpilih. NIP di-trim, duplikat ditolak pada setiap kemunculan. Kolom tambahan berisi data ditolak.
- N=12 dan Cuti Bersama=0 harus tetap sama. N-1 dan N-2 menggunakan validator aplikasi yang sama dengan inisialisasi tunggal: integer 0..6; dasar administrasi wajib dan maksimal 1.000 karakter.
- Preview hanya membaca data. Hasil per baris: `READY`, `SKIP` untuk saldo lengkap yang sudah diinisialisasi, atau `ERROR` dengan alasan aman. Set saldo parsial, bucket duplikat/hilang, counter tidak konsisten, dan pelanggaran batas saldo reguler memerlukan pemeriksaan manual.
- Baris tetap divalidasi meskipun saldo sudah siap; file salah memberi diagnosis dan tidak memperbarui saldo.

## Endpoint dan konfirmasi

- `GET /api/admin/annual-balances/batch/template?year=YYYY`: attachment XLSX prefilled.
- `POST /api/admin/annual-balances/batch/preview?year=YYYY`: multipart `file`; hasil `{ preview }`, ringkasan total/valid/skip/error, nomor baris worksheet, dan digest SHA-256 atas file serta tahun.
- `POST /api/admin/annual-balances/batch/commit?year=YYYY`: multipart `file`, UUID `batchId`, `previewDigest`, JSON array `confirmedRows` (nomor baris valid dari preview).

UI meminta konfirmasi eksplisit sebelum commit. File atau tahun berubah memerlukan preview ulang. Baris baru yang menjadi valid setelah preview tidak diproses jika tidak termasuk konfirmasi awal. Server membaca dan memvalidasi ulang file serta status database; data saldo/baris dari klien tidak menjadi sumber aturan.

Setiap baris valid memanggil `AnnualBalanceAdministrationService.initialize`, sehingga pemeriksaan pegawai aktif dan status saldo diulang di dalam transaksi dengan lock Employee. Empat akun bucket dibuat bersama GRANT positif secara atomik. Kegagalan satu baris membatalkan transaksi baris tersebut; baris lain tetap dapat diproses. Saldo lengkap tidak ditimpa dan saldo PARTIAL tidak diperbaiki diam-diam. Hasil `{ result }` memuat berhasil/dilewati/gagal per baris dan ringkasannya; UI memuat ulang daftar saldo.

## Retry dan audit

Pertahankan file, digest, daftar baris yang dikonfirmasi, dan batch ID yang sama saat retry. UI menyimpannya selama file/tahun tidak diganti atau preview baru tidak dibuat. Retry atas baris yang telah berhasil menjadi `SKIP`, tanpa GRANT tambahan. Lock dan unique constraint employee/year/bucket juga melindungi batch berbeda maupun endpoint tunggal yang bersaing.

Ledger tetap append-only dengan `referenceType=OPENING_BALANCE`, `referenceId=opening-balance:<employeeId>:<year>`, reason asli dari baris, dan timestamp. Schema saat ini tidak memiliki kolom actor pada AnnualBalanceOperation. Untuk traceability tanpa migration, idempotency key GRANT batch menyimpan actor Admin dari sesi secara eksplisit:

`batch:<batchId>:<actorUserId>:<employeeId>:<year>:<bucket>`

Actor tidak diterima dari input klien. Format ini menghubungkan event positif ke Admin dan batch tanpa mengganti referensi employee/year atau reason. Tidak ada perubahan schema, dependency, deployed migration, aturan lifecycle, editor saldo setelah inisialisasi, atau deployment.

## Verifikasi

Suite baru:

- `tests/unit/annual-balance-batch-import.test.ts`: template roundtrip, preview tanpa penulisan, campuran baris, validasi, duplikat, PARTIAL/invariant, retry, stale file/tahun, konfirmasi, kegagalan per baris.
- `tests/http/annual-balance-batch-import.test.ts`: boundary Admin/pegawai/anonim, attachment, preview/commit, actor dari sesi, transport dan konfirmasi salah, error aman.
- `tests/integration/annual-balance-batch-import.test.ts`: PostgreSQL nyata; preview tanpa perubahan, lock konkuren, retry tanpa GRANT tambahan, transaksi per employee, rollback kegagalan unique-key di tengah penulisan, stale preview, kompatibilitas reserve dan inisialisasi tunggal.

Gate: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration` pada disposable PostgreSQL 18.1 dengan role aplikasi non-superuser, serta diff migration/schema/dependency kosong. Hasil eksekusi dicatat di laporan perubahan; file ini mendokumentasikan kontrak dan cakupan pengujian, bukan klaim kelulusan.

Untuk menjalankan seluruh suite integrasi pada satu database disposable, gunakan `npm run test:integration -- --no-file-parallelism`. Suite auth-recovery memodifikasi state Admin secara global selama fixture berlangsung, sehingga menjalankan file bersamaan dengan suite provisioning akun menyebabkan interferensi. Pengujian concurrency di dalam masing-masing test tetap aktif (termasuk dua commit batch paralel).

Fixture lama `workflow-services-postgresql.test.ts` dilengkapi dengan lokasi formulir, alamat/telepon sintetis, dan metadata dokumen bertanda tangan untuk kasus approval sesuai prerequisite aplikasi yang sudah ada. Assertions workflow/ledger tetap dijalankan, bukan dilewati atau dilonggarkan.

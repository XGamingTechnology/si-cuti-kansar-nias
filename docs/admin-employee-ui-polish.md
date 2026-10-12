# Penyempurnaan UI Admin Kelola Pegawai

Sumber: staging `0d4c533d13bba8f5aa107983e5dd7cb1ec5fe8e7`.
Branch: `codex/admin-employee-ui-polish`.

Sidebar dan header Admin menggunakan warna navy, indikator menu aktif, ikon SVG,
serta navigasi responsif dengan dukungan Escape dan fokus keyboard. Halaman
Kelola Pegawai menampilkan ringkasan dari data yang benar-benar dimuat, identitas
nama/NIP, pencarian dan filter, tabel desktop, kartu ponsel, serta panel detail,
tambah, dan impor yang konsisten. Pratinjau impor tetap harus dilakukan sebelum
penyimpanan eksplisit melalui tombol Impor Pegawai.

Loading dan kegagalan pemuatan tidak ditampilkan sebagai angka nol. Kesalahan
autentikasi/API tetap terlihat, dengan tombol coba lagi. Kegagalan status akun
tetap ditampilkan sebagai Gagal memuat. Tidak ada perubahan endpoint, RBAC,
aturan cuti, schema, migrasi, atau dependencies. Tampilan Pegawai tidak menerima
styling Admin.

## File perubahan

- `src/components/authenticated-shell.tsx`
- `src/components/employee-management.tsx`
- `src/components/admin-ui-icon.tsx`
- `src/components/admin-employee-ui.css`
- `tests/browser/admin-employee-ui.mjs`
- `docs/admin-employee-ui-polish.md`

## Verifikasi

- Build produksi, typecheck, lint, Prettier untuk file perubahan, dan
  `git diff --check`.
- `npm test`: 341 pengujian unit/HTTP dalam 33 file.
- Pengujian terkait employee, import, account administration, dan authorization:
  72 pengujian dalam 8 file (termasuk dalam gate penuh).
- Browser: 12 skenario desktop/tablet/ponsel, pencarian/filter, tambah/detail,
  preview/commit impor, loading/error/empty/retry, kegagalan akun, keyboard,
  resize drawer, reduced motion, dan pembatasan role Pegawai.

Browser runner menggunakan Playwright eksternal tanpa menambah dependency.
Jalankan dengan `DATABASE_URL` database PostgreSQL disposable yang telah
dimigrasikan, `SI_CUTI_PLAYWRIGHT_MODULE` lokasi Playwright, dan opsional
`SI_CUTI_CHROMIUM_EXECUTABLE`, `SI_CUTI_ADMIN_TEST_URL`, serta
`SI_CUTI_ADMIN_SCREENSHOTS`, lalu `node tests/browser/admin-employee-ui.mjs`.
Fixture sesi/role dibuat di PostgreSQL dan dibersihkan; response daftar,
akun, serta mutasi dimock untuk verifikasi UI deterministik. Penolakan akses
Pegawai diuji terhadap API server sebenarnya. Semua data dan screenshot
pengujian bersifat sintetis, bukan data pegawai nyata.

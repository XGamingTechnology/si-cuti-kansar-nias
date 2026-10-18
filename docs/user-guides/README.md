# Buku panduan SI CUTI

Versi **1.0 — 18 Oktober 2026 WIB**. Sumber aplikasi **`4c341b0b67bbeed0ea366fb22b3d369c47677b39`** dari `origin/staging`, setelah merge PR #118. Panduan bukan kebijakan baru, pengesahan dokumen atau bukti rollout/UAT selesai.

- [Panduan Pegawai](panduan-pegawai.md): masuk, saldo/kalender, cuti, revisi, scan/PDF, izin, klaim dan foto sendiri.
- [Panduan Admin Kepegawaian](panduan-admin.md): master/Arsip/akun, kedua impor, saldo, pejabat, pemeriksaan, kompensasi dan laporan.
- [Inventaris halaman dan skenario](inventaris-halaman.md): menu, modal, tindakan, gambar dan prasyarat.
- [Checkpoint implementasi dan operasional](checkpoint-2026-10-18.md): bukti, bug, keterbatasan dan status operator yang berbeda dari hasil lokal.
- [Manifest screenshot](screenshot-manifest.json): route, role, skenario, SHA, viewport, sumber nyata/mock, bab dan checksum tiap PNG.

## Cakupan dan cara membaca

Delapan permukaan Admin (tujuh menu navigasi + Profil melalui avatar), empat menu Pegawai dan halaman masuk/keluar bersama telah diperiksa. Ada **78 gambar unik: 76 screenshot browser dengan DB nyata lokal dan 2 render PDF keluaran aplikasi; 0 mock**. Tujuh gambar berukuran 390×844 (enam contoh responsif dan logout); gambar desktop 1440×1000. Gambar asli disimpan utuh di `screenshots/originals/`; tidak ada gambar anotasi, manipulasi DOM atau data pegawai nyata. Beberapa gambar umum dipakai di kedua buku.

Klaim hanya mempunyai screenshot menu/form/error karena endpoint statis HTTP 500. Publikasi overlay resmi, UI laporan setelah TTL 24 jam, serta retry/race buatan belum difoto. Jadi cakupan menu bukan klaim semua kondisi bisnis telah lulus. Daftar tepatnya ada di checkpoint dan `conditionsNotCaptured` pada manifest.

Kode bab manifest: U1 = masuk/navigasi bersama; P1–P7 = Pegawai Bab 2–8; P2/P3/P4 memisahkan pengajuan, perbaikan dan dokumen. A1–A9 = Admin Bab 1–9. Dua PNG berjenis `APPLICATION_PDF_RENDER` bukan tangkapan halaman browser; PDF pertama ditampilkan sebagai contoh keluaran dengan data sintetis.

Gambar diambil pada beberapa langkah berurutan, termasuk sebelum/sesudah mutasi sintetis. Angka saldo/status pada gambar berbeda dapat berubah; bukan satu snapshot waktu seluruh sistem. Nama, NIP, alasan, kontak, bukti dan bidang warna avatar adalah contoh. Tanggal/kuota kebijakan simulasi **bukan** kalender pemerintah atau kebijakan yang boleh diterapkan.

## PDF/DOCX dan reproduksi

Artefak task berada di `/workspace/output/si-cuti-user-guides-2026-10-18/`: `panduan-pegawai.pdf`, `panduan-pegawai.docx`, `panduan-admin.pdf`, `panduan-admin.docx`, serta `artifact-validation.json` dan checksum. Berkas biner besar tidak dimasukkan git; penerima yang hanya memiliki clone dapat membuatnya kembali. Lokasi output task tidak otomatis menjadi lampiran permanen GitHub PR.

| Artefak                   | Halaman PDF | Gambar dalam buku |
| ------------------------- | ----------- | ----------------- |
| Panduan Pegawai           | 51          | 33                |
| Panduan Admin Kepegawaian | 72          | 48                |

PDF memakai teks A4 portrait dan halaman gambar A3 landscape agar screenshot asli tetap terbaca; catatan prosedur dikelompokkan sebelum galeri masing-masing prosedur. DOCX memakai A4 landscape dengan gambar berasio asli. PDF seluruh halaman diperiksa melalui raster/contact sheet serta halaman contoh resolusi penuh. DOCX diperiksa sebagai ZIP OOXML valid, seluruh gambar tertanam dan extent dalam margin; preview konten hasil baca balik tersedia, bukan bukti pagination native Word.

Verifikasi lokal: build aplikasi sumber exit 0; 37 skenario/check harness unik selesai (bukan hitungan unit test); validator 78 gambar dan 189 tautan lokal lulus; Prettier dan ESLint script dokumentasi lulus; PDF bounds/text/image dan DOCX struktur/extent lulus; `git diff --check` lulus. Kondisi yang terblokir tetap dicatat dan tidak dihitung sebagai lulus. Tidak menjalankan ulang full suite aplikasi untuk PR dokumentasi.

Prasyarat ekspor: Node, Pandoc, Chromium/Playwright; Python dengan python-docx, PyMuPDF dan Pillow untuk penataan/pemeriksaan. Semua tersedia pada lingkungan task; **tidak ada dependency runtime baru**. PDF menggunakan HTML lokal dan Chromium, bukan mencetak halaman aplikasi langsung. DOCX asli dihasilkan Pandoc dan ditata python-docx. Pemeriksaan struktur/extent dan preview HTML hasil baca balik DOCX tersedia; render native Microsoft Word/LibreOffice belum tersedia pada lingkungan ini.

Dari root repository:

```bash
node docs/user-guides/tools/export.mjs /workspace/output/si-cuti-user-guides-2026-10-18
python docs/user-guides/tools/validate.py
npx prettier --check 'docs/user-guides/**/*.md' 'docs/user-guides/**/*.json' 'docs/user-guides/tools/*.mjs'
git diff --check
```

Tetapkan `SI_CUTI_PLAYWRIGHT_MODULE` pada lokasi module Playwright dan `SI_CUTI_CHROMIUM_EXECUTABLE` bila Chromium tidak ditemukan otomatis. Ekspor bekerja offline tanpa DB/login; HTML sementara memakai referensi gambar lokal, tidak mengambil foto dari internet. `artifact-validation.json` mencatat jumlah halaman, gambar dan validasi setiap berkas.

### Mengambil ulang screenshot (opsional, memutasi fixture lokal)

Baca [harness](tools/capture.mjs) sebelum menjalankan. Ikuti setup DB disposable repo dan migrasikan schema sumber. Jalankan satu build lalu server lokal HTTP dengan `NODE_ENV=test`, bukan staging/produksi. Environment yang diperlukan: `DATABASE_URL` ke host localhost/127.0.0.1 dengan nama DB berawalan `user_guides_`, `SI_CUTI_DISPOSABLE_TEST_DB=1`, `GUIDES_BASE_URL` localhost, dan direktori storage documents/reports/avatars **khusus task**. Jangan gunakan storage bersama. Harness menolak target nonlokal dan DB nonkosong pada pengambilan awal.

```bash
node docs/user-guides/tools/capture.mjs
```

Script memakai pola Playwright login/viewport repo (`tests/browser/login-ui.mjs`, `employee-administration.mjs`, `uat-calendar-download.mjs`, `avatar.mjs`), browser tanpa request mocking. Bootstrap Admin menggunakan service existing; kredensial acak tidak ditulis ke file. Sesi dibuat melalui form login. `GUIDES_RESUME=1` dapat melanjutkan fixture yang sama dan mereset password sintetis melalui service akun; `GUIDES_ONLY` membatasi skenario pemulihan. Jangan menganggap resume seluruh mutasi idempoten: gunakan hanya skenario yang sesuai status fixture terkini. Capture ulang mengubah manifest/gambar; jalankan `tools/finalize.py`, sinkronkan nomor/caption buku, lalu validator sebelum commit.

Jangan commit file `.next`, session state, storage, PDF bukti, DB atau log request. Setelah selesai hentikan hanya server/container disposable milik task.

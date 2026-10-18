# UAT kalender, unduhan dan UI — 18 Oktober 2026 WIB

Base `origin/staging` `1b44fa720d4159069907c0e2666d78fbc15d3b8f`; branch
`codex/uat-calendar-download-ui`. AGENTS.md, baseline dokumen wajib, M6/M7 dan keputusan
workflow dipakai. Temuan pengguna menjadi otorisasi proyeksi nama Admin pada chip kalender;
ini tidak menambahkan aturan saldo, approval, hari kerja atau eligibility.

## Temuan dan perubahan

- **Kalender** sebelumnya hanya count per tanggal (“1 Cuti”). Sekarang reader memakai current
  pointer, overlap inklusif dan scope SELF sebelum LIMIT. Setiap tanggal maksimum **3 chip**,
  sisa `+N lainnya`; bulan/rentang API tetap maksimum 62 hari, jadi maksimal 186 chip per respons.
  Query timeout kalender 10 detik (batas transaksi existing juga tetap berlaku). Agenda lengkap
  memakai cursor/pagination server existing; klik tanggal mengatur from=to dan memfokuskan heading.
- Proyeksi chip hanya requestId, jenis/status, flag return dan (Admin saja) nama master saat dibaca.
  Tidak ada alasan, NIP, kontak, bukti, storage key atau detail revisi. Pegawai tidak menerima
  identitas pegawai lain. Nama singkat dua kata adalah presentasi; nama utuh/jenis ada pada
  title/label aksesibel dan agenda. Status bukan catatan pemakaian aktual; return tidak memendekkan
  periode. Nama chip bukan snapshot arsip lama.
- Sab/Min dan tanggal overlay ditandai merah; LN/CB punya label/legenda berbeda. Hari ini `●`,
  terpilih `✓` + aria-pressed. Warna bukan satu-satunya penanda. Akhir pekan memakai DATE UTC
  hanya untuk presentasi, tidak menambah WorkingCalendarException. Tanggal kosong bukan
  kepastian eligibility/saldo. Tidak membuat record dari klik kalender.
- **Izin:** Promise.all daftar pengajuan + jenis sebelumnya menyamarkan kegagalan jenis sebagai
  kegagalan daftar; select tidak menjelaskan loading/kosong. Kini resource jenis terpisah,
  placeholder eksplisit, loading/error/retry/kosong/tersedia; simpan diblokir saat resource belum
  siap/kosong. Tidak menambah jenis/kebijakan; backend tetap memvalidasi jenis aktif saat simpan.
- **Unduhan:** create, preview, export, fetch artifact dan handoff memakai pesan per operasi.
  HTTP/non-JSON/HTML/sesi kedaluwarsa/transfer putus dibedakan. Format MIME dan body tidak kosong
  dicek sebelum handoff; tetap hanya endpoint terautentikasi/audited, tanpa URL anonim/fallback.
  Retry mempertahankan key existing; setiap operasi membersihkan error/code/retry sebelumnya,
  generation guard menolak hasil lama setelah filter berubah/unmount. Timestamp notice disiapkan
  sebelum click, sehingga format metadata tidak berubah menjadi error setelah download dimulai.
  Anchor dilampirkan ke DOM; blob URL disimpan 60 detik lalu dicabut (sebelumnya anchor detached,
  URL dicabut 1 detik). Ini penguatan lifecycle, **bukan bukti akar masalah Safari/iPad**.
- **Beranda Pegawai:** penjelasan panjang masuk bantuan/disclosure; ringkasan tindakan/draf
  tetap terpisah dari filter, saldo memakai read existing. Filter dashboard/distribusi Pegawai
  dapat dibuka, kalender/agenda dan aksi utama tetap tersedia. Filter laporan memakai input/select
  42px dengan grid align-start dan lookup/pagination pegawai satu baris; bantuan menjelaskan snapshot dan batas data tanpa paragraf teknis
  panjang pada judul.

File utama: `src/{application,infrastructure}/dashboard/`, `dashboard-workspace.*`,
`calendar-presentation.ts`, `workflow-workspace.tsx`, `reporting-workspace.*`, `reporting-client.ts`.
Tidak ada schema, migration, dependency, saldo/workflow mutation, foto profil atau perubahan
arsip PDF lama. Runtime laporan backend/renderer/audit M7 tetap dipakai.

## Sumber libur 2026

Lihat [bukti kendala dan prosedur dataset](calendar-data/2026/README.md). Artikel resmi HTTP403,
host tanpa www dan JDIH ditolak CONNECT403 dari environment. PDF/nomor SKB/perubahan/checksum
belum terverifikasi; **JSON impor resmi belum disediakan**. Tidak memasukkan tanggal tebakan
atau memublikasikan dataset ke VPS. Ini keterbatasan sumber, bukan dataset kosong yang sah.

## Reproduksi dan verifikasi

Dijalankan dengan Node 24 / PostgreSQL 18.1 disposable, data sintetis, production Next build.
Tidak ada DB staging/produksi/VPS yang diakses.

| Pemeriksaan                            | Hasil aktual                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint / typecheck / production build    | Lulus                                                                                                                                         |
| Unit + HTTP penuh                      | **548 test / 47 file** lulus; termasuk **13** unit client/presentasi UAT baru                                                                 |
| Integrasi PostgreSQL penuh             | **142 test / 19 file** lulus; termasuk test baru chip bounded/current pointer/return/Admin vs SELF pada suite M6                              |
| Browser M6                             | **9** skenario lulus: **7 real session/API/DB + 2 MOCK**. Ditambah assertion nama, max3/+N, focus agenda, redaksi owner, dan legenda kategori |
| Browser Pegawai existing               | **14** skenario lulus: **9 real session/API/DB + 5 MOCK**; draf Izin tersimpan sekali, owner isolation, 320/390px, modal/fokus/Escape         |
| Browser M7 existing                    | **8** skenario lulus: **6 real session/API/DB + 2 MOCK**, create/export/PDF/XLSX, isolation/role/deactivation, retry/race                     |
| Browser UAT tambahan                   | **11** skenario lulus: **3 real session/API/DB + 8 MOCK**; rincian berikut                                                                    |
| Prettier changed files / diff / marker | Lulus; tidak ada conflict marker                                                                                                              |

Total **42 skenario browser (25 real session/API/DB + 17 MOCK)**. Skenario berlabel MOCK memakai
sesi nyata, tetapi respons jenis izin/overlay atau kegagalan/race diintersepsi secara eksplisit;
bukan bukti dataset pemerintah atau kegagalan jaringan pada perangkat pengguna.

Tiga skenario UAT tanpa mock membuktikan alur create run → ekspor PDF/XLSX → fetch artifact →
Playwright download, validasi signature berkas dan audit DOWNLOAD_AUTHORIZED, handoff ponsel,
filter 42px, keyboard/fokus/Escape, serta beranda/kalender SELF desktop dan ponsel.
Delapan MOCK membuktikan retry artifact dengan key identik/artefak tunggal, HTML salah MIME,
sesi401, audit503, respons artifact terlambat setelah filter berubah, empat state jenis izin
serta weekend+LN+CB bertumpuk. Unit juga menguji network rejection tiap operasi, non-JSON,
JSON rusak/null, blob kosong/transfer gagal, anchor terpasang sebelum click dan URL lease60detik.
Integrasi memakai banyak pegawai, overlap lintas tahun, return dan revisi lebih tinggi yang
tidak dirujuk current pointer; scope diterapkan sebelum per-day LIMIT, bukan filter browser.

PDF unduhan aktual lolos pembacaan teks, XLSX lolos ZIP CRC/XML/openpyxl (3 sheet, 1 record
sintetis), tanpa sentinel PRIVATE atau formula. Ini bukan pengujian aplikasi desktop Excel.
**NetworkError persis pada perangkat pengguna belum dapat direproduksi. Safari/iPad asli dan
Excel/LibreOffice desktop belum diuji.** Retensi/audit dan server authorisation laporan M7
bukan digantikan oleh penanganan error client. Browser tidak menjanjikan file tersimpan di perangkat.

Bukti screenshot production (seluruh nama/data sintetis):

- [Beranda Pegawai desktop](screenshots/uat-calendar-download/employee-home-desktop.png) /
  [ponsel](screenshots/uat-calendar-download/employee-home-mobile.png).
- [Laporan desktop](screenshots/uat-calendar-download/reports-desktop.png) /
  [ponsel](screenshots/uat-calendar-download/reports-mobile.png).
- [Kalender ponsel: kategori bertumpuk](screenshots/uat-calendar-download/calendar-mobile.png)
  — overlay pada screenshot ini **MOCK sintetis, bukan dataset resmi pemerintah**.
- [Jenis izin kosong, simpan nonaktif](screenshots/uat-calendar-download/permission-empty-mobile.png)
  — resource jenis di-MOCK kosong; tidak membuktikan katalog staging kosong.

## Checklist UAT (tetap pending)

- [ ] Admin melihat nama+jenis, banyak pegawai/event satu hari maksimum 3 chip + sisa; klik agenda,
      lintas bulan/tahun/current revision; Pegawai hanya milik sendiri tanpa identitas orang lain.
- [ ] Return parsial/penuh tetap penanda dan periode; tidak menyimpulkan tanggal penggunaan aktual.
- [ ] Sab/Min + LN/CB bertumpuk, hari ini/terpilih, legenda/keyboard/fokus, 320/390/tablet/desktop.
- [ ] PDF/XLSX: create/export/fetch/handoff, transfer gagal/retry identik, sesi berakhir, audit gagal,
      filter/navigasi saat respons tertunda, tidak ada pesan palsu “tersimpan di perangkat”.
- [ ] Izin loading/gagal/retry/kosong/tersedia; simpan kosong nonaktif; simpan aktif mengikuti backend.
- [ ] Verifikasi PDF SKB/perubahan resmi dan checksum; Admin preview serta konfirmasi JSON valid
      sebelum publikasi. Tidak mengartikan overlay sebagai kalender kerja authoritative.
- [ ] Periksa Safari/iPad asli, Excel/LibreOffice bila relevan, dan bukti operator/health setelah
      rollout yang terpisah. CI/screenshot bukan penutupan UAT atau bukti deploy.

Tidak merge/deploy/mengakses VPS atau DB staging/produksi.

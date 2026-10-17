# Penyempurnaan UI Pegawai

Base `origin/staging`: `4fdda0ec2bc2ce92bc9c5cbc93fa4bc8ca488a4b`.
Branch: `codex/employee-ui-refinement`. PR ini hanya penyempurnaan presentasi dan navigasi;
aturan bisnis, authorization server, kontrak API, schema, migration dan dependency tidak berubah.

## Perilaku

- Setelah login, Pegawai di `/` diarahkan ke `/dashboard`; tujuan Admin tetap `/`.
  Routing client pada root mempertahankan bookmark `/#profil` dan mengarahkan `/#pengajuan`
  ke alur existing. Profil kini dibaca dari endpoint owner-authorized yang sama, bukan menampilkan
  JSON mentah. Pengajuan, klaim dan deep-link `?kind=…&request=…` tetap tersedia.
- Aksi Ajukan Cuti/Izin membuka form dialog existing untuk jenis yang tepat melalui `new=1`.
  Tidak ada POST otomatis. Klaim membuka workflow klaim existing.
- Saldo tahun berjalan ditampilkan lebih dahulu, memakai respons layanan existing tanpa
  penjumlahan/perhitungan UI. PARTIAL/belum disiapkan tidak ditampilkan sebagai nol.
- Daftar pengajuan compact, 10 item per halaman, tanpa alasan pribadi di kartu daftar Pegawai.
  **Pagination workflow tetap lokal**: API existing mengirim seluruh daftar; UI menjelaskan hal ini.
  Tidak ditambahkan kontrak/API bisnis untuk pagination. Agenda kalender tetap berhalaman di server.
- Detail dan form dibuka sesuai kebutuhan dalam dialog native existing: Escape, fokus tertahan,
  pengembalian fokus, dan close dinonaktifkan selama submit. Ditolak tetap terminal; Perlu diperbaiki
  tetap memakai lifecycle RETURNED_FOR_CORRECTION. Catatan Admin ditonjolkan dari riwayat existing.
- Penjagaan sequence mencegah respons daftar/detail lama menimpa pilihan baru. Pesan operasi
  dibersihkan saat pindah record/form/tab. Save/action/upload/download memiliki penjagaan in-flight;
  draf baru yang tersimpan dibuka sebagai detail. Kegagalan detail menyediakan retry, bukan loading abadi.
- Formulir Pengajuan, Scan Bertanda Tangan dan PDF Keputusan Final dibedakan. Pegawai hanya
  mendapat tombol PDF keputusan ketika `ready`; bila belum tersedia diarahkan menghubungi Admin.
  Jalur retry/pembuatan arsip Admin existing dipertahankan. Tidak ada perubahan generator, snapshot,
  file asli, versi, storage atau API dokumen. Ketersediaan formulir mengikuti `submittedAt` yang sudah
  digunakan endpoint existing; scan mengikuti metadata dokumen yang dikembalikan server.
- Tanggal ditampilkan seperti `15 Oktober 2026`, bulan `Oktober 2026`; date-only diformat UTC
  agar tidak bergeser akibat timezone browser. Timestamp diformat Asia/Jakarta dengan label WIB.
- Pada ponsel, kalender bulanan tetap opsional dan agenda ringkas tetap tersedia. Distribusi Pegawai
  dapat dibuka sesuai kebutuhan. Badge “Ada pengembalian saldo” dapat dibuka dengan keyboard;
  penjelasan mempertahankan periode persetujuan dan tidak menyimpulkan tanggal penggunaan aktual.
- UI memakai “Kalender hari libur”. Sumber, tahun, versi dan ketiadaan data tetap dijelaskan;
  tidak ada konektor pemerintah, data demo libur, atau perubahan perhitungan hari/saldo.

## File utama

| Area                                 | File                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Login/root dan navigasi              | `src/app/page.tsx`, `src/app/pengajuan/page.tsx`, `src/components/authenticated-shell.tsx`                                |
| Beranda dan profil                   | `src/components/dashboard-workspace.tsx`, `src/components/employee-profile.tsx`                                           |
| Daftar, form, detail dan async state | `src/components/workflow-workspace.tsx`                                                                                   |
| Salinan dokumen dan tanggal          | `src/components/leave-outcome-panel.tsx`, `src/components/joint-leave-workspace.tsx`, `src/components/indonesian-date.ts` |
| Visual Pegawai                       | `src/components/employee-workspace.css`                                                                                   |
| Verifikasi                           | `tests/browser/employee-ui.mjs`, regresi Admin/M6/arsip existing, `tests/unit/indonesian-date.test.ts`                    |

Komponen bersama berubah hanya pada label/tanggal/state/dialog terkait. Layout manajemen Admin
secara keseluruhan dipertahankan dan diperiksa melalui regresi browser.

## Verifikasi

Hasil yang dijalankan pada branch ini:

| Gate                                       | Hasil                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, production build          | Lulus                                                                                                                                           |
| Prettier changed files, `git diff --check` | Lulus                                                                                                                                           |
| Unit/HTTP existing                         | 488 tes, 42 file, lulus                                                                                                                         |
| Unit format tanggal baru                   | 4 tes, lulus (Honolulu/Kiritimati/Jakarta, batas tahun WIB)                                                                                     |
| PostgreSQL relevan                         | 42 tes / 4 file lulus: workflow services 14, dokumen 6, dashboard 14, arsip/return 8                                                            |
| Browser UI Pegawai                         | 14 skenario lulus: 9 sesi/API/PostgreSQL nyata + 5 respons terkontrol. Run lengkap 13, lalu satu skenario retry detail tambahan secara terpilih |
| Browser regresi Admin                      | 16 skenario lulus; dominan respons API sintetis dengan sesi/server nyata dan pemeriksaan akses                                                  |
| Browser regresi klaim                      | 7 skenario komponen dengan API sintetis, lulus; assertion navigasi mengikuti `/pengajuan` canonical, bookmark lama diuji terpisah               |
| Browser regresi arsip/keputusan            | 12 skenario komponen terisolasi dengan API sintetis, lulus                                                                                      |
| Browser M6 pada production server          | 9 skenario lulus: 7 sesi/API/PostgreSQL nyata + 2 respons terkontrol                                                                            |
| Production screenshot smoke                | Desktop dan ponsel 390 px dijalankan ulang untuk memeriksa asset produksi dan mengambil screenshot final; lulus                                 |

Integrasi dijalankan dalam dua kelompok agar flag disposable mengaktifkan seluruh suite yang relevan:
20 tes pada workflow/dokumen, dilanjutkan 22 tes dashboard/arsip. Tidak ada suite relevan yang masih
skipped pada hasil akhir gabungan. Browser baru memeriksa login dua role, form tepat tanpa POST
otomatis, single save, terminal/perbaikan, owner denial, pagination lokal, legacy/profil/klaim/Back,
saldo lengkap/PARTIAL/belum disiapkan, mobile 390/320, fokus/Escape, list retry, PDF ready/non-ready,
respons detail/tab terlambat, penjelasan pengembalian dan detail retry. Viewport tablet juga tercakup
regresi Admin dan komponen bersama.

Browser menggunakan identitas dan data sintetis, bukan data pegawai nyata. PostgreSQL pengujian disposable terpisah dari staging/produksi; integrasi dan browser
memakai database berbeda agar fixture tidak saling memengaruhi. Respons browser terkontrol tidak
menjadi bukti integrasi database atau UAT bisnis.

## Screenshot hasil produksi

Diperiksa secara visual setelah render produksi, bukan mockup. Semua nama, pengajuan, saldo dan
libur dalam screenshot adalah **fixture sintetis disposable**, bukan data pemerintah atau pegawai nyata.

- [Desktop 1440 px](screenshots/employee-ui/desktop.png)
- [Ponsel 390 px](screenshots/employee-ui/mobile.png)
- [Dialog form ponsel](screenshots/employee-ui/form-mobile.png)

## UAT dan rollout

- [ ] Login Pegawai ke beranda; Admin tetap ke Kelola Pegawai.
- [ ] Profil, sidebar, bookmark lama, deep-link dan Back browser tetap sesuai konteks.
- [ ] Ajukan Cuti/Izin membuka form yang benar; tidak tercipta draf sebelum Simpan.
- [ ] Draf/perbaikan dapat ditindaklanjuti; ditolak/disetujui/dibatalkan tetap terminal.
- [ ] Catatan perbaikan/penolakan jelas, pesan tidak berpindah antarrecord.
- [ ] Saldo lengkap/PARTIAL/belum disiapkan dibaca dengan benar pada tahun berjalan.
- [ ] Formulir, scan dan PDF final tersedia/tidak tersedia dibedakan tanpa mengubah arsip.
- [ ] Tanggal Indonesia, WIB, pengembalian saldo dan batas makna kalender dipahami pengguna.
- [ ] Desktop/tablet/ponsel, keyboard, Escape/fokus, error/retry dan jaringan lambat diterima.

Tidak ada migration atau konfigurasi baru untuk rollout ini. Promosikan image immutable melalui
proses deployment existing setelah review. Task ini tidak merge, deploy atau menutup issue.
Klaim #109, koreksi #110 dan M6 #112 telah merged; UAT bisnis tetap tertunda. Rollout terbaru
#110/#112 belum dinyatakan terverifikasi tanpa output operator. **M7 laporan PDF/Excel adalah tahap
fitur berikutnya**, bukan bagian PR ini. Lihat `implementation-plan.md` dan checkpoint backlog.

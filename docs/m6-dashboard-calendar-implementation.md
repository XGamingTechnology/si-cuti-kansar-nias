# M6 — Dashboard dan Kalender: implementasi

Base: `origin/staging` `ca27193335849f0c53c06a0acda40089256138a9`.
Branch: `codex/m6-dashboard-calendar`.

PR #110 sudah MERGED pada base, tidak dikerjakan ulang. PR desain #111 masih OPEN
saat implementasi dimulai. `docs/m6-dashboard-calendar-design.md` disertakan dari
branch desain agar PR implementasi dapat ditinjau secara mandiri; PR #111 tidak
di-merge/ditutup otomatis. Instruksi pengguna berikutnya mengesahkan indikator
termasuk penanda pengembalian, menginginkan overlay, dan mengizinkan konektor
pemerintah ditunda. Klaim Cuti Bersama tidak diubah; UAT bisnisnya tetap tertunda.

## Perilaku

- Navigasi **Dashboard & Kalender** menuju `/dashboard`, untuk kedua role. Jalur
  root/login/profil existing dipertahankan. Tautan agenda menuju `/pengajuan` dengan
  kind/request; workflow existing membuka detail melalui API yang tetap memeriksa
  otorisasi. Tidak ada approval atau mutasi saldo baru pada dashboard.
- Ringkasan fixed memakai pembacaan tersendiri dengan periode valid, terpisah dari
  filter distribusi/agenda. Antrean SUBMITTED mencakup semua periode; distinct
  pegawai APPROVED hari ini memakai tanggal bisnis Asia/Jakarta. Kartu tidak ikut
  kosong/error ketika input rentang filter lain invalid. Tidak ada indikator kesiapan.
- Distribusi Cuti/Izin, kalender bulanan dan agenda menggunakan parent status dan
  **revisi yang dirujuk currentRevisionNumber**, overlap tanggal inklusif. Kalender
  menghitung request per tanggal dan total unik terpisah. Tidak menjumlahkan sel
  menjadi penggunaan hari atau total request unik. Pegawai nonaktif historis tetap
  masuk cakupan record; tidak menyatakan kehadiran aktual.
- Default APPROVED. Filter tipe/status/pegawai dan batas tanggal sesuai desain;
  DRAFT hanya status milik sendiri, bukan event kalender. Cuti/Izin terpisah.
  Pengembalian sebagian/penuh tidak memendekkan rentang atau mengubah status:
  EXISTS return pada request/revisi memberi penanda, tanpa mengarang tanggal penggunaan.
- Agenda server keyset `(startDate, requestId)`, default 10/max 50, cursor terikat
  filter dan scope namun bukan credential. SQL tetap memaksakan owner. Pemilih
  pegawai Admin juga berhalaman. Total berasal dari DB, bukan jumlah halaman.
- Saldo self dibaca melalui repository account dan `annualBalanceReadiness` existing;
  endpoint sendiri agar kegagalannya tidak menyembunyikan kalender. Tahun saldo
  berjalan WIB tidak mengikuti filter bulan. Total menjumlahkan nilai tersedia dari
  pembacaan account, termasuk Klaim di luar cap regular. PARTIAL/UNINITIALIZED tidak
  menjadi nol, tidak diinisialisasi atau diperbaiki oleh dashboard.
- DTO request tidak memuat reason/alamat/telepon/evidence/storage key/snapshot.
  Pegawai tidak menerima direktori/identitas orang lain. Authorization ada pada
  HTTP/application dan scope SQL sebelum aggregate/pagination; no-store per principal.
- UI responsif, loading/error/retry/empty terpisah. Di ponsel filter memakai dialog,
  kalender dapat dilipat (agenda didahulukan), dan menu/dialog menjaga fokus/Escape.
  Perubahan filter mereset cursor dan membatalkan respons lama. Pergantian hari WIB
  dan kembali ke tab memuat ulang data; ini bukan scheduler sumber pemerintah.

## Overlay resmi: manual, tanpa konektor pemerintah

Konektor otomatis **ditunda**, sesuai izin pengguna. Pada kajian desain 17 Oktober,
akses kandidat Kemenko PMK dan JDIH PANRB ditolak proxy lingkungan dengan 403 tunnel.
Belum ada endpoint/feed pemerintah terdokumentasi yang berhasil diverifikasi dan
diuji; tidak mengulang pencarian panjang, tidak menggunakan API komunitas berlabel
pemerintah. Tidak ada network fetch eksternal/scheduler, tombol sync palsu, atau
klaim real-time pada runtime M6.

Admin dapat menginput tanggal atau mengimpor JSON berdasarkan dokumen resmi:

- Objek `year`, `sourceReference`, `sourcePublishedOn` (YYYY-MM-DD), `sourceUrl`
  (opsional), dan `events` dengan `date`, `name`, `category`.
- Kategori hanya `PUBLIC_HOLIDAY` / `JOINT_LEAVE`; 1–500 event, tahun sesuai,
  tanggal kalender valid, duplikat tanggal/kategori ditolak. HTTP/import maksimal
  300 KB; body dibaca terbatas bahkan tanpa Content-Length. Unknown fields ditolak.
- Referensi 1–500 karakter setelah trim, nama 1–200, URL opsional HTTPS host `.go.id`
  tanpa credential/port khusus. Server tidak mengambil URL tersebut. Verifikasi
  terhadap SKB/dokumen adalah attestasi Admin, bukan klaim validasi otomatis pemerintah.
- Pratinjau menampilkan seluruh dataset baru dan diff penambahan/penghapusan/perubahan;
  publikasi menggantikan dataset tahun itu secara utuh dan perlu konfirmasi eksplisit.
- Revisi naik per tahun, transaksi/advisory lock menserialkan publikasi; fingerprint
  mengikat input/aktor/expectedVersion. Konflik memerlukan preview ulang. Kunci retry
  mencegah duplikasi; versi/no-op identik tidak membuat publikasi palsu.
- Setiap versi menyimpan sumber/tanggal dokumen/URL, seluruh event, aktor/waktu server,
  checksum **dataset ternormalisasi** (bukan checksum PDF SKB), dan metadata retry.
  Versi append-only, FK aktor RESTRICT; tidak ada jalur edit/hapus histori. Versi
  aktif adalah versi tertinggi yang committed, sehingga pembaca tidak melihat dataset
  setengah jadi. Gagal audit/FK membatalkan publikasi.
- Pegawai/Admin membaca proyeksi libur umum tanpa metadata aktor/retry; histori
  administratif dan publikasi hanya Admin. Legenda/toggle Libur Nasional dan Cuti
  Bersama terpisah dari pengajuan dan tidak mengikuti filter pegawai/status request.
- Dataset belum ada atau overlay error dibedakan dari daftar kosong; kalender request
  tetap berfungsi. UI menyatakan input Admin dan tidak tersinkron otomatis. Tidak
  menyatakan daftar lengkap setahun atau mengarang tanggal/kuota pemerintah.

Overlay **tidak** menulis WorkingCalendarException, account/ledger, workflow,
submission snapshot, dokumen atau eligibility klaim. Tidak ada parser PDF, ekspor,
reminder, roster SAR, indikator siap gerak, kalender pribadi eksternal atau library baru.

## Endpoint baru

| GET                                   | Batas utama                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/api/dashboard/summary`              | kind wajib; from/to default bulan WIB, maks 366 hari; status default APPROVED; fixed + distribusi + katalog label tipe terotorisasi |
| `/api/dashboard/balance`              | Pegawai, self/tahun berjalan; tidak menerima query identitas/tahun                                                                  |
| `/api/dashboard/employees`            | Admin; q maks 100 karakter; limit default 20/max 50; cursor ID                                                                      |
| `/api/calendar`                       | max 62 hari inklusif; bucket tanggal dan uniqueRequestCount                                                                         |
| `/api/calendar/agenda`                | max 366 hari; limit default 10/max 50; cursor keyset; minimal DTO                                                                   |
| `/api/calendar/overlays?year=…`       | Kedua role; current published version atau UNAVAILABLE; otomatis=false                                                              |
| `/api/admin/calendar-overlays?year=…` | Admin history, limit default 10/max 50, before version                                                                              |

POST Admin: `/api/admin/calendar-overlays/preview` dan `/publish`. Keduanya
memvalidasi JSON; publish mewajibkan hasil preview/fingerprint, expectedVersion,
idempotencyKey dan confirmed=true. Tanggal 1900–9999, urutan/batas rentang, tipe
sesuai kind, status unknown/DRAFT dan query unknown divalidasi. Parameter employeeId
pada Pegawai ditolak sebelum membaca sumber; saldo self tidak memakai endpoint Admin.

## File utama

| Area                               | Path                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kontrak/otorisasi/DTO dan validasi | `src/application/dashboard/contracts.ts`, `overlay.ts`, `http.ts`                                                                                                                                |
| Query dan transaksi                | `src/infrastructure/dashboard/reader.ts`, `overlay-repository.ts`, `runtime.ts`                                                                                                                  |
| Delivery                           | `src/app/api/dashboard/`, `src/app/api/calendar/`, `src/app/api/admin/calendar-overlays/`, `src/app/dashboard/page.tsx`, `src/app/pengajuan/page.tsx`                                            |
| UI baru                            | `src/components/dashboard-workspace.tsx`, `dashboard-workspace.css`, `calendar-overlay-admin.tsx`, `use-dashboard-json.ts`                                                                       |
| Integrasi UI existing              | `src/components/authenticated-shell.tsx` (menu/scope dan fokus dashboard), `workflow-workspace.tsx` (deep-link baca saja)                                                                        |
| Database                           | `prisma/schema.prisma`, migration forward baru di bawah                                                                                                                                          |
| Tes                                | `tests/unit/dashboard.test.ts`, `tests/http/dashboard.test.ts`, `tests/integration/dashboard.test.ts`, `tests/browser/m6-dashboard.mjs`, penyesuaian fokus `tests/browser/admin-employee-ui.mjs` |
| Dokumen                            | Desain #111 yang disertakan dan dokumen implementasi ini                                                                                                                                         |

## Migration dan rollout

Migration forward baru `20261017120000_calendar_overlay_versions` hanya menambah
`CalendarOverlayVersion`, unique/index, FK dan trigger immutable. Relasi pada User
mempertahankan aktor. Migration lama dan package.json/package-lock.json tidak diubah.

Setelah review/izin rollout: `prisma migrate deploy` sebelum menjalankan image baru,
generate Prisma/build melalui pipeline, lalu health dan UAT. Tidak ada env/secret
konektor baru atau seed data pemerintah. Dataset awal tetap belum tersedia sampai
Admin menerbitkan data dari sumber sah. Backup/retensi versi perlu mengikuti operasi
DB; rollback aplikasi tidak boleh menghapus histori overlay. Tidak mengakses DB
staging/produksi, reset shared DB, merge/deploy atau menutup issue pada task ini.

## Verifikasi yang dijalankan

- Production build, typecheck, lint tanpa warning, Prisma validate, Prettier file
  TS/TSX/CSS/MD berubah dan git diff --check.
- Unit/HTTP penuh: **488 tes / 42 file**; 46 tes baru M6 dalam 2 file, termasuk
  filter/WIB/leap/range, cursor scope, unknown fields/authority, body bound, auth dan
  error aman. Focused M6 juga dijalankan sesudah perubahan kontrak tes.
- PostgreSQL penuh: **127 tes / 18 file** pada PostgreSQL 18.1 disposable dengan
  owner non-superuser. **14 tes baru** M6 membuktikan projection/owner/current revision,
  distinct vs request, boundary WIB, status, inclusive cross-year, partial/full return,
  pagination, saldo missing/PARTIAL/Klaim di luar cap regular, publication/rollback/
  concurrent/retry/FK/append-only dan tidak ada perubahan saldo/dokumen/exception.
- Browser M6: **9 skenario**. Tujuh memakai sesi, API dan PostgreSQL nyata: Admin
  filter/pagination/deep-link, owner/saldo/DTO, publikasi/manual, konflik, import JSON,
  desktop/mobile filter/menu/fokus/Escape dan missing overlay. Dua mengintersep
  respons untuk loading/error/retry dan race deep-link; tidak diklaim sebagai E2E tanpa mock.
- Browser regresi Admin existing: **16 skenario**, API fixture/mock sebagaimana
  runner existing; pengecekan fokus mengikuti link aktif, bukan mengasumsikan menu
  Pegawai selalu item pertama setelah penambahan Dashboard.
- Browser dan integration memakai database disposable **berbeda** agar penulisan
  fixture tidak mengganggu pengujian invariant. Semua data/screenshot sintetis;
  tidak ada dataset libur resmi/demo yang dikirim ke staging.

Contoh reproduksi dengan database disposable yang sudah dimigrasikan dan env runtime
existing: `npm test`; `SI_CUTI_DISPOSABLE_TEST_DB=1 npm run test:integration`;
`npm run typecheck`; `npm run lint`; `npm run build`.
Browser: server produksi port 3196, DATABASE_URL ke DB browser terpisah,
`SI_CUTI_DISPOSABLE_TEST_DB=1`, `SI_CUTI_PLAYWRIGHT_MODULE` lokasi Playwright eksternal,
opsional `SI_CUTI_CHROMIUM_EXECUTABLE`, `SI_CUTI_M6_TEST_URL`,
`SI_CUTI_M6_SCREENSHOTS`; jalankan `node tests/browser/m6-dashboard.mjs`.
Tidak memasang Playwright ke dependencies aplikasi.

## UAT yang masih diperlukan

- Admin/pegawai mengakses menu baru dan record nyata sesuai role; tidak ada PII detail
  pada payload kalender; tautan membuka request yang benar.
- Konfirmasi angka antrean semua periode, distinct pegawai hari ini WIB dan filter
  current revision; APPROVED dengan return tetap memiliki periode/badge yang jelas.
- Saldo sendiri cocok dengan layanan saldo, termasuk tahun/peralihan hari, belum siap
  dan PARTIAL; tidak ada inisialisasi/mutasi dari dashboard.
- Input/import SKB sah oleh Admin, review diff penghapusan, konfirmasi publikasi,
  konflik dua tab, retry dan pembacaan versi lama; label tanpa sinkronisasi otomatis.
- Tahun tanpa dataset, kedua kategori/toggle, overlay error vs request error, ponsel/
  tablet, keyboard dan pembatalan dialog. Tidak menyimpulkan libur sebagai absensi.
- Koneksi pemerintah baru menjadi task terpisah setelah endpoint resmi dan kontraknya
  terverifikasi; tidak menganggap health atau gate otomatis sebagai UAT bisnis.

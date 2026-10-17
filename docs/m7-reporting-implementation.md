# M7 R1/R2 — Implementasi dan runbook

Base `origin/staging` `e81b6f0261f35cf7265e27c0680b381cdb186c0b`; branch
`codex/m7-reporting-implementation`. Desain #114 masih **open** saat pekerjaan dimulai;
dokumen desain disertakan dalam branch ini agar PR implementasi mandiri. Tidak melakukan merge #114.
Keputusan stakeholder 17 Oktober 2026 WIB dicatat di `m7-reporting-design.md` dan amendment
M7 `decision-log.md`: R1/R2, akses Admin pembuat aktif, audit durable 90 hari, akses 24 jam,
penghapusan file aktif maksimal 48 jam, dengan backup dan retensi domain tetap terpisah.

## Perilaku dan file utama

- `application/reporting/{contracts,service,http}.ts`: filter strict/default APPROVED/non-draf,
  owner Admin aktif, snapshot, signed cursor, retry, expiry dan fail-closed audit. Pegawai tidak
  memperoleh hak ekspor. Audit gagal = tidak ada hasil/unduhan yang dilayani.
- `infrastructure/reporting/reader.ts`: satu transaksi read-only RepeatableRead dengan timeout
  statement 10 detik; parent JOIN currentRevisionNumber, overlap DATE inklusif, master/label filter
  saat snapshot. EXISTS return pada request+revision. 1001st row menolak hasil, bukan dipotong.
  Status bukan status historis akhir periode; hari tahunan adalah nilai revisi tersimpan, bukan
  pemakaian aktual, tanpa prorata atau pengurangan return. Izin tidak memiliki kolom hari tahunan.
- `repository.ts`: transaksi koordinasi per actor dengan try-advisory-lock (429 bila sibuk),
  metadata + audit terpublikasi dalam satu commit. Transaksi baca terpisah dan sudah selesai sebelum
  render/file IO. Tidak menahan lock workflow. Snapshot/artefak immutable, retry command terikat
  actor/payload/format/run. Format kedua dapat gagal tanpa merusak format pertama atau dataset.
- `files.ts`: namespace laporan privat terpisah, marker namespace, guard path/symlink, ukuran dan
  checksum diverifikasi sebelum publikasi/unduh. File sudah tertulis tetapi commit gagal dibersihkan
  best effort; purger filesystem menangani orphan/temp jika proses mati sebelum jurnal lengkap.
  Ini **bukan transaksi atomik lintas SQL/filesystem**.
- `renderers.ts`: PDF A4 landscape/font existing, wrap/header berulang/footer Halaman x/y,
  metadata/filters/checksum dan ringkasan; XLSX OOXML tiga sheet (Metadata/Data/Ringkasan), NIP/ID
  string, angka numeric, null kosong, tanggal ISO teks, tanpa formula/link otomatis/macro.
  Tidak menggunakan generator arsip keputusan, cap/tanda tangan/nomor surat.
- `app/api/reports/runs/**`: POST create, GET preview, POST exports, GET artifact; seluruhnya
  session + role/owner server-side. Download melakukan pengecekan sesi lagi setelah IO. DTO tidak
  memuat alasan/alamat/telepon/bukti/key. No-store/private/nosniff; filename server-generated.
- `components/reporting-workspace.*`, `app/admin/laporan/page.tsx`, `authenticated-shell.tsx`:
  menu Admin, Cuti/Izin terpisah, filter, preview 25 baris server, PDF/XLSX run yang sama,
  perubahan filter meminta run baru, loading/empty/error/size/expiry/audit/retry/conflict, mobile
  filter dialog/keyboard/Escape/focus dan respons lama diabaikan. Tidak ada UI R3–R5 atau audit umum.
- `cleanup.ts`, `scripts/report-cleanup.ts`, `scripts/run-report-maintenance.sh`,
  `ops/reporting/cron.example`, target Docker `report-maintenance`: job operasional terpisah.

Migration forward baru: **`20261017150000_reporting_runs_and_audit`**. Menambah ReportRun,
ReportArtifact, ReportExportRequest dan ReportAuditEvent serta immutable/retention guards.
Tidak mengubah migration lama. Tidak ada perubahan `package.json`/lockfile atau dependency baru.

### Batas dan konsistensi

1–366 hari; maksimum 1.000 baris/5 MiB dataset; 10 MiB artefak; PDF 100 halaman. Preview limit 1–100
(default 25; UI dapat memilih 10/25/50), cursor terikat run/actor/checksum. Tidak ada silent truncation; PDF bisa ditolak batas
halaman walau XLSX masih bisa dibuat dari run yang sama. Render sinkron dibatasi 20 detik dengan
pengecekan deadline; koordinasi maksimal 60 detik. JSON request maksimum 16 KiB.

Data source hanya dibaca saat create; preview/export/download tidak query ulang domain. Label master
serta pilihan pegawai/jenis dibekukan bersama dataset. Snapshot version/checksum tetap identik
setelah master/workflow/return berubah. Role/keaktifan dan expiry diperiksa ulang setiap operasi;
expiry 24 jam tidak bergantung pada purger. Retensi SQL manifest/command/artefak metadata mengikuti
purge privileged 90 hari; filter SQL teredaksi, raw search/PII hanya di file privat. Retry key dijamin selama metadata masih disimpan; setelah retensi metadata 90 hari, gunakan UUID baru untuk permintaan baru.
Tidak ada
inisialisasi/rollover/mutasi saldo, workflow, klaim, bukti, arsip atau WorkingCalendarException.

Audit append-only: actor/role, waktu UTC, jenis/event/status, filter teredaksi, format/count,
correlation/run ID dan checksum. Nama/NIP pencarian dan unit kerja bebas memakai keyed digest, tidak dicetak ke log.
Tidak mengambil source IP dari header client yang tidak mempunyai boundary proxy tepercaya pada
modul ini. DOWNLOAD_AUTHORIZED merekam izin server mulai melayani, **bukan** bukti file tersimpan
pada perangkat. Stream/transport putus sesudah buffer diserahkan tidak dapat dipastikan oleh
service; tidak ada event palsu “diterima”.

## Konfigurasi dan rollout operator (belum dijalankan pada VPS)

Runtime M7 memerlukan:

| Variable                          | Kebutuhan                                                                                                                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REPORT_STORAGE_PATH`             | Path absolut volume M7 khusus, contoh `/var/lib/si-cuti/reports`; terpisah dan tidak berada di dalam/di atas PRIVATE_STORAGE_PATH atau public/                                                                                  |
| `REPORT_AUDIT_HASH_KEY`           | Secret acak minimal 32 karakter, berbeda staging/produksi, disimpan melalui mekanisme secret existing; jangan memakai secret contoh tes. Dapat dibuat operator dengan `openssl rand -hex 32`, jangan kirim nilainya ke chat/log |
| `REPORT_MAINTENANCE_DATABASE_URL` | **Hanya job audit**, login maintenance dedicated dengan EXECUTE fungsi retensi saja, bukan credential app/migration. Jangan injeksikan ke web                                                                                   |

Key hash dipin operasional selama masa hidup run. Rotasi setelah run aktif 24 jam berakhir atau
melalui prosedur kompatibilitas; key berubah dapat membuat retry/cursor lama tidak cocok. Saat
mengubah definition/renderer version di rilis berikutnya, pertahankan reader/renderer lama selama
grace akses atau informasikan kebutuhan run baru; jangan render ulang v1 memakai aturan v2 diam-diam.

Checklist rollout yang memerlukan output operator:

1. Review PR/migration, backup sesuai prosedur existing dan catat cakupannya, build image web dan
   image maintenance **dari commit yang sama** (`docker build --target report-maintenance …`).
2. Tambahkan named volume khusus **per environment** ke konfigurasi Compose/operator, mount pada
   REPORT_STORAGE_PATH web. Inisialisasi volume kosong owner UID:GID **1001:1001**, mode 0700;
   root harus kosong saat marker M7 dibuat oleh aplikasi pada preview pertama. Jangan memakai/menandai volume dokumen domain existing.
   Jangan bind volume laporan ke Nginx/public. Target maintenance memakai UID 1001 yang sama.
3. Atur dua variable web di atas; deploy migration dengan role migration existing sebelum image web.
   Role web non-owner harus memiliki SELECT/INSERT manifest, artefak, command dan audit; migration
   mencabut UPDATE/DELETE audit yang mungkin diwariskan default grants. Jangan memberi web EXECUTE
   fungsi retensi, ownership tabel atau izin disable trigger.
4. DBA membuat login maintenance NOSUPERUSER/NOCREATEDB/NOCREATEROLE tanpa DDL/table DELETE,
   CONNECT database + USAGE public + hanya `GRANT EXECUTE ON FUNCTION public.m7_purge_report_audit()
TO <role_maintenance>;`. Fungsi SECURITY DEFINER milik migration owner, search_path terikat
   pg_catalog/public/pg_temp, cutoff DB tetap 90 hari dan tanpa argumen cutoff dari client. Ia juga
   menghapus manifest/artefak/command SQL yang cukup tua; tidak mengakses tabel domain lain.
5. Jalankan verifikasi hak dengan `has_function_privilege` dan `has_table_privilege` sebagai role
   web: EXECUTE retention = false dan DELETE audit = false. Test job audit memakai login maintenance.
6. Review dan pasang scheduler **secara terpisah**, per bagian berikut. Uji check/files/audit,
   pemantauan serta permission/storage disk; jangan menyatakan target 48 jam terjaga hanya karena
   cron tercantum di repo. Simpan log/image IDs/hasil job/health dan lakukan UAT.

Tidak ada cron yang dipasang, VPS yang diubah, atau DB staging/produksi yang diakses oleh task ini.

## Job pembersihan dan pemantauan

Image maintenance memakai dependency existing, CLI dibundel esbuild; web standalone tidak perlu
menyertakan tooling atau credential maintenance. Perintah lokal ekuivalen untuk verifikasi:

```sh
npx esbuild scripts/report-cleanup.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/m7/report-cleanup.mjs
node node_modules/.cache/m7/report-cleanup.mjs check
node node_modules/.cache/m7/report-cleanup.mjs files
# Dengan REPORT_MAINTENANCE_DATABASE_URL khusus, bukan DATABASE_URL web:
node node_modules/.cache/m7/report-cleanup.mjs audit
```

`check`/`files` **tidak membuat marker atau menginisialisasi root**; jalankan satu preview Admin yang sah dahulu setelah guard namespace web memverifikasi volume terpisah. Root tanpa marker ditolak, termasuk root kosong, agar job tidak menandai volume dokumen yang salah.

`check`/`files` memerlukan REPORT_STORAGE_PATH dan PRIVATE_STORAGE_PATH; tidak memerlukan koneksi
DB/key hash. Root khusus dan marker wajib; file/prefix/symlink tak dikenal tidak dihapus diam-diam.
`files` menghapus seluruh file valid berumur **≥24 jam**, termasuk JSON dataset, PDF, XLSX dan temp
orphan. `rm(force)` dan scan ulang membuat retry idempotent. Menghapus pada 24 jam memberi margin
menuju deadline aktif 48 jam. `check` dry-run tidak mengubah isi dataset/artefak.

Output JSON: scanned, eligible, deleted, failed, oldestAgeHours, overdue36h, overdue48h,
remainingEligible, dryRun, healthy. Umur/backlog adalah pengamatan **sebelum** percobaan delete;
check sesudah purge memberi backlog aktual tersisa. Exit nonzero bila delete/namespace gagal atau
check menemukan backlog ≥36 jam; stderr tidak mencetak credential/isi file/stack raw.
Koneksi job audit dibatasi 5 detik, query 35 detik dengan statement timeout SQL 30 detik.

Audit job menghasilkan jumlah event terhapus dan event AUDIT_RETENTION baru; seluruh statement
retensi dalam satu transaksi fungsi. App biasa tidak bisa memanggilnya atau menghapus audit umum.

Jadwal konkret pada `ops/reporting/cron.example`: file purge **setiap 10 menit**, dry-run check
**setiap 10 menit**, audit harian **19:30 UTC = 02:30 WIB** (contoh mensyaratkan host cron UTC;
untuk host WIB gunakan 02:30). File failure otomatis dicoba lagi pada slot 10 menit berikutnya.
`flock` mencegah dua job mode/environment sama overlap. Contoh instalasi wrapper operator:

```sh
#!/bin/sh
set -eu
# File root-owned 0600, tanpa echo/set -x. Berisi IMAGE, ENV_FILE, VOLUME atau NETWORK.
. /opt/si-cuti-env/report-files-staging.conf
exec /opt/si-cuti-repo/scripts/run-report-maintenance.sh "$@"
```

Buat wrapper kedua `report-audit-staging` yang membaca konfigurasi audit khusus. Untuk file job,
REPORT_MAINTENANCE_ENV_FILE 0600 berisi `REPORT_STORAGE_PATH=/reports` dan PRIVATE_STORAGE_PATH
sesuai konfigurasi domain; mount **hanya volume M7** ke `/reports` melalui REPORT_STORAGE_VOLUME.
Wrapper menjalankan file/check dengan `--network none`. Untuk audit, env file terpisah hanya
memuat REPORT_MAINTENANCE_DATABASE_URL dan REPORT_MAINTENANCE_NETWORK menunjuk jaringan DB
internal environment. REPORT_MAINTENANCE_IMAGE wajib dipin commit/digest. Jangan mencampur volume,
network, config atau credential staging dan produksi.

Operator wajib menghubungkan stdout/status job ke monitor existing: alert pada exit nonzero,
check missed >20 menit, audit missed >26 jam, pending ≥36 jam (warning) dan ≥48 jam (critical),
serta disk penuh/permission error. Catat last-success dan backlog; log file perlu logrotate tanpa
menghapus audit DB. Transport alert/instalasi monitor belum diaktifkan oleh task ini. Setelah outage,
retry manual dan check sampai backlog bersih; jangan mengklaim jaminan 48 jam jika host/scheduler
mati atau backlog tidak ditangani. Expiry akses server tetap berlaku walau purger gagal.

## Cakupan backup dan salinan

`scripts/backup-documents.sh` mengarsipkan **seluruh PRIVATE_STORAGE_PATH**. Karena REPORT_STORAGE_PATH
harus namespace/volume terpisah, default backup dokumen tersebut tidak mencakup byte dataset/PDF/XLSX
M7. Jangan menaruh laporan di volume domain untuk mencoba memakai purger yang sama. Dump PostgreSQL
existing tetap bisa mencakup metadata run/audit teredaksi dan data domain lain. Backup filesystem penuh,
snapshot volume/VM dan backup provider mungkin mencakup volume M7 jika operator mengaturnya.

**Akses 24 jam/penghapusan aktif maksimal 48 jam bukan jaminan penghapusan backup, snapshot, atau
salinan yang sudah diunduh.** Retensi/rotasi/enkripsi/akses/off-VPS/restore backup mengikuti runbook
backup dan keputusan operator yang terpisah; nilainya tidak diasumsikan 48 jam atau 90 hari. Operator
harus mencatat apakah volume M7 dikecualikan, tujuan dan jadwal expiry salinan, serta memastikan hasil
restore tidak membuka kembali run expired (expiry timestamp tetap asli; purge sebelum membuka layanan).
Tidak ada perubahan retensi pengajuan, ledger, bukti, histori koreksi atau PDF keputusan final.

## Verifikasi dan keterbatasan

Dijalankan pada 17 Oktober 2026 WIB, Node 24 / PostgreSQL 18.1 disposable, data sintetis.
Tidak ada koneksi DB staging/produksi.

| Pemeriksaan                          | Hasil yang benar-benar dijalankan                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`, `npm run typecheck`  | Lulus                                                                                                                                                                                                        |
| `npm test`                           | **535 test, 46 file** unit/HTTP lulus; termasuk 43 test M7 (27 unit kontrak/renderer/storage/cleanup, 11 service, 5 HTTP)                                                                                    |
| `npm run test:integration`           | **141 test, 19 file** lulus pada DB disposable, termasuk 14 M7                                                                                                                                               |
| `npm run build`                      | Production build lulus                                                                                                                                                                                       |
| Browser M7 terhadap production build | **8 skenario** lulus: **6 sesi/API/PostgreSQL nyata** memakai role web non-owner dan **2 MOCK** untuk audit/limit/expiry/busy/conflict, late response dan double click                                       |
| Browser Admin existing               | **16 skenario** lulus; suite existing memakai sesi nyata dan banyak respons API mock, bukan 16 E2E database                                                                                                  |
| Prisma, format/diff, shell           | `prisma validate`, Prettier changed files, `git diff --check`, `sh -n scripts/run-report-maintenance.sh` lulus                                                                                               |
| Image/CLI maintenance                | Target Docker berhasil dibangun; CLI aktual UID 1001 menolak root tanpa marker, mendeteksi 4 file/temp usia 49 jam, menghapus 4, retry menghapus 0; audit berhasil dengan maintenance dan ditolak dengan web |

Integrasi M7 mencakup pointer current revision (bukan max), overlap lintas tahun, status/nonaktif,
EXISTS pengembalian tanpa hitung ganda, frozen snapshot setelah master/workflow/return berubah,
1000/1001 baris dan pagination, timeout statement PostgreSQL nyata saat tabel terkunci,
owner/role/deactivation, rollback audit, checksum, expiry dan fixed-cutoff retensi 90 hari.
Hash sebelum/sesudah 11 tabel domain tetap sama selama preview/export/download. Pengujian storage
juga menyuntikkan permission/delete failure lalu retry; umur/expiry memakai clock terkontrol.
Fixture workflow mutable dibersihkan seusai suite agar tidak mengotori hitungan suite M6. Guard
no-JWT tetap memindai source buatan aplikasi/dependency; hanya `src/generated` Prisma (embedded
base64 WASM yang dapat kebetulan mengandung substring jwt) dikecualikan dari scan teks.

Validasi Docker cloud memerlukan CA proxy tepercaya environment untuk `npm ci`: digunakan secret
mount CA **hanya saat build** pada salinan sementara Dockerfile; TLS tetap diverifikasi, CA tidak
masuk image/repo, dan Dockerfile sumber tidak dilonggarkan. Build Docker tanpa CA tambahan gagal
karena rantai sertifikat proxy; keberhasilan yang dilaporkan adalah build dengan CA tepercaya tersebut.
CLI aktual kemudian diuji dari image hasil build, bukan sekadar bundle host. Tidak memasang cron.

### Bukti berkas dan inspeksi visual

Berkas berikut adalah **output unduhan aktual browser dari fixture sintetis**, bukan data pegawai
nyata atau dokumen keputusan resmi. R1 berisi 30 pengajuan/2 pegawai, R2 berisi 1 pengajuan;
masing-masing punya run/checksum sendiri. R1 tetap memakai identitas snapshot setelah master diganti.

- [R1 PDF](samples/m7/r1-report.pdf) dan [R1 XLSX](samples/m7/r1-report.xlsx).
- [R2 PDF](samples/m7/r2-report.pdf) dan [R2 XLSX](samples/m7/r2-report.xlsx).
- Render `pdftoppm`, diperiksa visual: [halaman pertama R1](screenshots/m7/r1-pdf-preview.png)
  dan [R2](screenshots/m7/r2-pdf-preview.png). A4 landscape, wrap, header berulang dan footer halaman
  terbaca; R1 lima halaman, R2 satu halaman. Test tambahan menguji wrapping panjang/limit halaman.
- UI production: [desktop](screenshots/m7/admin-report-desktop.png),
  [ponsel 390px](screenshots/m7/admin-report-mobile.png); pagination server dan dialog keyboard/Escape diuji.
- [Checksum dan hasil inspeksi](samples/m7/inspection.json). XLSX aktual dibuka dengan `zipfile`/XML parser/openpyxl: CRC/XML valid, tiga sheet,
  NIP 18 digit tetap string berawalan nol, angka numeric, null kosong, header freeze/filter,
  tanpa formula/macro/external link dan tanpa sentinel informasi pribadi. Test unit mencakup
  formula-like input `= + - @`, XML escaping serta null versus nol.

**Excel/LibreOffice desktop belum diuji**, sehingga interoperabilitas aplikasi tersebut tetap UAT;
pembacaan ZIP/XML/openpyxl tidak dianggap sebagai bukti itu. Retensi/jadwal/alert baru diuji lokal,
belum dipasang atau dibuktikan berjalan pada VPS. UAT bisnis dan bukti deployment tetap pending.

## UAT bisnis dan operasional (tetap pending)

- [ ] Admin A/B, Pegawai, anonymous, demotion/deaktivasi dan IDOR run/artefak.
- [ ] R1/R2 terpisah, default/non-draf, pegawai/jenis nonaktif, periode penuh lintas tahun dan WIB.
- [ ] Current revision, master saat snapshot, count pengajuan vs pegawai unik; return tidak mengganda,
      tidak mengubah APPROVED atau mengklaim pemakaian aktual.
- [ ] Preview/PDF/XLSX snapshot sama setelah sumber berubah; NIP teks, angka/null, layout panjang,
      formula-like content, sheet/header/halaman/filter dan aplikasi Excel/LibreOffice nyata.
- [ ] Filter baru/run baru, pagination, unknown-response retry, busy/conflict, empty/limit/expiry,
      audit outage, storage/renderer failure; tidak ada hasil tanpa audit durable.
- [ ] Desktop/tablet/ponsel, keyboard/Escape/focus, loading/error/retry dan respons terlambat.
- [ ] Operator menyediakan bukti migration/image/health, role maintenance minimal, jadwal job,
      expiry 24 jam, backlog/retry/alert dan delete semua format/temp; kebijakan backup tercatat.

CI atau screenshot tidak menutup UAT. Tidak merge, deploy atau menutup issue otomatis.

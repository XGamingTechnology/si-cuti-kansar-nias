# Foto profil pribadi — implementasi dan rollout

Base `origin/staging` `412a6141b4cfc60cdf4f134e9029cc3cdab860e3`, branch
`codex/private-profile-avatar`. Permintaan pengguna 18 Oktober 2026 WIB mengizinkan foto
akun sendiri untuk Admin dan Pegawai. Tidak memberi Admin akses foto pegawai lain.
AGENTS.md, baseline kebutuhan/arsitektur/schema/alur/desain/traceability, DOC-003 dan pola
private storage/audit diperiksa; tidak mengubah aturan cuti/izin atau retensi domain.

## Perilaku dan akses

- `/profil` tersedia bagi kedua role. Profil lama `/#profil` Pegawai tetap berfungsi.
  Header/sidebar menjadi tautan Profil Saya; foto juga ada pada editor profil.
- Memilih file hanya membuat preview blob lokal; PUT baru berjalan saat **Simpan foto**.
  Hapus memerlukan dialog konfirmasi, Escape/focus restoration memakai komponen existing.
  Loading/error/retry/status Bahasa Indonesia. Gagal memuat gambar memakai inisial existing.
- GET `/api/me/avatar` mengembalikan version, hasPhoto, updatedAt dan URL self berversi saja.
  GET `/api/me/avatar/image?v=N` mengirim foto **sesi yang sedang aktif**, bukan foto pemilik
  URL yang dapat dibagikan. Tidak menerima ID pengguna/pegawai, storage key, directory atau URL eksternal.
  Query tambahan/berulang/traversal ditolak. Tidak ada endpoint avatar pengguna lain.
- PUT `/api/me/avatar`: body byte JPEG/PNG, Content-Type tepat, `If-Match: "N"`, UUID
  `Idempotency-Key`. DELETE endpoint sama dengan dua header tersebut dan **tanpa payload**.
  Seluruh operasi memerlukan sesi; service memeriksa lagi User/Employee aktif. Identitas hanya
  `actor.userId` dari sesi server. Admin tidak punya override pemilik.
- Semua respons (termasuk error/image) `private, no-store, max-age=0`, Vary Cookie, nosniff.
  Gambar dilayani melalui endpoint terautentikasi; tidak memakai next/image proxy/shared cache.
  Versi meningkat pada ganti/hapus; URL versi lama404. Provider memperbarui header/sidebar/editor
  tanpa logout, menolak respons metadata lama dan mereset fallback gambar saat reload/version berubah.
- Origin write dicocokkan terhadap Host yang dipertahankan proxy existing, bukan URL HTTP internal
  Next atau X-Forwarded-Host client. Sec-Fetch-Site cross-site ditolak; custom retry/version header
  wajib. Endpoint tidak menyediakan CORS untuk origin lain; session cookie existing tetap dipakai.

## Decoder, dependency dan data

`sharp@0.34.5` sudah transitif melalui Next16.1.6. Kini dipin sebagai dependency langsung agar
kode aplikasi tidak bergantung pada dependency transitif opsional. **Tidak meng-upgrade Sharp
atau versi transitive lain**; lockfile hanya menambah deklarasi root dan menjadikan dependency
terkait diperlukan. pdf-lib/OOXML existing bukan decoder/resize JPEG/EXIF yang memenuhi kebutuhan.
Tidak menambah UI library atau editor crop.

`normalizeAvatar`: input 1byte–5MiB, JPEG/PNG hasil identifikasi decoder harus cocok dengan MIME,
satu frame, tolak GIF/SVG/format lain serta APNG acTL. Signature JPEG/PNG diperiksa sebelum memilih native loader (SVG tersamar tidak masuk loader SVG). Metadata dibaca dahulu; limitInputPixels
16.777.216 dan maksimum sisi8192. Maksimal dua decode pixel bersamaan per proses (429 bila sibuk).
Full decode strict menolak truncation/rusak, auto-rotate orientasi EXIF, resize inside512×512 tanpa
memperbesar, re-encode JPEG/PNG. Tidak memakai keepMetadata/withMetadata; EXIF/ICC/XMP dihapus.
Alpha PNG dipertahankan. Preview lokal tidak menggantikan validasi server.

Migration forward **`20261018100000_private_profile_avatar`**:

- `UserAvatar`: pointer foto aktif/tombstone dan versi monotonic, checksum, MIME/dimensi tervalidasi.
- `AvatarOperation`: aktor User FK, timestamp DB server, UUID retry, hash payload, action
  UPLOAD/REPLACE/DELETE dan resultVersion. Append-only trigger menolak update/delete/TRUNCATE; tidak menyimpan
  bytes, EXIF atau storage key dalam audit. Tidak menambah UI audit/direktori. Role web cukup SELECT/INSERT/UPDATE UserAvatar dan SELECT/INSERT AvatarOperation (selain hak auth existing); jangan grant DDL/TRUNCATE/trigger bypass.

Audit mutasi sukses dan pointer terkomit dalam transaksi SQL yang sama; audit gagal berarti pointer
lama tetap berlaku. Retry actor/key/payload identik mengembalikan state **terkini** + appliedVersion,
bukan membuka foto versi lama. UI menjelaskan bila operasi replay telah digantikan perubahan yang lebih baru, termasuk retry DELETE setelah upload baru; tidak mengklaim foto terbaru telah dihapus. Key berbeda/stale version409, payload berbeda dengan key sama409.
Metadata berasal dari server; tidak ada foto pada Principal/DTO pegawai, kalender, formulir,
PDF final/arsip lama, laporan atau snapshot keputusan.

## Namespace, concurrency dan cleanup

Env baru **`AVATAR_STORAGE_PATH`** wajib absolut, volume privat khusus, terpisah dari
PRIVATE_STORAGE_PATH, REPORT_STORAGE_PATH (bila digunakan), public/ dan namespace dokumen.
Guard canonical path/inode, root/prefix bukan symlink, key acak32hex dari server, permission
root/prefix0700 dan file0600. Marker `.si-cuti-avatar-storage` menolak adopsi namespace lain.
Tidak ada foto di public/; jangan mount volume ke Nginx/static server.

Publish, read byte aktif dan GC memakai advisory transaction lock namespace avatar yang sama.
Decode berlangsung sebelum transaksi. Transaksi tidak mengambil lock saldo/workflow. File ditulis
lalu checksum diverifikasi sebelum metadata+audit; **filesystem dan SQL bukan satu transaksi atomik**.
Gagal/commit-response tidak pasti **tidak langsung unlink**, agar file yang sudah terkomit tidak
terhapus oleh penanganan error. UI meminta retry key sama atau reload untuk memastikan hasil.

Old/orphan/temp yang tidak direferensikan disapu setelah umur **≥24jam** dengan margin teknis,
bukan menyimpan semua versi selamanya. Aktif selalu dilewati berapapun umurnya. File temp bukan
pointer aktif. GC scan maksimum10.000 file, batch100 di bawah lock publish dan cek ulang pointer;
failed unlink dicatat count dan dicoba lagi pada job berikutnya. File/path/symlink tak dikenal
menggagalkan job, bukan dihapus secara membabi buta. Delete aktif segera menghilangkan akses
endpoint, tetapi bytes unreferenced menunggu job. User nonaktif tidak dapat membaca/mengubah;
fitur ini tidak menetapkan kebijakan offboarding/delete foto otomatis untuk akun nonaktif.

`scripts/avatar-cleanup.ts` dan target Docker **avatar-maintenance** adalah CLI terpisah, tidak
ada endpoint cleanup web. Role maintenance cukup CONNECT/USAGE schema + SELECT UserAvatar;
tidak membutuhkan DELETE audit, trigger bypass atau akses tabel cuti. Contoh jadwal hourly pada
`ops/avatar/cron.example`. Gunakan env/volume berbeda staging/produksi dan image commit/digest yang sama
sebagai web. Jangan menggunakan purger M7 atau memasukkan avatar ke namespace laporan.

Contoh operator (belum dipasang/dijalankan di VPS):

```sh
# Build dari commit yang disetujui; konfigurasi credential hanya file env0600.
docker build --target avatar-maintenance -t <image-pinned-commit> .
docker run --rm --network <network-db-environment> \
  --env-file /opt/si-cuti-env/avatar-cleanup-staging.env \
  --mount type=volume,source=<avatar-volume-staging>,target=/avatars \
  <image-pinned-commit>
```

Env job berisi DATABASE_URL login maintenance SELECT-only, AVATAR_STORAGE_PATH=/avatars,
PRIVATE_STORAGE_PATH dan REPORT_STORAGE_PATH sesuai nama namespace yang diproteksi. CLI tidak
membuat marker/root; pertama kali aplikasi membuat marker pada volume kosong saat upload sah.
Bootstrap owner UID:GID1001:1001 dan0700 pada volume khusus. Uji upload sah lalu job sebelum
mengaktifkan jadwal; tidak menandai volume dokumen existing secara manual.
Output JSON scanned/deleted/failed/active/healthy; exit nonzero bila error/failure. Hubungkan ke
monitor existing: missed>2jam, failed count/disk/permission/DB dan backlog scan>10.000; simpan last-success,
retry dan logrotate. Cron hanya contoh; belum dipasang dan bukan jaminan uptime/penghapusan backup.

## Backup, audit dan restore

Backup dokumen existing mengarsipkan PRIVATE_STORAGE_PATH, **tidak otomatis mencakup volume avatar
terpisah**. Operator perlu menetapkan backup avatar + DB konsisten, akses/enkripsi/off-VPS,
retensi/rotasi dan latihan restore. Dump DB mencakup pointer/audit, bukan bytes foto; backup hanya
salah satu tidak cukup. Restore harus memakai namespace avatar dan checksum yang sesuai serta
memeriksa tombstone/hapus setelah snapshot jika tersedia; jangan menganggap restore backup lama
memenuhi penghapusan yang terjadi kemudian.

Menghapus foto aktif atau sweep orphan **tidak menghapus seluruh salinan backup/VM snapshot,
cache perangkat atau unduhan yang pernah disalin secara langsung**. Retensi backup dicatat operator
terpisah. Audit metadata dipertahankan append-only; tidak menerapkan retensi90hari M7 ke audit avatar
atau mengubah retensi pengajuan/ledger/bukti/histori/PDF final. Tidak menyimpan seluruh versi foto
sebagai histori permanen secara otomatis.

## Verifikasi

Dijalankan pada Node24/PostgreSQL18.1 disposable, semua gambar berupa bidang warna sintetis.
Tidak ada foto pegawai nyata atau DB staging/produksi yang dipakai.

| Pemeriksaan                     | Hasil aktual                                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint/typecheck/production build | Lulus                                                                                                                                                                                                                 |
| Unit/HTTP penuh                 | **571 test / 49 file** lulus dengan `npm test -- --maxWorkers=2`; termasuk13 unit decoder/storage dan10 HTTP avatar                                                                                                   |
| PostgreSQL penuh                | **152 test / 20 file** lulus; termasuk10 integrasi avatar                                                                                                                                                             |
| Fokus avatar                    | **33 test** unit/HTTP/PG lulus; temp/orphan, CAS/retry, audit/storage failure dan unknown commit tercakup                                                                                                             |
| Browser avatar production       | **8 skenario**, **5 real session/API/DB + 3 MOCK**; upload belum disimpan sebelum Save, tiga slot tanpa logout, own Admin/Pegawai, decoder corrupt, confirmation/Escape/mobile, CAS, fallback dan lost-response retry |
| Regresi Pegawai existing        | **14 skenario: 9 real session/API/DB + 5 MOCK** lulus                                                                                                                                                                 |
| Regresi Admin existing          | **16 skenario** lulus, sesi nyata dan banyak respons API mock; bukan16 E2E DB                                                                                                                                         |
| Maintenance image/CLI aktual    | UID1001 + login SELECT-only: root tanpa marker ditolak; file orphan25jam dihapus1, aktif1 dipertahankan; retry deleted0/active1                                                                                       |
| Prisma/format/diff              | Prisma validate, Prettier changed files dan git diff check lulus                                                                                                                                                      |

Gate unit pertama dengan parallelism default mengalami satu timeout5detik pada PDF report existing
saat worker cloud tersaturasi (569 lulus/1 timeout). **Tidak mengubah tes/renderer laporan**;
full suite kemudian lulus dengan2worker. Tidak menyebut percobaan awal tersebut sebagai sukses.

Image maintenance dibangun dari target Docker dengan CA proxy environment tepercaya yang dimount
sebagai secret **build-only** pada salinan Dockerfile sementara. TLS tetap diverifikasi; tidak
memasukkan CA/credential ke repo/image atau melonggarkan Dockerfile sumber. CLI benar-benar
berjalan dari image, bukan hanya bundle host; tidak memasang cron pada VPS.

Bukti visual production, data sintetis: [Profil Pegawai desktop](screenshots/avatar/employee-profile-desktop.png)
dan [Profil Admin ponsel](screenshots/avatar/admin-profile-mobile.png). Lima skenario avatar tanpa
intersepsi memakai sesi/HTTP/PG nyata; tiga MOCK masing-masing memaksakan image503, respons PUT
hilang **sesudah commit nyata**, dan metadata loading/error. Retry terbukti mempertahankan key
serta jumlah audit/versi. Fixture warna tidak menguji kualitas potret manusia.

Safari/iPad asli belum diuji. CI/browser tidak menutup UAT dan bukan bukti deployment. Backup,
jadwal/alert/role dan arsitektur native target operator tetap perlu bukti rollout.

## Checklist rollout dan UAT (pending)

- [ ] Review migration, backup konsisten, generate Prisma dan build web/maintenance commit yang sama.
- [ ] Set AVATAR_STORAGE_PATH dan mount volume privat baru UID1001; pisahkan environment, jangan Nginx/public.
- [ ] Uji dependency native Sharp pada arsitektur image target, health dan sesi aktif.
- [ ] Admin/Pegawai own upload/replace/delete; query authority/anonymous/deaktivasi ditolak.
- [ ] Preview belum tersimpan sebelum Simpan; EXIF/rotasi/512px, JPEG/PNG/alpha, rusak/animasi/oversize.
- [ ] Header/sidebar/profil berubah tanpa logout, fallback, reload, versi lama404; ponsel/keyboard/Escape.
- [ ] Retry unknown commit/concurrency/audit-storage failure, cleanup role SELECT-only, aktif tidak terhapus.
- [ ] Pasang cron/alert, uji missed/failure/retry, dan dokumentasikan backup/restore/retensi actual.
- [ ] Safari/iPad dan browser operator yang belum diuji; UAT bukan digantikan CI/screenshot.

Tidak merge/deploy/VPS/DB staging/produksi, tidak menutup issue UAT lama.

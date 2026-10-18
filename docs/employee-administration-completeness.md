# Pengelolaan Pegawai dan Akun: kelengkapan M2

Base: `origin/staging` **7c35f9e28baf89ce2e21f70c97cb299d51fde809**. Sumber:
AGENTS.md, proposal sumber, requirements/architecture/database-schema/user-flows/design-system/
implementation-plan/traceability, `m2-baseline-decisions.md`, `m2-employee-import.md`,
`m2-auth-recovery.md`. Keputusan pengguna: tidak hard delete; Arsip = Employee nonaktif.
Tidak mengubah aturan saldo, approval, workflow, laporan, kalender atau hak foto pribadi.

## Audit existing dan gap yang dibuktikan

| Kemampuan sebelum PR                                                                                               | Bukti kode existing                                                                                                                                                                                   | Gap / hasil PR                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRUD master, NIP unik, supervisor opsional dan self-supervisor ditolak, sinkron NIP LOCAL                          | `src/application/employees/service.ts`, `src/infrastructure/employees/prisma-employee-repository.ts`                                                                                                  | Reuse. Validasi unknown fields/tanggal diperketat; update/status memakai versi `updatedAt` agar form lama tidak menimpa perubahan baru. Tidak menyentuh snapshot.                                                                                        |
| Daftar dan detail, pencarian, pagination lokal 10 baris                                                            | `src/components/employee-management.tsx`, `admin-pagination.tsx`                                                                                                                                      | Default Aktif; Nonaktif (Arsip)/Semua, filter unit kerja, reset halaman pada filter/search. Dialog ringkas existing mengganti overlay manual.                                                                                                            |
| Employee dan User punya status terpisah; validasi sesi memeriksa Employee/User/Identity setiap request             | `src/modules/auth/service.ts`, `src/infrastructure/auth/prisma-auth-repository.ts`                                                                                                                    | Konfirmasi dampak nonaktif. Cabut sesi saat Employee/User dinonaktifkan agar sesi tidak hidup lagi setelah reaktivasi. Tidak otomatis mengaktifkan User/Identity.                                                                                        |
| Provisioning manual, dua role, reset password dan perlindungan Admin terakhir                                      | `src/application/accounts/service.ts`, `src/infrastructure/accounts/prisma-account-administration-repository.ts`, `src/infrastructure/auth/admin-lifecycle-guard.ts`, `employee-account-controls.tsx` | Reuse kewenangan M2. Busy/error/retry status akun, isolasi komponen per pegawai, hasil akun lama tidak masuk record lain. Tidak menambah tombol recovery operator/self-service.                                                                          |
| XLSX preview tanpa write dan commit all-or-nothing, duplicate NIP file/DB ditolak; tidak membuat User/saldo/atasan | `src/application/employees/import-service.ts`, `src/infrastructure/employees/xlsx-workbook-reader.ts`, `/api/admin/employees/import`                                                                  | Template kosong belum ada: ditambahkan. Maksimum 500 baris, stream upload bounded 2 MiB termasuk multipart, strict field/file tunggal; formula dan numeric NIP ditolak untuk impor pegawai. Durable retry key untuk commit; preview/rincian berpaginasi. |
| Belum ada audit mutasi master/akun persisten                                                                       | Repository employee/accounts tidak menulis event persisten                                                                                                                                            | Event metadata minimum dalam transaksi SQL yang sama; append-only UPDATE/DELETE/TRUNCATE guard. Tidak menjadikan Pino/console sebagai audit.                                                                                                             |

Employment start date adalah field tenure **existing**, bukan field baru PR ini. Relasi atasan
master existing tidak memperoleh histori assignment bertanggal efektif atau kewenangan approval baru.
Admin tidak mendapat akses foto pegawai lain. Hak owner `GET /api/employees/:id` dipertahankan.

## Kontrak dan perilaku Admin

- Tambah/edit memakai service dan endpoint existing; empat field utama wajib, supervisor dan tanggal
  mulai bekerja opsional. NIP tetap string, maksimal32; teks master maksimal200. Tidak membuat saldo.
- `GET /api/admin/employees` tetap daftar master minimal existing. Search/filter/unit/pagination
  **lokal**, 10 baris/halaman; tidak mengklaim server pagination. Cocok cakupan baseline93 pegawai;
  skala besar perlu task pagination/query server, bukan truncation diam-diam pada PR ini.
- Status pegawai dan akun terpisah. `User.isActive=true` tidak menjamin dapat login jika Employee
  atau identity nonaktif. Status akun bukan indicator credential/recovery/izin cuti.
- Edit dan status HTTP memerlukan `If-Match: "<updatedAt ISO dari GET>"`. Snapshot versi form
  disimpan saat membuka edit, bukan mengambil ulang timestamp sesaat sebelum submit. Konflik409:
  tutup form, muat ulang daftar/halaman, periksa perubahan terbaru dan buka edit kembali.
- Nonaktif/aktif kembali memakai dialog konfirmasi dengan dampak login/histori. Nonaktif mencabut
  seluruh sesi target; reaktivasi tidak memulihkannya. User/identity yang nonaktif tetap demikian.
  Admin terakhir yang dapat login tetap dilindungi lock/invariant existing.
- Akun manual/provision/ubah role/status/reset LOCAL tetap kebijakan M2; kata sandi tidak dapat
  dipulihkan. Tidak menampilkan hash/token atau menaruh password di template/log. Reset diri sendiri
  tetap mencabut sesi sendiri. Password form bersifat sementara dan dikosongkan saat reload status.
- Recovery operator CLI existing tetap proses darurat terpisah di `m2-auth-recovery.md`; PR tidak
  menambah kewenangan/tombol recovery, kanal email/telepon atau log login umum. Tidak menjalankan CLI
  recovery terhadap lingkungan bersama.
- List memakai sequence guard; filter lokal tidak mempunyai balapan fetch filter. Akun/detail
  dipasang dengan key employee ID dan guard unmount. Mutasi menonaktifkan submit dan close selama
  request; kesalahan record lama tidak diterapkan ke record baru. Escape konfirmasi hanya menutup
  dialog paling atas dan fokus kembali; native dialog mempertahankan trap keyboard.

## Template dan impor

`GET /api/admin/employees/template`: Admin-only, XLSX privat/no-store, worksheet pertama **Pegawai**
dengan tepat `NIP`, `Nama Lengkap`, `Jabatan`, `Unit Kerja`, `Status Aktif`. Semua wajib. **Tidak ada
baris contoh**. Worksheet kedua **Petunjuk** bukan data impor dan berisi batas/petunjuk/semantik.
Kolom NIP menggunakan format Teks; cells string, bukan formula. NIP panjang/awalan nol dipertahankan.
Generator OOXML minimal existing diekstrak menjadi `src/infrastructure/spreadsheet/workbook.ts`;
export kompatibel template saldo dipertahankan. Tidak ada dependency baru atau perubahan aturan saldo.

Alur: Unduh Template → isi sheet pertama → Pilih workbook → Preview & Validasi → Konfirmasi → hasil.
Template download memakai handoff blob existing dengan lease URL, validasi MIME/status dan error/retry
Indonesia; pesan tidak menyatakan file pasti tersimpan di perangkat.

- Input `.xlsx` hingga2MiB termasuk overhead multipart;500 data baris nonkosong. Workbook tidak
  disimpan. Parser existing tetap dibatasi ukuran ekspansi, entri/kolom/baris. Khusus pegawai,
  `XlsxWorkbookReader(true,true)` menolak formula dan NIP numeric yang mungkin telah dibulatkan Excel.
  NIP bukan dibatasi angka saja; string seperti baseline M2 tetap sah.
- Preview tidak menulis employee, akun, saldo atau audit mutasi. Nomor baris asli, NIP/nama, status,
  field dan alasan aman ditampilkan dalam tabel 10 baris. Baris kosong diabaikan, duplikat file/DB
  didiagnosis. Semua valid **belum berarti disimpan**.
- Commit validasi ulang dan transaksi atomik existing: semua berhasil atau seluruh transaksi batal.
  Tidak ada skip diam-diam; sukses = N berhasil/0 dilewati/0 gagal, dengan rincian baris sukses.
  Bila invalid, belum ada baris yang ditulis. Tidak overwrite/reactivate employee existing, tidak
  provisioning akun/role/saldo, dan tidak resolusi atasan melalui file.
- `PUT /api/admin/employees/import` wajib UUID `Idempotency-Key`; actor dari sesi dan SHA256 byte
  file dihitung server. Key per actor + hash disimpan bersama ID hasil/audit di transaksi commit.
  Retry key/file sama mengembalikan jumlah hasil sebelumnya; key sama/file lain409. Dua key yang
  berlomba pada NIP sama tetap hanya mempunyai satu pemenang karena unique NIP/transaction.
- UI mempertahankan key dan file pada respons tidak diketahui, termasuk tutup/buka dialog di tab
  yang sama. File tidak bisa diganti sampai retry terselesaikan. Retry tidak memprovision ulang.
  Jika tab/halaman ditutup/dimuat ulang, key memori hilang: periksa daftar/NIP terlebih dahulu;
  preview file yang sudah committed menunjukkan NIP existing, bukan mengimpor ulang. Tidak ada
  klaim durable browser state lintas logout/tab. API retry persistence tetap durable.
- Unduh hasil **JSON** memakai handoff Blob existing atas preview Admin yang sudah dimuat, tanpa
  endpoint/kewenangan export baru. NIP tetap string persis (tanpa konversi angka/formula spreadsheet),
  nomor baris/status/diagnosis tersimpan. Tahap PRATINJAU_BELUM_DISIMPAN, KONFIRMASI_BELUM_DIKETAHUI
  atau TERSIMPAN dibedakan; file ini bukan arsip/pengesahan resmi atau pembacaan ulang master saat ini.
  Tidak berisi akun/password/role. Handoff tidak mengklaim file sudah tersimpan di perangkat.

## Audit, migration dan operasi

Forward migration **20261018110000_employee_administration_audit** menambah satu tabel
`EmployeeAdministrationEvent`: actor FK User, target FK Employee untuk aksi satuan, action,
nama kolom yang **ditulis** (bukan before/after values), server timestamp, dan ID hasil/key/hash
untuk import. Password/hash credential/cookie/token/file mentah/nama/NIP/payload PII tidak disalin
ke event. Hash request adalah checksum byte untuk retry, bukan isi file. Tidak ada endpoint log umum.

Create/update/status employee dan provisioning/role/status/reset akun HTTP selalu meneruskan
actor hasil sesi server. Audit dan perubahan SQL satu transaksi; audit gagal → mutasi rollback.
Repository/service internal lama masih dapat dipanggil tanpa konteks audit oleh test/tool internal;
itu bukan endpoint publik. Tidak mengklaim audit retroaktif untuk perubahan sebelum migration atau
seluruh operasi SQL/operator di luar endpoint administrasi ini. Tidak mengubah tool recovery existing.

Event append-only; tidak memakai retensi90hari laporan M7 dan tidak memasukkannya ke purger M7.
Tidak menyimpan semua versi isi master, password atau file impor selamanya. Kebijakan retensi/backup
metadata audit pegawai terpisah; tidak menebak masa retensi baru. DB backup operator perlu mencakup
schema/tabel baru. Tidak ada konfigurasi storage baru, scheduler, atau dependency.

Semua endpoint administratif tetap requireAdmin server-side sebelum read/parse/mutate. Unknown
body authority fields ditolak, bukan diteruskan. Mutasi menolak Origin lintas host/Sec-Fetch-Site
cross-site. Tidak menambah hard delete. Tidak ada migration lama yang diedit/db push/reset DB bersama.

## Verifikasi aktual

Semua DB pengujian disposable lokal, fixture sintetis. Hasil akhir dan CI dicantumkan di PR.

- Full unit/HTTP: **589 test / 51 file** lulus (`npm test -- --maxWorkers=2`).
- Full PostgreSQL: **163 test / 21 file** lulus; termasuk11 audit/lifecycle/import/CAS/snapshot.
- Browser fitur: **9 skenario**,6 tanpa intersepsi memakai sesi/API/PG nyata dan3 **MOCK** untuk
  lost response setelah commit nyata, list/template failure, serta akun error/late response A→B.
- Lint, typecheck, production build, Prettier changed files dan git diff check dijalankan.
- Screenshot sintetis: [desktop](screenshots/employee-administration/desktop.png),
  [ponsel390×844](screenshots/employee-administration/mobile.png), diperiksa secara visual.
- Regresi browser Admin existing **16 skenario** (sesi nyata, banyak API mock) dan Pegawai
  **14 skenario (9 DB + 5 MOCK)** lulus. Tidak menyebut seluruhnya E2E DB.
  Safari/iPad asli dan UAT bisnis belum selesai.

## Rollout/UAT operator (pending)

- [ ] Review migration/grants, backup DB, deploy image/Prisma client dan migration yang sama setelah approval.
- [ ] Admin: tambah/edit/duplikat/self-supervisor/konflik dua tab; akun dan status pegawai terpisah.
- [ ] Nonaktif→Arsip→aktif kembali mempertahankan histori; login baru/sesi lama ditolak saat nonaktif;
      sesi lama tidak hidup setelah reaktivasi dan akun nonaktif tidak dibuka otomatis.
- [ ] Unduh template, isi NIP teks panjang/awalan nol, preview invalid/duplicate tanpa write,
      commit sukses/all-or-nothing, retry setelah respons hilang dan periksa audit.
- [ ] Keyboard/fokus/Escape dialog bertingkat, desktop/tablet/ponsel, jaringan lambat, Safari/iPad asli.
- [ ] Pastikan akun/saldo/import saldo/snapshot lama tetap sesuai baseline; jangan menutup issue UAT lain.

PR tidak merge/deploy/mengakses VPS atau DB staging/produksi, dan tidak menutup issue otomatis.

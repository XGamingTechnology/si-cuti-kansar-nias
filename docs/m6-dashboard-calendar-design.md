# M6 — Desain Dashboard dan Kalender SI CUTI

**Status: definisi indikator disetujui; desain overlay diperluas sesuai arahan
pengguna, konektor sumber pemerintah belum terverifikasi. Belum memulai coding.**
Diperbarui 17 Oktober 2026 WIB pada `origin/staging`
`ca27193335849f0c53c06a0acda40089256138a9`.
Task hanya menambah dokumen ini; tidak mengubah runtime/schema/dependency/migration.

## 1. Rekomendasi fase pertama dan sumber keputusan

Bangun satu fitur read-only: dashboard operasional Admin/Pegawai, kalender bulanan,
dan agenda berhalaman dari **periode pengajuan**, dengan Cuti dan Izin pada tab
terpisah. Default kalender hanya APPROVED. Label utama: **“Periode cuti disetujui”**,
bukan bukti penggunaan aktual atau kehadiran. Grafik pertama cukup tabel jumlah
per jenis/status; tidak perlu chart library, persentase atau grafik “hari terpakai”.
Saldo Pegawai berasal dari pembacaan layanan saldo existing dengan owner isolation.
Data pengajuan tidak membutuhkan model baru. Tambahkan overlay libur nasional/cuti
bersama dengan adapter sumber dan snapshot berversi (bagian 10); kebutuhan persistence
atau indeks dipastikan pada desain teknis coding, tanpa migration dalam task ini.

Sumber dibaca: `AGENTS.md`; PDF `docs/source/Laporan-Kerangka-Inovasi-SI-CUTI-KANSAR-NIAS.pdf`
(h. 5–8: akses, hybrid workflow, kalender/dashboard); `docs/requirements.md`,
`architecture.md`, `database-schema.md`, `user-flows.md`, `design-system.md`,
`implementation-plan.md`, `requirement-traceability.md`; `docs/decision-log.md`,
`m2-baseline-decisions.md`, `m3-balance-decisions.md`, `m4-workflow-decisions.md`,
`leave-records-decisions.md`, dan `backlog-20261015.md`.

- Backlog menempatkan dashboard/calendar setelah koreksi operasional; belum ditemukan
  issue M6 tersendiri melalui pencarian GitHub issue M6 dan daftar issue yang diperiksa.
- Pada review awal, CAL-001/RPT-001/RPT-002 masih terbuka di register historis.
  Pengguna kemudian menyetujui indikator periode persetujuan beserta penanda return,
  dan meminta overlay dengan preferensi koneksi data pemerintah yang diperbarui otomatis.
  Keputusan terbatas tersebut dicatat di bagian 9; bukan persetujuan kesiapan personel,
  laporan resmi, atau endorsement sebuah API tertentu.
- BAL-003 sudah disetujui melalui amendemen M3: kalender kantor bersama, Senin–Jumat,
  weekend nonkerja, exception PUBLIC_HOLIDAY/JOINT_LEAVE/INSTITUTION_NON_WORKING,
  rentang inklusif dan satuan sehari penuh. **Tidak membuka kembali aturan day-count.**
  Cakupan/sumber kalender tampilan lintas sistem tetap persoalan berbeda CAL-001.
- AUTH-002/M2 dan WF-001–004/M4 sudah menetapkan role, owner isolation, status serta
  authority; M6 menggunakannya tanpa membuat approval atau status baru.
- Klaim Cuti Bersama deploy pada `cdc180952982caa5f2aedc28685d5fd5578ccd74`; kesehatan internal/publik sukses menurut
  konteks pengguna, UAT bisnis masih tertunda. Klaim tidak berarti sedang cuti dan
  tanggal event klaim tidak otomatis menjadi hari libur authoritative.
- PR [#110](https://github.com/XGamingTechnology/si-cuti-kansar-nias/pull/110)
  terkonfirmasi **MERGED** pada 17 Oktober 2026, merge commit `ca27193335849f0c53c06a0acda40089256138a9`.
  Koreksi Pejabat Cuti sudah berada pada base terbaru dan tidak dikerjakan ulang.

## 2. Audit kemampuan existing

| Kemampuan                            | Bukti/path                                                                                                                                                                                | Implikasi M6                                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request terpisah dan revisi berjalan | `prisma/schema.prisma`: LeaveRequest/PermissionRequest, currentRevisionNumber, revision startDate/endDate, status; `src/application/workflow/types.ts`, `ports.ts`                        | Join hanya revisi yang sama dengan currentRevisionNumber; bukan semua revisi atau revisi nomor terbesar tanpa parent pointer.                                                                                             |
| Status dan scope baca                | `src/application/workflow/leave-service.ts`, `permission-service.ts`; `src/application/authorization/policy.ts`, `http.ts`                                                                | Reuse principal server dan owner rule. DRAFT/SUBMITTED/RETURNED_FOR_CORRECTION/APPROVED/REJECTED/CANCELLED existing.                                                                                                      |
| Daftar/detail pengajuan              | `src/application/workflow/delivery.ts`; `src/app/api/workflow/{leave,permission}/route.ts`; `src/infrastructure/workflow/prisma-workflow-repository.ts`                                   | List belum dibatasi tanggal/pagination server, membawa agregat detail termasuk reason/alamat/telepon. **Jangan kirim response ini sebagai kalender**; tambah query/proyeksi baca minimal tanpa mengubah kontrak existing. |
| Saldo dan invariant                  | `src/application/leave-balance/{administration,ports,service}.ts`; `src/infrastructure/leave-balance/prisma-annual-balance-administration-repository.ts`                                  | Reuse pembacaan account, availableDays dan annualBalanceReadiness. regularAvailableDays hanya N/N1/N2; Klaim ditampilkan terpisah. Jangan memakai mutation/rollover untuk dashboard.                                      |
| API saldo Admin                      | `src/app/api/admin/annual-balances/route.ts`, `[employeeId]/route.ts`                                                                                                                     | Admin-only; bukan endpoint saldo Pegawai. Belum ditemukan endpoint saldo-self ringkas: perlu wrapper read-only dengan otorisasi owner dan DTO baru, bukan melonggarkan endpoint Admin.                                    |
| Pengembalian dan arsip               | `src/application/leave-records/{ports,service}.ts`; `src/infrastructure/leave-records/prisma-repository.ts`; `src/app/api/workflow/leave/[id]/returns/route.ts`; model LeaveBalanceReturn | restoredDays/recordedAt/basisDate bukan tanggal pemakaian aktual. APPROVED tetap APPROVED. Jangan memasukkan alasan, bukti atau snapshot audit ke DTO M6.                                                                 |
| Kalender kerja dan waktu bisnis      | `src/domain/business-date.ts`; `src/domain/leave-balance/working-days.ts`; `src/infrastructure/leave-balance/prisma-working-calendar-repository.ts`; WorkingCalendarException             | Asia/Jakarta dan date-only reusable. Fase pertama tidak mengubah perhitungan atau menyamakan katalog klaim dengan exception kalender kantor.                                                                              |
| UI reusable                          | `src/components/authenticated-shell.tsx`, `workflow-workspace.tsx`, `admin-pagination.tsx`, `admin-floating-window.tsx`, `annual-balance-management.tsx`                                  | Shell, label status, dialog/fokus dan gaya daftar bisa dipakai ulang; pagination lokal existing tidak menggantikan pagination server M6. Belum ada dashboard/calendar operasional khusus.                                 |

## 3. Semantik dan katalog indikator usulan

**Konvensi bersama:** tanggal `D=toBusinessDate(serverNow)` di Asia/Jakarta. Periode
filter `F..T` inklusif, date-only YYYY-MM-DD valid. Sebuah request masuk periode
jika `current.startDate <= T AND current.endDate >= F` (**overlap**, bukan tanggal
submit/approval). Seluruh status adalah status **saat dibaca**, bukan status historis
pada akhir periode. Timestamp `submittedAt`, transition.occurredAt, createdAt,
recordedAt dan basisDate tidak menentukan membership kalender. Tahun saldo
mengikuti entitlementYear, bukan rentang filter kalender.

| Nama terlihat pengguna                                       | Definisi tepat/status                                                                                                                                                                    | Tanggal/rentang/timezone                                                                                               | Unit                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Menunggu tinjauan — Cuti / Izin (Admin)                      | COUNT request berstatus SUBMITTED, dua angka terpisah; belum menjamin bukti lengkap atau bisa langsung disetujui                                                                         | Semua periode, termasuk periode lampau/mendatang; tidak memakai F..T; waktu baca WIB                                   | Pengajuan unik per kind                       |
| Pegawai dalam periode cuti disetujui hari ini (Admin)        | COUNT DISTINCT employeeId dari LeaveRequest APPROVED yang mencakup D; tetap mencakup record dengan pengembalian dan pegawai kini nonaktif                                                | startDate <= D <= endDate inklusif, WIB; bukan jumlah hari atau kehadiran                                              | Pegawai unik                                  |
| Pengajuan Cuti / Izin menurut jenis dan status               | COUNT DISTINCT requestId, dikelompokkan leaveType atau permissionTypeId dan status, berdasarkan filter; tidak menghitung revisi/transisi                                                 | Overlap F..T inklusif WIB, bukan “disetujui dalam periode”; status saat baca                                           | Pengajuan                                     |
| Periode Cuti / Izin pada tanggal … (kalender/agenda)         | Request yang memenuhi jenis/status/pegawai filter; default APPROVED; angka tiap tanggal menghitung request yang mencakup tanggal itu                                                     | startDate <= tanggal <= endDate; rentang tampilan tidak mengubah tanggal asli                                          | Pengajuan per tanggal; agenda 1 baris/request |
| Saldo Cuti Tahunan tersedia tahun … (Pegawai)                | Account sendiri INITIALIZED: nilai availableDays dari layanan existing per N/N1/N2/Klaim, total dari hasil layanan; jangan cap Klaim dengan batas regular 24 atau menambah saldo sendiri | Snapshot saat baca untuk entitlementYear tahun WIB berjalan, terlepas bulan kalender; bukan saldo historis akhir bulan | Hari saldo sesuai layanan                     |
| Pengajuan saya — Draf / Menunggu tinjauan / Perlu diperbaiki | COUNT request sendiri per kind: DRAFT / SUBMITTED / RETURNED_FOR_CORRECTION; tiga angka terpisah, bukan digabung sebagai tugas Admin                                                     | Semua periode, waktu baca WIB                                                                                          | Pengajuan sendiri                             |

Kartu fixed (menunggu tinjauan/hari ini/status saya/saldo tahun berjalan) terpisah
**di atas filter periode** dan diberi chip “Semua periode” / “Hari ini, WIB” /
“Tahun saldo …”. Filter di bawah hanya mengubah distribusi periode, kalender dan
agenda; response menjelaskan scope tiap indikator. Ini mencegah antrean lama
menghilang saat pengguna memilih bulan baru. Tidak ada total Cuti+Izin ambigu.

## 4. Kasus tepi dan batas makna

- **Lintas bulan/tahun:** gunakan overlap. Contoh 30 Des–3 Jan tampil pada kedua
  bulan dengan satu ID sumber dan penanda lanjutan. Tanggal sumber tetap utuh;
  hanya chip dipotong ke sel bulan. Satu request dihitung sekali pada ringkasan
  rentang gabungan, bukan sekali per bulan/hari. Menjumlahkan total bulanan atau
  hitungan sel dapat menduplikasi request dan dilarang untuk membentuk total unik.
- **Beberapa record pegawai:** distinct employeeId hanya untuk kartu pegawai hari
  ini. Dua request dari satu pegawai tetap dua agenda dan dua hitungan pengajuan.
  Jangan menggabungkan Cuti dan Izin menjadi satu periode absence atau prioritas.
- **Ditolak/dibatalkan/dikembalikan:** default kalender APPROVED mengecualikan
  REJECTED/CANCELLED/RETURNED_FOR_CORRECTION/SUBMITTED. Filter status boleh memilih
  status non-draft tersebut atau “Semua status non-draf”; chip selalu menyebut
  status dan tidak dilabel “sedang cuti”. Returned memakai revisi berjalan yang
  bisa sudah diedit, bukan dianggap izin final maupun tanggal submit terakhir.
  DRAFT hanya kartu status sendiri dan deep-link workflow sendiri; tidak dipublikasikan
  pada kalender Admin/Pegawai fase pertama. Tidak mengubah akses workflow existing.
- **Weekend/libur:** rentang persetujuan tetap tampak pada Sabtu/Minggu; shading
  weekend hanyalah orientasi tanggal, bukan pengurangan saldo atau jadwal kerja SAR.
  Tidak ada angka “hari terpakai” dari panjang rentang. Overlay hari libur ditambahkan
  menurut bagian 10, dengan provenance dan freshness terpisah. Agenda internal belum
  memiliki sumber sehingga tidak dibuat-buat. BAL-003 dan working-calendar existing
  tetap berlaku bagi layanan saldo/workflow; sinkronisasi overlay tidak menulis ke sana.
- **Pengembalian sebagian/penuh:** request tetap APPROVED dan rentang persetujuan
  tidak dipendekkan. Tambahkan `hasBalanceReturn` dan label “Ada pengembalian saldo;
  periode persetujuan tetap ditampilkan”. Berlaku pada kartu hari ini juga, dengan
  penjelasan bahwa angka bukan jumlah orang yang benar-benar absen. Tidak mengurangi
  distinct pegawai/request dari jumlah restoredDays. Jumlah itu tidak mengidentifikasi
  tanggal mana yang tidak dipakai, termasuk jika seluruh saldo dikembalikan.
- Kalender **periode persetujuan** dapat dibangun sekarang; kalender **pemakaian aktual**,
  absensi, roster, hari kembali aktif aktual dan kesiapan tidak dapat dibangun dari
  data yang tersedia. Memerlukan sumber/kebijakan baru, tidak diasumsikan dari ledger.
- Pegawai nonaktif dan jenis izin kini nonaktif tetap masuk sejarah pengajuan valid.
  Filter nama/jenis memakai master yang tersedia, bukan klaim nama historis resmi;
  jangan menimpa snapshot dokumen dengan label master saat ini.

## 5. Matriks akses yang wajib ditegakkan server

| Resource read-only M6                             | Admin Kepegawaian                                                | Pegawai               | Enforcement                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Ringkasan antrean organisasi dan pegawai hari ini | Ya                                                               | Tidak                 | requireAdmin di HTTP/application; tidak dikirim null/tersembunyi di payload Pegawai, tetapi field organisasi ditiadakan |
| Distribusi/kalender/agenda                        | Seluruh pegawai atau employeeId terpilih                         | Hanya employeeId sesi | SQL scope diterapkan sebelum count/join/pagination; jangan filter response di browser                                   |
| Saldo ringkas sendiri                             | Bukan kartu Admin fase ini; administrasi existing tetap terpisah | Sendiri               | Wrapper read-only owner; tidak memanggil endpoint Admin dari browser Pegawai                                            |
| Pemilih pegawai                                   | ID/nama/NIP minimal, termasuk historis nonaktif bila dicari      | Tidak                 | Endpoint Admin tersendiri; tidak mengirim direktori pegawai ke Pegawai                                                  |
| Detail pengajuan/dokumen                          | Sesuai policy existing                                           | Hanya milik sendiri   | Deep-link ke workflow existing, autentikasi/owner check lagi; DTO M6 tidak membawa URL file/metadata privat             |
| Pengguna tanpa sesi / role lain                   | Tidak                                                            | Tidak                 | 401 tanpa sesi, 403 role tidak diizinkan; default deny                                                                  |

Parameter employeeId pada request Pegawai ditolak 403 (termasuk ID sendiri agar
kontrak self-only tegas); employeeId sesi selalu dipaksakan server. Manipulasi
cursor, kind, ID dan header role tidak dapat memperluas scope. Cache-Control:
private, no-store; jangan berbagi cache antar principal atau menyimpan PII di log query.

## 6. Kontrak baca dan query yang diusulkan

Semua di bawah **endpoint baru yang diusulkan**, bukan klaim sudah tersedia:

| GET                        | Kontrak dan batas                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/dashboard/summary`   | `from,to,kind,type?,status?,employeeId?`; fixed indicators + grouped period counts. kind wajib `leave`/`permission`; default status periode APPROVED. Pegawai juga mendapatkan saldo-self tahun berjalan.                                                                                        |
| `/api/calendar`            | Parameter sama; maksimum 62 hari inklusif; UI meminta satu bulan aktual. Response bucket `{date,requestCount}` untuk semua tanggal, termasuk nol, dan `uniqueRequestCount` untuk rentang; tanpa pagination karena bucket tanggal terbatas. Tidak menjumlahkan bucket sebagai uniqueRequestCount. |
| `/api/calendar/agenda`     | Filter sama; maksimum 366 hari inklusif. `limit` default 10, max 50; cursor keyset `(startDate,requestId)` dengan kind wajib, urutan ASC. Cursor tervalidasi dan terikat filter/scope; server tetap menerapkan authorization. `nextCursor`, total request filter dari DB.                        |
| `/api/dashboard/employees` | Admin-only lookup nama/NIP, query maks. 100 karakter, limit default 20/max 50, cursor ID; select ID/nama/NIP saja, bukan profile lengkap.                                                                                                                                                        |

Summary juga maksimum 366 hari; semua rentang harus valid `F<=T`, tahun tanggal
1900–9999. Tidak ada rentang tak terbatas/default silent: tanpa from/to server
menggunakan bulan WIB berjalan dan mengembalikan rentang efektif. Admin employeeId
harus UUID valid. Jenis harus sesuai kind; status unknown/DRAFT dan parameter unknown
menghasilkan 422, tanggal mustahil dan rentang berlebih juga 422. Unauthorized scope
403 diperiksa sebelum lookup sehingga tidak membocorkan keberadaan ID. Pemilih jenis
izin menggunakan katalog label minimal termasuk jenis nonaktif yang pernah dipakai;
endpoint permission-types existing hanya aktif sehingga perlu read projection yang
melengkapi label historis, bukan mengaktifkan kembali jenis tersebut.

Envelope menyertakan `definitionVersion: "m6-v1"`, `asOf` timestamp server,
`businessDate`, `timeZone: "Asia/Jakarta"`, filter efektif dan scope. Fixed cards
menyebut scopenya sendiri (bagian 3), tidak mengikuti filter periode/status/pegawai.
Summary counts tidak dihitung dari halaman agenda atau seluruh list browser.
Pembacaan ringkasan memakai snapshot transaksi read-only konsisten; endpoint yang
berbeda dapat memiliki asOf berbeda, bukan janji snapshot lintas request.

DTO agenda allowlist: `requestId,kind,status,typeCode/typeId,typeLabel,startDate,endDate,
hasBalanceReturn`; Admin ditambah `employee:{id,fullName}`; Pegawai tidak memerlukan
identitas orang lain. Tidak memuat reason, alamat, telepon, evidence, dokumen,
sourceReference, snapshot, storage key, signed URL, atau histori transisi. Badge
pengembalian cukup EXISTS return pada request/revisi terkait; jangan join-multiply
count karena beberapa return. Aggregate tidak membawa detail pribadi tersebut.

Query plan: scope parent request menurut principal → join revision menggunakan
`revisionNumber=currentRevisionNumber` → predikat overlap/type/status → aggregate
atau select minimal. Gunakan parameter binding, bukan SQL dari filter mentah. Cuti
ambil LeaveRequest/LeaveRequestRevision; Izin ambil PermissionRequest/PermissionRequestRevision

- label PermissionType. Tidak union klaim/ledger/exception menjadi event absence.
  Untuk kalender, ekspansi tanggal rentang hanya di sisi query/read service terbatas,
  dengan COUNT DISTINCT ID; untuk agenda select limit+1. Pakai EXISTS pengembalian,
  bukan detail return. Uji EXPLAIN dengan data sintetis realistis sebelum menyarankan
  indeks; jika ternyata perlu schema/migration, ajukan terpisah untuk persetujuan.

Tidak membaca file privat atau memanggil layanan render PDF untuk membuka dashboard.
Saldo menggunakan accounts + invariant existing tanpa histori alasan/audit; PARTIAL
menjadi “Perlu diperiksa”, UNINITIALIZED “Belum disiapkan”, bukan nol atau inisialisasi
otomatis. UI menerima nilai saldo dari read service, tidak menjalankan aturan saldo.

## 7. UI dan states

Desktop: shell existing → ringkasan fixed ringkas → tab **Cuti / Izin** dan filter
periode/jenis/status/pegawai (pegawai hanya Admin) → tabel distribusi → kalender
bulan + agenda berhalaman. Rentang custom >bulan beralih ke agenda, tidak memuat
366 kolom kalender. Tombol Hari ini dan bulan sebelumnya/berikutnya; minggu mulai
Senin, date-only WIB, tanpa drag/drop, resize atau aksi approval baru.

Kalender bulan menampilkan badge jumlah per hari; klik tanggal membuka agenda
terfilter tanggal itu. Tidak memuat semua nama/event ke setiap sel atau silently
truncate data. Total dan tombol pagination berasal dari server. Event spanning
month memakai indikator lanjutan di agenda; navigasi detail tetap ke workflow
existing dengan pemeriksaan akses. Filter status ditampilkan terus agar non-APPROVED
tidak tampak seperti cuti disetujui. Tidak ada label “tersedia”, “siap gerak”,
“absen aktual” atau persentase kesiapan.

Tablet/ponsel: filter dapat dibuka dalam dialog existing, ringkasan tetap kecil,
agenda menjadi tampilan utama; kalender opsional sebagai pemilih tanggal. Kontrol
keyboard, focus-visible, Escape/focus restoration pada dialog, nama/status berbentuk
teks (warna bukan satu-satunya penanda), aria-label tanggal dan reduced motion.
Ganti filter mereset cursor, batalkan/abaikan response lama, refresh manual dan
refresh saat kembali ke tab; tidak perlu websocket/scheduler. Setelah tengah malam
WIB, refresh businessDate saat tab aktif; jangan mengikuti zona OS browser.

Loading: skeleton/“Memuat”, bukan angka nol. Empty sukses: nol/“Tidak ada pengajuan
pada filter ini” dan Reset filter. Error: pesan aman + Coba lagi, data lama diberi
label belum diperbarui; jangan menampilkan nol palsu. Gangguan saldo tidak menyembunyikan
kalender, dan sebaliknya. 401 menuju login sesuai flow existing; 403 tanpa data;
422 menunjukkan filter yang harus diperbaiki. Tidak ada toast sukses approval/saldo
karena M6 hanya membaca. Nama/label panjang harus terbungkus tanpa overflow.

## 8. Acceptance criteria dan pengujian implementasi berikutnya

1. Seluruh indikator mengikuti definisi bagian 3, tanggal bisnis WIB dan current
   revision; satu request dengan banyak revisi/transisi/return tidak terduplikasi.
2. Cuti/Izin terpisah; filter jenis/status/pegawai sesuai scope, DRAFT tidak tampil
   di kalender, antrean semua periode tidak hilang akibat filter bulan.
3. Uji overlap inklusif pada satu hari, akhir bulan/tahun, tahun kabisat, request
   lintas tahun, batas F/T, tanggal mustahil dan pergantian hari pada 16:59/17:00 UTC.
4. Dua pengajuan satu pegawai menghasilkan dua request tetapi satu distinct pegawai
   hari ini; pegawai/jenis nonaktif dengan record historis tetap tampil sesuai filter.
5. REJECTED/CANCELLED/RETURNED/SUBMITTED tidak masuk default APPROVED; filter eksplisit
   memberi label benar. Returned dengan revisi edit tidak dianggap persetujuan lama.
6. APPROVED dengan return sebagian/penuh tetap dalam periode original, badge EXISTS
   benar, tidak mengarang hari yang dipakai atau memotong akhir rentang. Weekend dan
   tanggal klaim tidak mengubah membership atau saldo; tidak ada penulisan ke DB.
7. Unit/application tests untuk definisi/count/DTO allowlist. HTTP authorization dan
   IDOR Admin/Pegawai/tanpa sesi, forged employee/cursor/header serta invalid input;
   assert field privat tidak muncul pada JSON (termasuk grouped response dan error).
8. PostgreSQL disposable: join currentRevision benar, keyset/tie/batas halaman,
   count melampaui satu halaman, EXISTS multi-return, scope sebelum aggregate dan
   perubahan status antar read; total bukan ukuran halaman. Periksa query plan/skala.
9. Saldo own read memakai readiness/counter existing, mencakup Klaim tanpa cap regular,
   return/reserve/commit tercermin dari layanan, incomplete/error bukan nol; tidak
   memutasi account, ledger, snapshot, archive atau workflow. Regression gates layanan
   terkait dijalankan pada task coding sesuai AGENTS/CI.
10. Browser dengan data sintetis: desktop/tablet/mobile, filter-reset/pagination,
    respons stale, loading/empty/error/retry, keyboard, pergantian hari WIB dan link
    detail. Bedakan mocked UI test dari tes real API+DB; UAT stakeholder tetap wajib.

**Validasi task dokumen ini:** Prettier dokumen, git diff --check dan verifikasi
hanya satu file berubah. Tidak menjalankan lint/typecheck/build/seluruh tes aplikasi
karena tidak ada kode runtime yang berubah. Tes di atas adalah rencana, bukan klaim lulus.

## 9. Keputusan stakeholder dan status terbaru

Dasar: balasan pengguna pada 17 Oktober 2026: (1) “Iya tambahkan” atas periode
APPROVED dengan penanda pengembalian; (2) meminta overlay dan, jika memungkinkan,
koneksi data pemerintah real-time. Tidak meminta persetujuan ulang poin (1).

| Topik                                          | Status/keputusan                                                                                                         | Implikasi                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Indikator periode persetujuan, termasuk return | **Disetujui pengguna**; tetap tampil dengan badge/keterangan, bukan penggunaan aktual                                    | Implementasikan definisi bagian 3–4; tidak mengurangi tanggal dari restoredDays                            |
| Overlay kalender                               | **Arah fitur disetujui/diminta**; masukkan libur nasional/cuti bersama dan koneksi pemerintah bila sumber layak tersedia | Menggantikan rekomendasi awal tanpa overlay; rancangan bagian 10 mengatur validasi/fallback                |
| Endpoint/sumber resmi tertentu                 | **Belum terverifikasi**, bukan dianggap disetujui                                                                        | Inventarisasi API/feed pemerintah saat akses tersedia; tidak menunjuk API komunitas sebagai API pemerintah |
| Kesiapan personel dan absensi aktual           | Tidak termasuk lingkup, bukan pertanyaan baru                                                                            | Tidak membuka kembali batasan yang sudah diberikan pengguna                                                |

Tidak ada pertanyaan bisnis yang menghalangi desain overlay read-only ini.
Pemilihan URL/konektor yang dapat dibuktikan adalah pekerjaan verifikasi teknis.
Jika kelak sumber yang dipilih memerlukan biaya, kredensial, atau hanya agregator
nonpemerintah tersedia, ajukan pilihan spesifik beserta buktinya sebelum mengadopsi.
Aturan saldo/day-count, state machine dan owner isolation tidak memerlukan voting ulang.

**Ditunda:** ekspor PDF/Excel dan laporan resmi RPT-001/M7, reminder, roster SAR,
integrasi kalender pribadi/eksternal dua arah, agenda internal tanpa sumber, penggunaan
aktual dan kesiapan. Koneksi baca data libur pemerintah kini masuk lingkup overlay,
bukan kategori integrasi eksternal yang ditunda. Tidak menutup issue, merge atau
deploy staging dari task desain ini.

## 10. Overlay libur dan koneksi sumber pemerintah

**Cakupan:** libur nasional dan cuti bersama pada lapisan kalender terpisah dari
request Cuti/Izin. Toggle “Libur nasional” dan “Cuti bersama” default aktif ketika
tersedia dataset tervalidasi. Event overlay bukan pengajuan, tidak memiliki employeeId,
tidak masuk count pengajuan/pegawai, dan tidak berarti semua pegawai absen. Badge
cuti bersama tidak menambah hak klaim maupun mengesahkan eligibility baru.
Agenda kerja internal belum memiliki sumber: lapisan dapat disiapkan untuk pengembangan
berikutnya, tetapi tidak menampilkan data rekaan.

### Sumber dan tingkat kepercayaan

1. Kandidat rujukan primer: SKB hari libur nasional/cuti bersama dari tiga kementerian
   dan perubahan resminya, diterbitkan melalui kanal pemerintah/JDIH terkait. Kanal
   publikasi Kemenko PMK (`https://www.kemenkopmk.go.id`) dan JDIH Kementerian PANRB
   (`https://jdih.menpan.go.id`) adalah kandidat untuk diverifikasi, **bukan endpoint
   API yang sudah dinyatakan tersedia/kompatibel**.
2. Pada investigasi 17 Oktober, akses kedua host ditolak proxy lingkungan dengan
   `Tunnel connection failed: 403 Forbidden`. Ini batas akses lingkungan, bukan bukti
   bahwa situs pemerintah gagal atau bahwa API pemerintah tidak ada. Belum ada URL
   feed, dokumentasi API, autentikasi, lisensi, SLA atau mekanisme push yang terverifikasi.
3. Prioritas konektor: API/feed resmi terdokumentasi → dataset resmi yang dapat
   diimpor → input/import Admin dari dokumen SKB resmi dengan referensi. API komunitas,
   Google Calendar umum atau hasil pencarian tidak otomatis sumber pemerintah.
   Jangan menyalakan scraper HTML/PDF rapuh sebagai sumber otomatis authoritative.
4. Initial dataset dari SKB/import diverifikasi Admin: tahun, nomor/tanggal dokumen,
   penerbit, URL/referensi resmi, daftar tanggal/nama/kategori dan checksum sumber.
   Jika API resmi tervalidasi tersedia, allowlist konektor dan kontraknya diverifikasi
   dahulu; setelah itu refresh otomatis dapat menerbitkan versi baru yang lolos validasi.
   Dokumen/PDF yang memerlukan interpretasi tetap masuk pratinjau/review Admin.

### Sinkronisasi dan kegagalan

“Real-time” dijabarkan sebagai **pembaruan otomatis dari sumber resmi**, bukan janji
push/instan yang belum ditawarkan sumber. Default teknis polling setiap 6 jam dan
refresh Admin on-demand dengan cooldown 15 menit; gunakan ETag/Last-Modified jika
tersedia. Tampilkan `Terakhir diperiksa`, `Versi sumber`, dan `Terakhir diperbarui`
secara terpisah. Jika API resmi kelak menyediakan webhook/stream terautentikasi,
adapter dapat diperluas tanpa mengubah makna indikator. Dashboard membaca snapshot
lokal tervalidasi, tidak bergantung pada fetch pemerintah pada setiap page load.

Server hanya mengambil URL konektor allowlist via HTTPS, dengan batas waktu/ukuran,
validasi content-type/schema, tanggal/tahun/kategori dan deduplikasi. Jangan menerima
URL bebas dari query browser; redirect juga harus tetap ke host yang disetujui.
Setiap versi menyimpan penerbit/referensi/tanggal publikasi/checksum, waktu fetch dan
status validasinya. Perubahan/penghapusan dibanding versi sebelumnya dicatat sebagai
diff; feed kosong, parsial, perubahan skema atau konflik sumber dikarantina, bukan
menghapus data aktif. Publikasi snapshot harus atomik dan retry idempotent terhadap
checksum/versi. Simpan versi lama agar koreksi sumber dapat ditelusuri.

- Gagal refresh/rate-limit/timeout: pertahankan last-known-good, tampilkan waktu dan
  status “Pembaruan tertunda”; retry dengan backoff. Melewati 24 jam tanpa pemeriksaan
  sukses diberi label “Belum terverifikasi ulang”, bukan otomatis “tidak berlaku”.
- Belum ada dataset tahun terpilih: tampilkan “Data libur resmi tahun … belum tersedia”;
  kalender pengajuan tetap berfungsi. Ini bukan daftar libur kosong atau bukti hari kerja.
- Snapshot tersedia tidak membuktikan daftar lengkap setahun: tampilkan cakupan tahun
  dan referensi, serta status lengkap hanya jika sumber menyatakan kelengkapannya.
- Koreksi retroaktif mengubah versi overlay tampilan, bukan snapshot pengajuan, arsip,
  saldo, WorkingCalendarException atau workflow yang sudah diproses. Tidak ada auto
  re-count, auto-kredit Klaim Cuti Bersama atau auto-adjust saldo.

Kebutuhan tambahan terhadap desain awal: adapter fetch, job sinkronisasi dan penyimpanan
snapshot/provenance berversi yang persisten. Reuse transport/runtime/storage yang cocok;
tidak memasang library tanpa kebutuhan. Snapshot overlay terpisah dari arsip pegawai.
Detail storage dipastikan sebelum coding; bila memerlukan schema/migration, nyatakan
secara eksplisit dalam rencana fitur untuk review, jangan menyisipkannya dalam PR desain.

### API, akses, dan UI tambahan

- Usulan `GET /api/calendar/overlays?year=YYYY`: Admin dan Pegawai terautentikasi membaca
  dataset libur umum yang sama, tanpa PII; satu tahun 1900–9999/request. Batas 500 event
  tervalidasi/tahun; sumber melebihi batas ditandai untuk review, tidak dipotong diam-diam.
  DTO: `date,name,category,sourceReference,sourceUrl,sourceVersion` plus `coverage`,
  `lastCheckedAt,lastUpdatedAt,freshness,status`. Tidak memuat bukti/agenda personal.
- Usulan endpoint Admin terpisah untuk status sync, trigger refresh dan pratinjau/publikasi
  import fallback; Pegawai dilarang mengubah sumber, refresh/import/publikasi. Semua
  operasi administratif mengikat aktor server dan audit/provenance; credential konektor
  hanya di server. Endpoint kalender pengajuan existing dalam desain tidak berubah makna.
- Filter Cuti/Izin/status/pegawai hanya memengaruhi request. Toggle overlay dan tahun
  kalender mengendalikan libur; keduanya ditampilkan dengan legenda dan count terpisah.
  Mobile agenda menampilkan baris libur tersendiri tanpa menumpuk chip/nama pegawai.
  Kegagalan overlay tidak menghilangkan pengajuan/saldo; error, empty dan stale terpisah.

### Tambahan acceptance criteria

Uji dengan fixture sumber sintetis: endpoint resmi sukses, 304, perubahan jadwal,
retry identik, timeout/429, response kosong/parsial, tanggal invalid, kategori berubah,
konflik/duplikat, pergantian tahun, snapshot stale dan publikasi atomik. Uji SSRF/
redirect allowlist, Admin-only write, read tanpa PII dan rendering toggle di mobile.
Buktikan update overlay tidak menulis account/ledger/exception/workflow/arsip dan tidak
mengubah indikator APPROVED/return. Integrasi ke sumber pemerintah nyata baru dinyatakan
terverifikasi setelah URL, dokumentasi, respons serta referensinya diperiksa; mock test
tidak membuktikan konektivitas atau SLA real-time pemerintah.

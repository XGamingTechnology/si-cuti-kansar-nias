# SI CUTI - User Flows

Status: proposal-derived target flows, with LeaveRequest/PermissionRequest states approved by `docs/m4-workflow-decisions.md`. Not every target flow below is implemented. Current delivered scope is recorded in `docs/implementation-plan.md`; Joint Leave claims are tracked in Issue #107.

## 1. Pegawai - Login dan dashboard

```text
Login
  -> provider LOCAL memverifikasi identifier dan password di server
  -> identity dipetakan ke User aplikasi
  -> role/permission aplikasi diperiksa di server (bukan ditentukan provider)
  -> autentikasi berhasil
  -> Dashboard Pegawai
     -> ringkasan profil
     -> saldo cuti
     -> quick actions
     -> kalender pribadi
     -> riwayat/status
     -> notifikasi
```

## 2. Pegawai - Pengajuan Cuti Tahunan

```text
Dashboard Pegawai
  -> Pengajuan Cuti
  -> Pilih jenis cuti
  -> Buat/Edit Draf milik sendiri
  -> Isi tanggal dan data permohonan
  -> Sistem menghitung hari kerja dan memvalidasi saldo sesuai BAL-003
  -> Ajukan: revisi immutable + RESERVE saldo
  -> Cetak form
  -> Tanda tangan Atasan Langsung dan Kepala Kantor (digambarkan sebagai proses fisik)
  -> Pegawai unggah scan PDF bertanda tangan ke arsip privat
  -> Admin memverifikasi berkas/scan versi terpilih
     -> perbaikan: RETURNED_FOR_CORRECTION + RELEASE; Pegawai perbaiki dan submit revisi baru
     -> ditolak: REJECTED + RELEASE, alasan dan arsip hasil keputusan
     -> disetujui: APPROVED + COMMIT, arsip keputusan dengan source scan terpilih
  -> Admin dapat preview/verifikasi/simpan penanda pada edisi PDF turunan
  -> Pegawai melihat status/riwayat dan mengunduh arsip yang berhak diakses
```

Alur aktual mengikuti WF-001–004, BAL-002/003, `docs/leave-records-decisions.md` dan
`docs/decision-form-stamps.md`. Dokumen asli tidak ditimpa; penanda sistem bukan tanda tangan
elektronik/cap resmi baru. REJECTED terminal: pengajuan ulang memerlukan ID baru; perbaikan pada
ID yang sama memakai RETURNED_FOR_CORRECTION sebelum keputusan final. Setelah APPROVED,
pengembalian hari tidak digunakan dicatat oleh Admin sebagai kompensasi terpisah dengan dasar,
bukti dan attestation, bukan membuka ulang/membatalkan pengajuan asli.

## 3. Pegawai - Klaim Cuti Bersama

```text
Dashboard Pegawai
  -> Klaim Cuti Bersama
  -> Isi klaim
  -> Upload bukti pendukung
  -> Submit
  -> Admin memverifikasi bukti
     -> ditolak: status dan alasan tercatat
     -> disetujui: kuota klaim ditambahkan ke saldo Cuti Tahunan
  -> transaksi saldo + audit log dibuat
```

## 4. Pegawai - Izin Non-Cuti

```text
Dashboard Pegawai
  -> Pengajuan Izin
  -> Isi data izin
  -> Upload surat/pernyataan bila diperlukan
  -> Submit
  -> Generate form izin (PDF)
  -> Cetak dan tanda tangan Atasan Langsung
  -> Serahkan kepada Admin untuk diunggah
  -> status/arsip tercatat
```

Flowchart secara eksplisit menyatakan izin non-cuti tidak mengurangi saldo Cuti Tahunan. Pernyataan
tentang pemotongan TUKIN dan pengecualian dari perhitungan disiplin belum boleh diotomatisasi tanpa
aturan resmi dan keputusan scope.

## 5. Admin - Dashboard Monitoring

```text
Login Admin
  -> Dashboard Admin
     -> total pegawai
     -> pegawai sedang cuti
     -> pengajuan menunggu proses
     -> informasi personel tersedia (definisi final perlu konfirmasi)
     -> kalender cuti
     -> analitik distribusi cuti
     -> daftar pengajuan terbaru
```

## 6. Admin - Verifikasi Klaim Cuti Bersama

```text
Daftar Klaim
  -> filter/search
  -> buka detail
  -> lihat bukti
  -> approve / reject
  -> bila approve: sistem menambah bucket/entitlement
  -> audit log dibuat
```

## 7. Admin - Arsip Dokumen Final

```text
Buka pengajuan
  -> pilih aksi upload dokumen final
  -> validasi file
  -> simpan metadata + file
  -> tautkan ke pengajuan/pegawai
  -> audit log dibuat
  -> dokumen tersedia bagi user yang memiliki akses
```

## 8. Search and reporting

```text
Admin
  -> Laporan / Arsip
  -> filter tanggal / jenis cuti / nama / NIP / status
  -> tampilkan hasil
  -> export PDF atau Excel
```

## 9. Reminder kembali aktif

```text
Scheduled check
  -> temukan pegawai dengan akhir cuti mendekati 2 hari
  -> buat notifikasi web/sistem
  -> tampilkan kepada pegawai dan pihak terkait sesuai keputusan final
```

## 10. Flows requiring stakeholder confirmation

The original proposal ambiguities below are historical inputs. WF-001–004, BAL-001–005,
PERM-001/002 and VAL-001 have approved baselines; do not treat all their flows as still blocked.
Changing those baselines, detailed Joint Leave claim behavior (#107), reporting/calendar/reminder
scope and production policy still require the applicable decisions.

- approval formal Kepala Kantor dan representasinya di sistem;
- siapa yang berhak reject/cancel/edit setelah submit;
- kapan saldo dipotong;
- mekanisme restore saldo saat pembatalan;
- cuti yang overlap;
- pengajuan retroaktif;
- perpanjangan cuti;
- koreksi data oleh Admin;
- workflow izin sakit/CAP/Cuti Besar/Cuti Melahirkan/CLTN secara detail.
- arti dan status "berkas lengkap" serta siklus perbaikannya;
- status tanda tangan fisik versus approval digital;
- aturan/scope TUKIN dan disiplin untuk izin;
- sumber jadwal libur dan agenda kerja pada kalender personal;
- identitas atasan penerima reminder.

## 11. Decision dependencies per flow

Flow di atas adalah baseline interpretasi, bukan state machine final. Gunakan `docs/decision-log.md`:

| Flow                                             | Decision IDs                                              |
| ------------------------------------------------ | --------------------------------------------------------- |
| Pengajuan Cuti Tahunan dan perubahan saldo       | BAL-001, BAL-002, BAL-003, WF-001, WF-002, WF-003, WF-004 |
| Klaim Cuti Bersama                               | BAL-005, WF-004, DOC-003                                  |
| Izin non-cuti                                    | PERM-001, PERM-002, WF-002, WF-003, DOC-001               |
| Cetak, tanda tangan, registrasi, dan arsip final | WF-001, WF-002, DOC-001, DOC-002, DOC-003, DOC-004        |
| Search/report/download                           | AUD-001, RPT-001, AUTH-002                                |
| Reminder kembali aktif                           | BAL-003, NOT-001, NOT-002, DATA-001                       |
| Validasi dokumen/jenis cuti                      | VAL-001                                                   |

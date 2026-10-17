# Issue #91 — Koreksi darurat Pejabat Cuti

Base: `origin/staging` `cdc180952982caa5f2aedc28685d5fd5578ccd74`.
Issue: https://github.com/XGamingTechnology/si-cuti-kansar-nias/issues/91
Tidak ada komentar tambahan pada issue saat implementasi.

## Perilaku dan batas kewenangan

Admin Kepegawaian dapat melakukan Koreksi Darurat pada assignment aktif/berakhir.
Allowlist: `fullName`, `nip`, `capacity`, `effectiveFrom`, `effectiveTo`, sesuai
identitas/periode yang dikunci pada jalur biasa. Ini bukan jalur mengganti pejabat:
pergantian tetap membuat assignment baru. FUTURE tetap memakai edit normal.
Lock identitas/periode edit biasa tetap berlaku; perilaku metadata administratif
`sourceReference`/`notes` pada form biasa dipertahankan.

Koreksi memerlukan alasan 1–1000 karakter, referensi 1–500 karakter (setelah trim),
ringkasan sebelum/sesudah dan konfirmasi eksplisit. Tidak ada audit untuk no-op.
Identitas dan tanggal harus valid; tanggal kalender mustahil dan periode terbalik
ditolak. Exclusion constraint PostgreSQL tetap menjadi pengaman overlap inklusif.

GET/POST `/api/admin/leave-authorized-officials/[id]/corrections` memerlukan Admin
pada HTTP **dan** application boundary. Tidak ada endpoint edit/hapus histori.
Unknown fields, aktor, timestamp, before/after atau authority yang dikirim klien
ditolak. Identitas aktor berasal dari sesi; waktu dan before berasal dari server.

Assignment memiliki `revision` yang naik pada edit biasa dan koreksi. Koreksi
memerlukan `expectedRevision`; stale state menghasilkan 409 dan UI meminta refresh
serta review ulang. Update biasa juga memakai compare-and-set revisi agar tidak
menimpa koreksi yang terjadi setelah pembacaan awal. Kunci idempotency UUID dan
hash payload/aktor/assignment dijaga oleh advisory transaction lock. Retry identik
mengembalikan audit yang sama, termasuk jika revisi master sudah maju; pemakaian
ulang kunci dengan payload/aktor berbeda ditolak.

Update master dan insert audit berada dalam satu transaksi dengan row lock.
Kegagalan audit/FK membatalkan perubahan master. Histori berisi field berubah,
nilai sebelum/sesudah, alasan, referensi, actorUserId, waktu, dan revisi. Relasi
assignment/actor memakai RESTRICT dan trigger menolak UPDATE/DELETE histori.
Histori dapat dibaca di dialog Admin, termasuk pada assignment FUTURE yang
sebelumnya pernah dikoreksi.

## Dokumen historis

Arsip/snapshot/PDF yang tersimpan tidak dimutasi atau diregenerasi. Formulir
pengajuan lama sebelumnya menyelesaikan pejabat dari master pada tanggal submit.
Adapter sekarang juga menggunakan waktu submit: koreksi pertama **setelah**
waktu tersebut menyediakan identitas/periode sebelum koreksi. Koreksi periode
pun tidak mengubah pejabat yang dirender pada pengajuan sebelumnya. Pengajuan
setelah koreksi menggunakan master yang telah dikoreksi.

Tidak ada reissue/correction document baru dalam task ini. Reissue memerlukan
proses yang disetujui tersendiri. Perubahan saldo/cuti maupun Klaim Cuti Bersama
tidak disentuh; UAT Klaim Cuti Bersama tetap tertunda, tidak dinyatakan diterima.

## Migration dan rollout untuk reviewer

Forward migration baru:
`20261017090000_official_emergency_correction` menambah kolom revision default 0,
tabel correction, unique/index, FK RESTRICT, CHECK dan trigger append-only.
Migration lama dan dependency declarations/lockfile tidak berubah.

Setelah review dan persetujuan rollout: terapkan `prisma migrate deploy` sebelum
menjalankan aplikasi yang membaca revision/corrections; generate client/build
sesuai pipeline. Tidak melakukan reset, db push, atau akses database staging/
produksi dalam task ini. Rollback aplikasi harus mempertahankan tabel audit;
tidak menyediakan migrasi destruktif penghapus histori. Task ini tidak melakukan
merge/deploy atau menutup issue.

## File perubahan

- Database: `prisma/schema.prisma` dan satu migration baru di atas.
- Application: `service.ts`, `http.ts`, `correction.ts` dalam
  `src/application/leave-authorized-official/`.
- Infrastructure: `prisma-repository.ts`, `runtime.ts`, `correction-repository.ts`
  dalam `src/infrastructure/leave-authorized-official/`.
- HTTP: route `corrections/route.ts` baru pada assignment.
- UI: `leave-authorized-official-management.tsx`,
  `official-emergency-correction.tsx`, `official-correction.css`.
- Test: `official-correction.test.ts` pada unit/HTTP/integration dan
  `tests/browser/official-correction.mjs`.
- Dokumentasi: file ini.

## Verifikasi dan UAT

Gate: lint, typecheck, production build, Prettier file TS/TSX/CSS/MD yang berubah,
Prisma validate, dan git diff --check. Unit/HTTP penuh: 442 tests / 40 files.
Integration PostgreSQL penuh: 113 tests / 17 files, termasuk 8 regresi baru.
35 tes terfokus unit/HTTP mencakup 27 tes baru dan 8 tes ordinary-edit existing.

Integration memakai PostgreSQL 18.1 disposable dan owner non-superuser. Pengujian
baru membuktikan audit, rollback FK, retry identik concurrent, stale concurrent,
normal-edit revision/CAS, overlap DB, no-op, dan PDF/snapshot/byte tersimpan tidak
berubah setelah beberapa koreksi. Histori tidak dihapus pada cleanup; dispose
seluruh database pengujian setelah selesai.

Browser runner memerlukan `SI_CUTI_DISPOSABLE_TEST_DB=1`, `DATABASE_URL`, server
pada `SI_CUTI_ADMIN_TEST_URL` (default port 3191), lokasi Playwright eksternal
`SI_CUTI_PLAYWRIGHT_MODULE`, opsional executable Chromium dan direktori screenshot.
Jalankan `node tests/browser/official-correction.mjs`. Empat skenario memakai sesi,
GET histori, POST koreksi, audit PostgreSQL, dan penolakan Pegawai **sebenarnya**.
Hanya response daftar assignment yang diisolasi ke satu fixture untuk menghindari
pagination data integration lainnya; ini bukan E2E tanpa mock sama sekali.
Fixture dan screenshot memakai data sintetis.

UAT manual setelah review/rollout tetap diperlukan: koreksi administrasi dengan
referensi SK yang sah; kejelasan ringkasan/aktor/riwayat; koreksi ACTIVE dan ENDED;
FUTURE dan lock form biasa; konflik dua tab; ulang unduh formulir lama dan akses
arsip final; keyboard dan perangkat mobile pengguna. Jangan menutup issue sebelum
review dan UAT tersebut.

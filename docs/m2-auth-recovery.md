# M2 — Hardening autentikasi dan pemulihan Admin

## Kebijakan Admin terakhir

Operasi aplikasi biasa tidak boleh membuat sistem kehilangan seluruh **Admin Kepegawaian yang
dapat login**. Admin yang dihitung harus mempunyai role `ADMIN_KEPEGAWAIAN`, Employee aktif, User
aktif, identity `LOCAL` aktif, dan credential `LOCAL`. Karena itu, demosi maupun penonaktifan User
atau Employee Admin terakhir ditolak dengan pesan Bahasa Indonesia yang jelas.

Mutasi lifecycle Admin memperoleh PostgreSQL transaction-scoped advisory lock yang sama, lalu
memeriksa invariant dan menulis perubahan dalam transaksi tersebut. Serialisasi ini mencegah dua
permintaan bersamaan sama-sama melewati pemeriksaan berdasarkan keadaan lama.

## Reset kata sandi normal

Admin Kepegawaian menangani reset kata sandi pegawai melalui UI **Reset Kata Sandi**. Kata sandi
plaintext tidak dapat dipulihkan karena aplikasi hanya menyimpan hash scrypt satu arah. Reset
mengganti hash dan mencabut seluruh sesi aktif identity `LOCAL` target dalam satu transaksi. Jika
Admin mereset kata sandinya sendiri, sesi yang sedang dipakai juga dicabut sehingga ia perlu login
ulang.

## Pemulihan darurat oleh operator VPS

Pemulihan darurat bukan endpoint HTTP dan bukan layanan persisten. Service Compose opt-in hanya
bergabung ke network database, tidak menerbitkan port, tidak me-mount dokumen privat, dan berjalan
sebagai non-root. Jalankan dengan pola berikut dari konfigurasi environment yang dituju:

```sh
docker compose -f compose.yaml -f compose.staging.yaml --profile recovery run --rm auth-recovery
```

Tool meminta NIP Employee yang **sudah ada**, kata sandi baru secara tersembunyi, konfirmasi kata
sandi, lalu konfirmasi eksplisit sebelum mutasi. Tool tidak membuat Employee, User, identity, atau
credential baru. Akun tanpa LOCAL identity/credential harus diprovision melalui alur Admin normal.

Pemulihan mengaktifkan Employee, User, dan identity LOCAL, menetapkan role
`ADMIN_KEPEGAWAIAN`, mengganti hash dengan implementasi scrypt aplikasi, memperbarui waktu
perubahan kata sandi, serta mencabut semua sesi lama secara atomik.

> Jangan pernah menaruh kata sandi atau hash pada argumen CLI, chat, log, shell history, maupun
> dokumentasi. Jangan menyalin isi `.env` ke terminal atau tiket dukungan.

Belum ada fitur publik **lupa kata sandi** karena model data M2 yang disetujui belum mempunyai kanal
email/telepon terverifikasi untuk recovery. Reset melalui email, token reset, SMTP, dan self-service
recovery adalah pekerjaan masa depan dan secara eksplisit di luar scope perubahan ini.

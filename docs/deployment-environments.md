# Lingkungan Deployment Production dan Staging/UAT

Status: **amendemen M1 disetujui — rancangan statis; verifikasi Docker menunggu VPS Ubuntu**

## 1. Batas dan tujuan

Satu VPS Ubuntu menjalankan dua lingkungan persisten: `si-cuti-prod` untuk operasi nyata dan
`si-cuti-staging` untuk validasi pra-produksi, UAT, verifikasi migrasi, dan fitur dengan data dummy.
Staging bukan lingkungan automated test; test tetap ephemeral dan terpisah. Amendemen ini tidak
mengubah modular monolith, requirement bisnis, atau memulai M2.

Source dan immutable image boleh dipakai bersama. Database, volume PostgreSQL, storage/path/volume
dokumen, credential database, application/session secret, backup artifact, dan seluruh mutable data
tidak boleh dipakai bersama. Data production tidak pernah disalin otomatis ke staging. Data pribadi
pegawai nyata dilarang di staging kecuali kebijakan masa depan secara eksplisit mengizinkan data
turunan yang telah disanitasi/dianonimkan.

## 2. Topologi dan konfigurasi

- `compose.yaml` adalah basis bersama tanpa host port, berisi PostgreSQL, guard, migrator, dan app.
- Override `compose.production.yaml` dan `compose.staging.yaml` memberi identitas tanpa menduplikasi
  basis. Resource limit/reservation sengaja belum bernilai; setelah spesifikasi VPS disetujui,
  staging dapat menerima batas lebih ketat secara independen.
- `.env.production` dan `.env.staging` wajib berbeda, mode `0600`, dan tidak di-Git. Berkas example
  hanya template; seluruh credential/secret nyata harus acak dan unik.
- `compose.edge.yaml` adalah project `si-cuti-edge` dan satu-satunya pemilik port 80/443. Hostname dan
  sertifikat adalah input `.env.edge`, bukan hardcode. Edge hanya bergabung ke frontend network kedua
  project, tidak ke database network, serta tidak me-mount dokumen.
- PostgreSQL berada di internal network tanpa `ports`. Dokumen hanya di-mount app. Project name unik
  mengisolasi database network serta named volume `postgres_data` dan `private_documents`. Frontend
  network dan alias app juga unik agar routing edge tidak ambigu.

```bash
docker compose --project-name si-cuti-staging --env-file .env.staging \
  -f compose.yaml -f compose.staging.yaml --profile migration run --rm migrate
docker compose --project-name si-cuti-prod --env-file .env.production \
  -f compose.yaml -f compose.production.yaml up -d
docker compose --project-name si-cuti-staging --env-file .env.staging \
  -f compose.yaml -f compose.staging.yaml up -d
docker compose --env-file .env.edge -f compose.edge.yaml up -d
```

`IMAGE_REF` dan `MIGRATOR_IMAGE_REF` harus merupakan dua target dari commit/version yang sama. Jangan
gunakan `down --volumes` dalam deployment rutin. Backup job menerima env lingkungan yang tepat dan
root terpisah (`.../production` dan `.../staging`); rotasi staging dilarang menyentuh production.
Backup production tetap tunduk DEP-002 dan keputusan DR M8; backup satu VPS bukan DR lengkap.

## 3. Guard identitas database

Sebelum destructive logic ditambahkan, mekanisme yang disepakati adalah marker kuat dalam database,
bukan nama saja. Bootstrap volume baru membuat satu row `deployment_control.environment_marker`
(`production` atau `staging`), dimiliki administrator dan read-only bagi role app/migrasi. Nilai
bertahan bersama volume.

Service one-shot `environment-guard` membaca marker dengan credential migrasi dan harus sukses
sebelum `prisma migrate deploy`; app juga menunggu guard. Migrator berada dalam profile `migration`
agar `up` biasa tidak otomatis menjalankan schema migration. Konfigurasi staging yang tersambung ke DB
bertanda production gagal sebelum migrasi atau startup app (dan sebaliknya). Rename database/host
tidak mengubah marker. Perubahan marker adalah operasi break-glass manual yang harus diotorisasi dan
diaudit; deploy/reset tidak boleh mengubahnya otomatis. Guard melengkapi, bukan mengganti, isolasi
credential, network, volume, dan backup.

## 4. Release dan migrasi aman

1. Git commit yang direview membangun image app dan migrator immutable dengan version/digest terkait,
   lalu automated test berjalan di lingkungan ephemeral terpisah.
2. Deploy exact version ke staging. Jalankan guard, review migration SQL, backup staging bila perlu,
   lalu migration staging secara eksplisit.
3. Verifikasi migration status, readiness/smoke check, dan UAT. Catat version/digest yang disetujui.
4. Approval manusia memilih exact image/digest itu untuk production; jangan rebuild kode berbeda.
5. Lakukan production preflight, backup sesuai DEP-002, marker guard, maintenance/rollback plan, dan
   approval migration. Jalankan migration production secara eksplisit, lalu rollout, smoke test,
   health check, dan monitoring. Deploy branch saja tidak memberi izin menjalankan migration.
6. Rollback app memakai image sebelumnya. Schema rollback/forward-fix harus mengikuti migration plan
   yang direview dan kompatibilitasnya dinilai, bukan perintah otomatis.

## 5. Checklist verifikasi pada VPS Ubuntu

Isi secret unik, provision TLS, pull image yang sama, render kedua konfigurasi dengan `docker compose
... config`, kemudian start ketiga project. Simpan output tersanitasi dan gunakan data dummy saja.

- [ ] `docker compose ls` menampilkan `si-cuti-prod`, `si-cuti-staging`, dan `si-cuti-edge` bersamaan.
- [ ] Inspect `si-cuti-prod_database` dan `si-cuti-staging_database` serta kedua frontend network;
      network terpisah dan hanya berisi anggota yang diharapkan.
- [ ] `docker volume inspect si-cuti-prod_postgres_data si-cuti-staging_postgres_data` membuktikan
      volume PostgreSQL berbeda.
- [ ] Inspect kedua `private_documents`; file dummy staging tidak terlihat dalam mount production.
- [ ] Query marker dan `current_database()` pada tiap project; DB, user, dan credential berbeda. Uji
      silang credential staging ke production harus gagal.
- [ ] `docker ps --format '{{.Names}} {{.Ports}}'` menunjukkan hanya edge memetakan 80/443; tidak ada
      host mapping port PostgreSQL 5432 atau app 3000.
- [ ] Inspect edge membuktikan tidak ada mount dokumen. Tebakan URL file privat tidak dilayani statik
      dan konfigurasi Nginx tidak memiliki alias/root ke storage dokumen.
- [ ] Restart seluruh project staging; production tetap sehat dan container production tidak restart.
- [ ] Dengan runbook/reset staging yang eksplisit, reset hanya DB/volume staging; marker/checksum atau
      row canary production tidak berubah.
- [ ] Restart project production tanpa `--volumes`; row DB dan file dummy production tetap ada.
- [ ] Terapkan migration canary aman hanya pada staging atau periksa migration history sesudah
      migration staging; schema dan migration history production tidak berubah.
- [ ] Dalam sesi terkontrol, arahkan staging ke DB production; guard harus gagal dan migrator/app
      staging tidak berjalan. Segera pulihkan env.
- [ ] Backup staging dan production masuk root berbeda dan mudah dibedakan; uji rotasi staging
      terkontrol tidak menghapus/menimpa artifact production.
- [ ] HTTPS untuk kedua hostname menuju environment benar, HTTP redirect ke HTTPS, dan firewall hanya
      membuka layanan host yang disetujui.

Catat command, timestamp, image digest, output tersanitasi, dan pemeriksa tiap butir. Kegagalan
isolasi adalah release blocker. Uji reset/migration canary hanya pada staging/dummy data dengan
backup dan rollback plan; jangan bereksperimen destruktif pada production.

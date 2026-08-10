# SI CUTI - Decision Log M0–M1

Status: **Keputusan kebijakan minimum M1 disetujui; M1 tidak lagi terblokir**
Tanggal review ulang: **10 Agustus 2026**  
Sumber utama: `docs/source/Laporan-Kerangka-Inovasi-SI-CUTI-KANSAR-NIAS.pdf`


## 0. Catatan arah teknis M1 — 10 Agustus 2026

Stakeholder mengganti usulan Laravel dengan arah **disetujui**: TypeScript-first modular monolith, Next.js/React, Node.js, PostgreSQL, Docker Compose, Nginx, dan Ubuntu VPS. Perubahan terjadi sebelum scaffold/source ada: tidak ada migration/legacy code dan tidak ada business requirement berubah. Microservices/Kubernetes tidak disetujui.

| ID | Keputusan | Status |
|---|---|---|
| TECH-001 | TypeScript/Next.js modular monolith menggantikan usulan Laravel sebelum scaffolding | **Resolved — stakeholder, 10 Agustus 2026** |
| TECH-002 | Proposal Node 24, Next 16/React 19, PostgreSQL 18, Prisma 7, Zod 4, Vitest 4 | **Approval pending — dilarang scaffold/install** |
| TECH-003 | Proposal internal opaque database-session auth, provider-neutral; bukan JWT/Auth.js pada M1 | **Approval pending — AUTH-001 tetap resolved** |

## 1. Tujuan dan cara membaca

Dokumen ini mencatat keputusan yang belum terselesaikan dan dapat memengaruhi desain database,
workflow, perhitungan saldo, kontrol akses, dokumen, pelaporan, notifikasi, atau arsitektur deployment.
Review mencakup kembali seluruh 10 halaman PDF (teks, flowchart halaman 7, mockup halaman 8, dan
gambar timeline) serta seluruh dokumen M0. Mockup hanya dipakai sebagai bukti intent visual, bukan
sebagai sumber kebijakan, data pegawai, nilai statistik, atau aturan “3 hari kerja”.

Kolom **Recommended option** adalah rekomendasi teknis/produk, bukan keputusan final. Nilai
**Belum diputuskan** pada kolom Final decision berarti implementasi tidak boleh menganggap
rekomendasi telah disetujui.

### Arti status

- **Blocking — stakeholder**: kebijakan/proses organisasi harus dikonfirmasi sebelum milestone terkait.
- **Blocking — technical owner**: pilihan teknis/operasional harus ditetapkan sebelum M1 atau fitur terkait.
- **Non-blocking — deferred**: dapat ditunda tanpa mengubah requirement yang telah tegas, tetapi harus diputuskan sebelum fitur terkait diproduksikan.
- **Resolved**: hanya digunakan setelah keputusan, pemilik keputusan, tanggal, dan dasar persetujuan dicatat.

## 2. A — Yang dinyatakan eksplisit oleh PDF

PDF secara eksplisit menyatakan baseline berikut; daftar ini **bukan** daftar keputusan baru:

- aplikasi web SI CUTI mendigitalisasi administrasi cuti dan izin untuk 93 pegawai;
- terdapat dashboard Admin dan Pegawai, dengan akses berbasis role dan basis data relasional;
- Cuti Tahunan memiliki Cuti N (12 hari), Cuti N-1, Cuti N-2, dan Klaim Cuti Bersama;
- urutan pemotongan adalah Klaim Cuti Bersama → Cuti N-2 → Cuti N-1 → Cuti N;
- Cuti Sakit, Cuti Alasan Penting, Cuti Besar, Cuti Melahirkan, dan CLTN tidak memotong saldo Cuti Tahunan;
- Klaim Cuti Bersama memerlukan bukti dan persetujuan Admin sebelum menambah kuota;
- flowchart hybrid memperlihatkan cetak form, tanda tangan fisik, penyerahan kepada Admin, validasi
  kelengkapan, pengembalian berkas belum lengkap, pengarsipan, dan pencatatan riwayat;
- flowchart menempatkan pengurangan saldo Cuti Tahunan pada proses Admin setelah berkas lengkap,
  tetapi tidak menetapkan titik transaksi/status yang cukup presisi untuk implementasi;
- izin tidak mengurangi saldo Cuti Tahunan; PDF menyebut implikasi TUKIN dan disiplin tanpa memberi
  rule deterministik yang dapat diotomasi;
- arsip digital, pencarian/filter, ekspor PDF/Excel, kalender, grafik, reminder H-2 kepada Pegawai dan
  atasan, audit (user/waktu/IP/aktivitas), serta validasi otomatis diperlukan;
- deployment dapat menggunakan server lokal atau cloud instansi, tanpa memilih salah satunya.

## 3. B dan C — Register keputusan terbuka

Setiap baris memisahkan fakta PDF pada kolom 4 dari rekomendasi pada kolom 8–9 dan kebijakan yang
masih memerlukan konfirmasi pada kolom 5, 10–12.

| Decision ID | Topic | Source / requirement reference | What the PDF explicitly states | What remains ambiguous | Impact if decided incorrectly | Available implementation options | Recommended option | Reason for recommendation | Requires stakeholder confirmation (Yes/No) | Final decision | Decision status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BAL-001 | Saat saldo dipotong | PDF flowchart h. 7; requirements §6; user-flows §2 | Pengurangan Cuti Tahunan digambarkan dalam proses Admin setelah berkas dinyatakan lengkap. | Apakah commit terjadi saat lengkap, upload scan final, status disetujui, atau tanggal mulai cuti; bagaimana reservasi mencegah saldo dipakai dua pengajuan. | Saldo ganda, saldo negatif, laporan keliru, atau cuti sah tanpa saldo. | Potong saat submit; reserve saat submit lalu commit saat lengkap/final; potong langsung saat lengkap; potong saat mulai cuti. | Reserve atomik saat submit dan commit setelah Admin menyatakan berkas final lengkap **hanya bila stakeholder menyetujui dua tahap**. | Mencegah double-spend sambil mengikuti posisi proses Admin pada flowchart; ledger tetap dapat diaudit. | Yes | Belum diputuskan | Blocking — stakeholder |
| BAL-002 | Penolakan/pembatalan dan restore | PDF tidak merinci; requirements §15.4; user-flows §10 | Tidak ada aturan eksplisit tentang reject/cancel setelah saldo terpengaruh. | Siapa dapat membatalkan, batas waktunya, efek cuti sebagian berjalan, dan apakah koreksi memakai reversal atau edit. | Kehilangan/kelebihan saldo dan audit tidak dapat dipertanggungjawabkan. | Tidak izinkan cancel; restore penuh; restore hari belum dipakai; keputusan kasus per kasus. | Gunakan transaksi kompensasi/reversal, bukan mengubah ledger lama; formula restore menunggu kebijakan. | Menjaga histori tanpa mengarang besaran restore. | Yes | Belum diputuskan | Blocking — stakeholder |
| BAL-003 | Perhitungan hari | PDF menyebut jumlah hari tetapi tidak mendefinisikan kalender; requirements §15.3 | Cuti dikelola dalam satuan hari. | Hari kalender vs hari kerja, akhir pekan/libur, setengah hari, timezone, overlap, retroaktif, dan perpanjangan. | Semua validasi saldo dan tanggal dapat salah. | Hari kalender; hari kerja berdasarkan kalender resmi; parameter per jenis cuti. | Tetapkan service day-count terpusat setelah kalender otoritatif dan aturan resmi disahkan; jangan hard-code. | Konsisten untuk saldo, kalender, reminder, dan laporan. | Yes | Belum diputuskan | Blocking — stakeholder |
| BAL-004 | Rollover N/N-1/N-2 | PDF aturan saldo; requirements §5.1–5.3 | N = 12; sisa tahun sebelumnya dapat ditangguhkan dengan batas 6; kondisi tidak mengambil Cuti Tahunan dua tahun memberi N-1 6 dan N-2 6. | Waktu proses tahunan, expiry, arti “tidak mengambil”, konsumsi/klaim yang dihitung, pegawai masuk/keluar tahun berjalan, idempotensi, dan nasib sisa tiap bucket. | Hak cuti tahunan salah secara massal dan sulit dipulihkan. | Batch tahunan; lazy calculation; penetapan manual Admin; kombinasi preview + approval. | Batch idempotent dengan preview, persetujuan Admin, snapshot sumber, dan ledger; formula final menunggu stakeholder. | Aman diaudit dan dapat direkonsiliasi tanpa menyimpulkan policy. | Yes | Belum diputuskan | Blocking — stakeholder |
| BAL-005 | Eligibility Klaim Cuti Bersama | PDF requirement klaim; requirements §5.4 | Pegawai mengunggah bukti; Admin menyetujui; klaim disetujui menambah kuota Cuti Tahunan. | Nilai klaim, periode/tanggal eligible, bukti sah, duplikasi, koreksi, expiry, dan siapa selain Admin bila ada. | Kuota dapat diklaim ganda atau diberikan tanpa dasar. | Input kuantitas bebas; katalog peristiwa cuti bersama; Admin menetapkan langsung; integrasi kalender resmi. | Katalog periode resmi + uniqueness per pegawai/peristiwa + approval Admin, setelah sumber dan formula disahkan. | Membatasi duplikasi dan memberi jejak sumber. | Yes | Belum diputuskan | Blocking — stakeholder |
| WF-001 | Batas hybrid fisik/digital | PDF flowchart h. 7; requirements §2 dan §6 | Form dicetak, ditandatangani, diserahkan kepada Admin, lalu scan/PDF diarsipkan. | Apakah langkah fisik tetap authoritative; apakah status sistem bersifat tracking saja; apakah e-sign/approval digital akan mengganti tanda tangan. | Sistem dapat memberi kesan persetujuan legal yang tidak sah atau menduplikasi proses. | Fisik authoritative; approval digital penuh; hybrid dengan tracking digital dan scan final authoritative. | Pertahankan hybrid dan scan final authoritative untuk baseline, sampai perubahan proses disahkan. | Paling dekat dengan PDF dan tidak menciptakan kewenangan digital. | Yes | Belum diputuskan | Blocking — stakeholder |
| WF-002 | Otoritas persetujuan final | PDF flowchart h. 7; requirements §15.1 | Cuti memperlihatkan tanda tangan Atasan Langsung dan Kepala Kantor; Admin memvalidasi/mengarsipkan. Izin memperlihatkan Atasan Langsung. | Siapa final approver per jenis/keadaan, urutan, delegasi/Plh/Plt, apakah Admin memutuskan atau hanya verifikasi. | RBAC dan dokumen persetujuan dapat memberi kewenangan kepada pihak yang salah. | Admin final; Kepala Kantor final; rantai configurable; proses fisik di luar sistem. | Modelkan Admin sebagai verifier/arsiparis, bukan final approver, sampai matriks kewenangan disahkan. | Tidak melampaui peran eksplisit Admin di PDF. | Yes | Belum diputuskan | Blocking — stakeholder |
| WF-003 | Koreksi/resubmission | PDF flowchart h. 7; requirements §6 | Admin mengembalikan berkas belum lengkap untuk diperbaiki Pegawai. | Field yang boleh diedit, versi lama, jumlah siklus, SLA, perubahan tanggal/jumlah, re-approval, dan efek saldo. | Perubahan material dapat melewati persetujuan atau merusak saldo/dokumen. | Edit record yang sama; revision immutable; buat pengajuan baru; Admin memperbaiki. | Revision immutable dengan alasan pengembalian, hanya Pegawai pemilik yang resubmit, dan perubahan material memulai ulang verifikasi. | Mempertahankan bukti perubahan dan owner isolation. | Yes | Belum diputuskan | Blocking — stakeholder |
| WF-004 | State machine dan hak transisi | PDF flowchart h. 7; requirements §15.2 | Ada pengajuan, pemeriksaan kelengkapan, perbaikan, arsip, dan riwayat. | Status tepat; hak draft/submit/reject/cancel/close; transisi terminal; overlap dan pengajuan retroaktif. | Database dan authorization boundary sulit diubah setelah kode dibangun. | State minimal hybrid; state approval digital; workflow configurable. | Definisikan state machine eksplisit dan transition matrix per role setelah WF-001/WF-002 diputuskan. | Menghindari status UI menjadi sumber otorisasi. | Yes | Belum diputuskan | Blocking — stakeholder |
| DOC-001 | Urutan tanda tangan dan arsip | PDF flowchart h. 7; user-flows §2/§4/§7 | Form dibuat/dicetak, ditandatangani, diserahkan, divalidasi, lalu dokumen final diunggah/diarsipkan. | Versi draft/final, penomoran, cap, siapa mengunggah, apakah scan boleh diganti, dan kapan arsip dianggap final. | Dokumen salah dapat dianggap resmi; histori bukti hilang. | Satu file ditimpa; multi-version; generated form + immutable final scan. | Pisahkan generated form dan final signed scan; versioning, checksum, uploader, timestamp, dan supersede tanpa overwrite. | Menjaga provenance dan audit sequence. | Yes | Belum diputuskan | Blocking — stakeholder |
| DOC-002 | Retensi dan pemusnahan | PDF meminta e-archive tetapi tidak menyebut masa retensi; requirements §15.8 | Dokumen kepegawaian disimpan dan dapat dicari/diunduh sesuai akses. | Jadwal retensi, legal hold, pemusnahan, arsip pegawai nonaktif, dan retensi audit. | Pelanggaran kearsipan/privasi atau hilangnya bukti resmi. | Simpan selamanya; periode tetap; jadwal per jenis dokumen; mengikuti kebijakan arsip instansi. | Ikuti jadwal retensi resmi per jenis dengan legal hold dan pemusnahan teraudit; jangan delete sebelum kebijakan tersedia. | Retensi adalah policy, bukan pilihan developer. | Yes | Belum diputuskan | Blocking — stakeholder |
| DOC-003 | File policy dan storage | PDF menyebut upload PDF/bukti; architecture §3/§8; keputusan stakeholder 10 Agustus 2026 | Admin mengunggah PDF final dan Pegawai mengunggah bukti. | Format/ukuran, antivirus, enkripsi/key management, dan pilihan storage masih boleh dirancang M1 serta harus kompatibel dengan Ubuntu VPS. Retensi tetap DOC-002. | Malware, kebocoran data, file hilang, atau deployment tidak portabel. | Storage privat di luar direktori web publik melalui abstraction yang kompatibel dengan VPS. | Private object keys + MIME/signature allowlist + size limit + checksum + malware scan; backend mengotorisasi setiap akses. | Memenuhi isolasi dokumen tanpa mengunci detail storage M1. | No untuk kebijakan akses; detail teknis dirancang M1 | **Disetujui 10 Agustus 2026:** dokumen privat hanya dapat diakses Admin Kepegawaian sesuai otorisasi administratif atau Pegawai yang terkait dengan dokumen. File tidak boleh berada di direktori web publik atau memiliki URL anonim permanen. Setiap akses/download wajib melalui autentikasi dan otorisasi server-side; manipulasi direct object reference tidak boleh melewati owner isolation; metadata dan akses diaudit bila diwajibkan. Role masa depan tidak otomatis memperoleh akses; perlu keputusan kebijakan baru. | Resolved |
| DOC-004 | Nomor registrasi | PDF menyebut nomor registrasi otomatis; requirements §15.7 | Pengajuan memiliki nomor registrasi otomatis. | Pola, sequence reset, unit/tahun, nomor untuk revisi/cancel, dan concurrency. | Nomor tidak sesuai tata naskah atau duplikat. | UUID internal saja; sequence global; sequence per tahun/unit; integrasi penomoran eksternal. | Pisahkan immutable ID internal dari nomor kedinasan; generate nomor melalui transaksi setelah pola disahkan. | Menjaga integritas tanpa menebak format resmi. | Yes | Belum diputuskan | Blocking — stakeholder |
| PERM-001 | Workflow izin non-cuti | PDF flowchart h. 7; requirements §6 | Pegawai mencetak form izin, memperoleh tanda tangan Atasan Langsung, menyerahkan ke Admin; izin tidak memotong saldo Cuti Tahunan. | Jenis izin, bukti, durasi, status, final authority, koreksi/cancel, dan hubungan dengan absensi. | Izin dapat disamakan keliru dengan cuti atau catatan absensi. | Workflow sama dengan cuti; workflow khusus; pencatatan Admin saja. | Entitas/workflow izin terpisah tetapi memakai primitives dokumen/status/audit bersama; policy field menunggu konfirmasi. | Menjaga aturan “tidak memotong saldo” dan menghindari coupling. | Yes | Belum diputuskan | Blocking — stakeholder |
| PERM-002 | TUKIN dan disiplin | PDF flow izin; requirements §6 | PDF menyebut izin dapat dikenai pemotongan TUKIN sesuai ketentuan dan tidak masuk perhitungan disiplin. | Apakah SI CUTI menghitung/mengekspor dampak; formula, pengecualian, otoritas, integrasi, dan dasar regulasi. | Dampak finansial/disipliner salah adalah risiko tinggi. | Di luar scope; flag informasional; ekspor ke sistem lain; kalkulasi penuh. | M0 mencatat informasi saja; jangan menghitung TUKIN/disiplin hingga regulasi dan owner proses disahkan. | Tidak ada rule deterministik atau dasar otoritatif dalam sumber. | Yes | Belum diputuskan | Blocking — stakeholder |
| CAL-001 | Sumber kalender | PDF mockup h. 8; requirements §9 | Kalender personal memuat cuti, jadwal libur, dan agenda kerja; Admin memonitor cuti. | Sumber hari libur/agenda, owner edit, sinkronisasi, scope unit, dan konflik data. | Day-count, dashboard kesiapan, dan tampilan kalender tidak konsisten. | Input Admin; feed/API pemerintah; import file; integrasi kalender instansi; hanya cuti pada fase awal. | Adapter kalender dengan sumber authoritative terpisah; tampilkan hanya data yang sumbernya telah disetujui. | Tidak mengarang kalender dan memungkinkan pergantian sumber. | Yes | Belum diputuskan | Blocking — stakeholder |
| NOT-001 | Penerima dan kanal notifikasi | PDF reminder; requirements §10/§15.17 | Reminder H-2 ditujukan kepada Pegawai dan atasan. | Definisi atasan/delegasi, penerima tambahan, kanal, consent, failure/retry, dan data yang boleh muncul. | Kebocoran data atau reminder tidak sampai kepada pihak tepat. | In-app; email; WhatsApp/SMS; kombinasi; supervisor dari master organisasi. | In-app baseline + resolver relasi atasan yang disahkan; kanal eksternal memakai adapter dan opt-in/kebijakan. | Meminimalkan eksposur data dan coupling. | Yes | Belum diputuskan | Blocking — stakeholder |
| NOT-002 | Semantik waktu H-2 | PDF reminder; requirement-traceability reminder | Reminder dibuat dua hari sebelum Pegawai kembali aktif. | Dua hari kalender/kerja, jam kirim, timezone, cuti berubah/dibatalkan, duplikasi, downtime scheduler. | Reminder terlambat, berulang, atau salah penerima. | Offset kalender; offset hari kerja; scheduled event saat approval; scan idempotent berkala. | Scheduler idempotent berbasis waktu kembali aktif yang authoritative; definisi “2 hari” mengikuti BAL-003. | Konsisten dan tahan retry/downtime. | Yes | Belum diputuskan | Non-blocking — deferred |
| AUD-001 | Cakupan dan integritas audit | PDF audit requirement; requirements §11 | Audit mencatat nama/user, waktu akses, alamat IP, dan aktivitas; perubahan saldo/upload harus terlacak. | Apakah read/download/login turut dicatat, old/new values, actor sistem, koreksi log, akses audit, tamper evidence, dan timezone. | Insiden tidak dapat ditelusuri atau log mengekspos data sensitif. | Log aplikasi mutable; append-only DB; WORM/external SIEM; cakupan minimal vs luas. | Append-only event untuk auth, status, saldo, klaim, dokumen, konfigurasi, export/download sensitif; akses least privilege dan redaksi data. | Memenuhi bukti minimum dan melindungi isi sensitif. | Yes (scope/access); No (append-only recommendation) | Belum diputuskan | Blocking — stakeholder |
| RPT-001 | Definisi, akses, dan isi laporan | PDF reporting/dashboard; requirements §7–§9 | Filter tanggal/jenis/nama/NIP/status dan ekspor PDF/Excel diperlukan. | Template resmi, zona/periode, status yang dihitung, kolom PII, role penerima, watermark, skala unit, dan definisi indikator. | Angka keputusan salah atau data pegawai bocor. | Query operasional; snapshot; template per laporan; report builder. | Definisikan katalog laporan/versioned query; seluruh export server-authorized dan diaudit; indikator menunggu definisi owner. | Reproducible dan mencegah export melewati RBAC. | Yes | Belum diputuskan | Blocking — stakeholder |
| RPT-002 | “Tersedia/siap gerak” | PDF tujuan/dashboard; requirements §15.11 | Dashboard mendukung keputusan/kesiapsiagaan dengan informasi personel yang sedang cuti. | Apakah tidak cuti berarti siap; faktor piket, sakit, izin, penugasan, lokasi, dan owner data. | Dashboard operasional dapat memberi kesimpulan keselamatan yang keliru. | Hanya label “sedang cuti”; indikator availability; integrasi roster/operasi. | Tampilkan fakta status cuti saja sampai definisi dan sumber kesiapan disahkan. | Tidak menyimpulkan readiness dari satu dataset. | Yes | Belum diputuskan | Blocking — stakeholder |
| AUTH-001 | Strategi autentikasi dan sesi | PDF menyebut login/RBAC; architecture §4/§8; keputusan AUTH-001 10 Agustus 2026 | Admin dan Pegawai login dan mendapat tampilan/hak sesuai role. | Detail identifier lokal, provisioning, reset/recovery, algoritma/parameter hash, MFA, session timeout, lockout, akun nonpegawai, dan lifecycle; provider institusional masa depan belum dipilih. | Account takeover, akun yatim, atau schema identitas salah. | Provider awal LOCAL; provider masa depan dapat berupa OIDC, SAML, atau SSO institusi. | Pisahkan User, Employee, role/permission, authentication identity, dan credential lokal melalui boundary provider-neutral. | Memungkinkan penambahan provider tanpa migrasi transaksi cuti atau pembuatan ulang Employee; authorization tetap dikendalikan aplikasi. | No untuk keputusan provider awal; detail kebijakan keamanan tetap memerlukan owner | **Disetujui 10 Agustus 2026:** provider awal `LOCAL`; password di-hash aman dan tidak disimpan plaintext; satu User dapat memiliki banyak identity/provider; autentikasi terpisah dari Employee dan authorization; seluruh enforcement server-side; business logic tidak bergantung pada LOCAL; SSO tidak diimplementasikan pada milestone awal. Persetujuan: stakeholder melalui keputusan AUTH-001 pada task ini. Pilihan provider masa depan tetap terbuka. | Resolved |
| AUTH-002 | Model organisasi dan akses | PDF dua role; database-schema §1; requirements §15.10 | Dua role utama adalah Admin Kepegawaian dan Pegawai. | Jumlah Admin, scope per unit, hierarki atasan, delegasi, akses Kepala Kantor, auditor/read-only, dan pegawai nonaktif. | Overexposure atau approval/reminder tidak dapat dimodelkan. | Dua role global; RBAC + scope unit; RBAC+ABAC; role tambahan. | Pertahankan dua role baseline, owner isolation untuk Pegawai, dan policy server-side; tambah scope/role hanya setelah matriks akses disahkan. | Memenuhi sumber tanpa menciptakan aktor baru. | Yes | Belum diputuskan | Blocking — stakeholder |
| DEP-001 | Lingkungan deployment | PDF opsi server lokal/cloud; architecture §8; keputusan stakeholder 10 Agustus 2026 | Sistem dapat ditempatkan di server lokal atau cloud instansi. | Containerization, reverse proxy, TLS/HTTPS, firewall, process management, deployment pipeline, environment variables, database topology, staging, dan kapasitas dirancang M1. | Pilihan framework/storage/auth dapat tidak dapat dioperasikan instansi. | Detail implementasi yang kompatibel dengan Ubuntu VPS. | Discovery infrastruktur dan threat/risk assessment selama M1. | Target telah tetap tanpa mengunci rancangan operasional. | No | **Disetujui 10 Agustus 2026:** target produksi awal adalah VPS berbasis Ubuntu. Detail teknis yang tercantum sebagai ambiguity boleh diusulkan pada M1 dan wajib kompatibel dengan Ubuntu VPS. Target tidak boleh diubah tanpa keputusan stakeholder baru. | Resolved |
| DEP-002 | Backup dan disaster recovery | PDF tidak menetapkan; architecture §8/§9; keputusan stakeholder 10 Agustus 2026 | PDF menuntut data terpusat/arsip, tetapi tidak memberi backup, RPO, atau RTO. | Tujuan sekunder/off-VPS, retensi, rotasi, enkripsi salinan, interval uji restore, RPO, RTO, dan runbook DR tetap terbuka hingga production readiness/M8. | Kehilangan arsip/ledger atau restore yang tidak konsisten. | Cron menjalankan backup DB dan dokumen privat serta mendukung penyalinan keluar lokasi data aplikasi utama; tujuan/retensi/DR ditetapkan kemudian. | Manifest konsisten, salinan terisolasi/off-VPS, retention berjenjang, dan uji restore berkala pada rancangan production. | Fondasi dapat dimulai tanpa menyatakan backup satu-VPS sebagai DR lengkap. | No untuk fondasi M1; Yes sebelum production | **Disetujui 10 Agustus 2026 untuk fondasi M1:** backup otomatis terjadwal memakai cron, minimal mencakup database dan dokumen privat, serta implementasinya harus mendukung penyalinan backup ke luar lokasi data aplikasi utama. Backup yang hanya berada pada VPS produksi yang sama bukan disaster recovery lengkap. Detail operasional yang masih terbuka dipindahkan ke gate M8/production. | Resolved untuk M1 — keputusan production readiness masih terbuka |
| DEP-003 | Availability, observability, dan operasi | PDF tidak merinci; architecture §9 | Aplikasi web harus mendukung proses administrasi, tanpa SLA eksplisit. | SLA/jam layanan, maintenance, monitoring, alert owner, log retention, patching, scaling, dan support. | Arsitektur bisa terlalu mahal atau tidak cukup andal. | Best effort; jam kerja; high availability. | Tetapkan SLO berbasis jam operasional dan runbook sebelum production; jangan mendesain HA tanpa kebutuhan. | Menyeimbangkan biaya dan risiko berdasarkan kebutuhan nyata. | Yes | Belum diputuskan | Non-blocking — deferred |
| DATA-001 | Struktur unit dan master pegawai | PDF dashboard/master data; requirements §15.10 | Admin mengelola master data dan dashboard menampilkan data pegawai. | Unit/lokasi/jabatan/hierarki, sumber master, sinkronisasi, NIP sebagai login, dan lifecycle mutasi/nonaktif. | Filter, akses, atasan, reporting, dan reminder salah. | Input manual; import Excel; sinkronisasi HR; hybrid. | Gunakan ID internal, NIP unik sebagai atribut bila disahkan, effective-dated hierarchy, dan adapter import/sync. | Menghindari ketergantungan pada identifier yang dapat berubah dan mendukung histori. | Yes | Belum diputuskan | Blocking — stakeholder |
| VAL-001 | Validasi jenis cuti dan bukti | PDF memberi syarat/contoh; requirements §5.7/§12 | PDF menyebut contoh bukti/keadaan, termasuk surat dokter dan validasi otomatis; contoh lebih dari 14 hari bukan rule final yang lengkap. | Rule tiap jenis, limit/dokumen, CAP, masa kerja Cuti Besar, eligibility melahirkan/CLTN, dan tindakan block vs warning. | Pengajuan sah ditolak atau pengajuan tidak sah diterima. | Hard-code contoh; rules configurable; validasi manual sampai dasar resmi tersedia. | Manual verification + requirement checklist yang telah disahkan; otomasi hanya untuk rule dengan sumber/versi/effective date jelas. | Tidak mengubah contoh menjadi kebijakan. | Yes | Belum diputuskan | Blocking — stakeholder |

## 4. Ringkasan gate keputusan

### Gate sebelum M1 — terpenuhi

- **DEP-001** menetapkan Ubuntu VPS, **DOC-003** menetapkan kebijakan akses dokumen privat, dan
  **DEP-002** menetapkan baseline backup cron untuk database serta dokumen privat.
- **AUTH-001** sebelumnya telah menetapkan provider autentikasi awal. Detail keamanan autentikasi
  tetap menjadi gate fitur autentikasi M2, bukan scaffold teknis M1.
- Dengan keputusan stakeholder eksplisit tersebut, seluruh requirement tingkat kebijakan yang
  diperlukan untuk memulai M1 telah resolved. **M1 tidak lagi terblokir.** Ini bukan hasil menerima
  rekomendasi: dasar pembukaan gate adalah keputusan final stakeholder yang dicatat di register.

### Blocking sebelum M2

- **AUTH-002, DATA-001** untuk matriks akses, relasi atasan, dan lifecycle akun/pegawai.

### Blocking sebelum M3

- **BAL-001 sampai BAL-005**, terutama day-count dan rollover. Tidak ada formula baru yang boleh
  dibuat untuk menutup ambiguity.

### Blocking sebelum M4–M5

- **WF-001 sampai WF-004, DOC-001, DOC-004, PERM-001, PERM-002, VAL-001**.
- **DOC-002** harus diputuskan sebelum arsip produksi atau pemusnahan data diaktifkan.

### Blocking sebelum M6–M8/production

- **CAL-001, NOT-001, AUD-001, RPT-001, RPT-002** harus diputuskan sebelum permukaan terkait.
- **NOT-002 dan DEP-003** adalah non-blocking untuk fondasi, tetapi blocking sebelum reminder dan
  production readiness masing-masing.
- Detail tujuan backup sekunder/off-VPS, retensi, rotasi, enkripsi salinan, interval uji restore,
  RPO, RTO, dan runbook DR pada **DEP-002** tidak menghalangi M1 bila fondasi mendukungnya, tetapi
  wajib diputuskan sebelum M8/production readiness. Backup hanya di VPS produksi bukan DR lengkap.

## 5. Rekomendasi lintas keputusan (belum merupakan final decision)

1. Gunakan ledger saldo append-only dan transaksi kompensasi; jangan edit histori saldo.
2. Pertahankan baseline hybrid dan pisahkan generated form dari signed final scan hingga stakeholder
   menyetujui approval/tanda tangan digital.
3. Gunakan state machine dan transition authorization di backend setelah matriks otoritas disahkan.
4. Gunakan storage abstraction, checksum, versioning, private download, dan pemeriksaan file.
5. Buat report/export server-authorized serta teraudit; jangan menyimpulkan kesiapan personel hanya
   dari ketidakhadiran record cuti.
6. Tunda formula TUKIN/disiplin dan validasi kebijakan cuti sampai dasar resmi tersedia.
7. Rancang detail deployment dan backup M1 agar kompatibel dengan Ubuntu VPS serta extensible ke
   tujuan backup luar lokasi; tetapkan RPO/RTO dan ownership operasi sebelum production readiness.

## 6. Prosedur menutup keputusan

Untuk mengubah status menjadi **Resolved**, catat pada kolom Final decision: keputusan eksplisit,
pemilik/otoritas persetujuan, tanggal, referensi notulen/regulasi, tanggal berlaku, dan (jika relevan)
aturan migrasi. Setelah itu perbarui seluruh referensi Decision ID pada dokumen M0 dan traceability.
Keputusan teknis tidak boleh mengubah requirement bisnis yang telah tegas hanya demi kemudahan
implementasi.

# SI CUTI - Sistem Informasi Cuti dan Izin

Repository awal untuk pengembangan **SI CUTI** pada Kantor Pencarian dan Pertolongan Kelas B Nias, Badan Nasional Pencarian dan Pertolongan.

## Tujuan repository

Repository ini sengaja dimulai sebagai **documentation-first repository**. Pada tahap awal, jangan langsung membangun aplikasi. Gunakan dokumen sumber dan dokumen analisis di folder `docs/` sebagai konteks bersama sebelum implementasi kode.

## Source of truth

Dokumen sumber utama berada di:

`docs/source/Laporan-Kerangka-Inovasi-SI-CUTI-KANSAR-NIAS.pdf`

Apabila terdapat perbedaan antara interpretasi teknis dengan proposal asli, proposal asli harus diperiksa kembali. Jangan membuat aturan bisnis baru tanpa persetujuan.

## Struktur awal

```text
si-cuti-kansar-nias/
├── AGENTS.md
├── CODEX_START_HERE.md
├── README.md
├── .gitignore
└── docs/
    ├── source/
    │   └── Laporan-Kerangka-Inovasi-SI-CUTI-KANSAR-NIAS.pdf
    ├── requirements.md
    ├── architecture.md
    ├── database-schema.md
    ├── user-flows.md
    ├── design-system.md
    ├── implementation-plan.md
    └── requirement-traceability.md
```

## Cara menggunakan dengan Codex

1. Upload seluruh struktur repository ini ke GitHub.
2. Hubungkan repository ke Codex.
3. Minta Codex membaca `AGENTS.md` terlebih dahulu.
4. Jalankan instruksi pada `CODEX_START_HERE.md`.
5. Review hasil dokumentasi sebelum mengizinkan implementasi aplikasi.
6. Setelah dokumentasi disetujui, kerjakan milestone satu per satu sesuai `docs/implementation-plan.md`.

## Prinsip utama

- PDF proposal adalah sumber kebutuhan bisnis utama.
- Semua UI yang dilihat pengguna menggunakan Bahasa Indonesia.
- Dua role utama adalah Admin Kepegawaian dan Pegawai.
- Perhitungan saldo cuti harus berada pada domain/service layer, bukan komponen UI.
- Perubahan sensitif harus memiliki audit trail.
- Jangan menggunakan data pribadi pegawai nyata saat pengembangan.
- Jangan mengubah modul yang sudah stabil tanpa kebutuhan yang jelas.

# AGENTS.md - SI CUTI Repository Instructions

## Project identity

Nama aplikasi: **SI CUTI - Sistem Informasi Cuti dan Izin**  
Instansi: **Kantor Pencarian dan Pertolongan Kelas B Nias**  
Organisasi: **Badan Nasional Pencarian dan Pertolongan**

## Primary source of truth

Dokumen kebutuhan produk utama:

`docs/source/Laporan-Kerangka-Inovasi-SI-CUTI-KANSAR-NIAS.pdf`

Dokumen turunan yang wajib diperiksa sebelum implementasi:

- `docs/requirements.md`
- `docs/architecture.md`
- `docs/database-schema.md`
- `docs/user-flows.md`
- `docs/design-system.md`
- `docs/implementation-plan.md`
- `docs/requirement-traceability.md`

Jika dokumen turunan bertentangan dengan PDF sumber, jangan menebak. Laporkan konflik dan minta keputusan.

## Non-negotiable rules

1. Jangan membuat aturan cuti/izin yang tidak dinyatakan dalam sumber atau belum disetujui.
2. Pertahankan terminologi: Cuti N, Cuti N-1, Cuti N-2, Klaim Cuti Bersama, Cuti Tahunan, Cuti Sakit, Cuti Alasan Penting, Cuti Besar, Cuti Melahirkan, dan CLTN.
3. UI yang dilihat pengguna menggunakan Bahasa Indonesia.
4. Dua role utama: Admin Kepegawaian dan Pegawai.
5. Role-based access control harus ditegakkan di server/backend, bukan hanya dengan menyembunyikan menu.
6. Semua perubahan saldo dan operasi sensitif harus dapat diaudit.
7. Business logic, khususnya perhitungan saldo cuti, tidak boleh ditaruh di komponen UI.
8. Gunakan relational database.
9. Jangan gunakan data pribadi pegawai nyata untuk data development/demo.
10. Sistem harus responsif untuk desktop, tablet, dan smartphone.
11. Jangan refactor atau mengubah modul stabil yang tidak terkait dengan task aktif.
12. Tambahkan pengujian otomatis untuk business logic kritis.
13. Sebelum implementasi task kompleks: baca konteks -> rencanakan -> implementasikan -> test -> verifikasi -> laporkan.
14. Ketika requirement ambigu, buat catatan ambiguity; jangan memilih aturan sendiri.
15. Setiap task harus melaporkan file yang diubah dan hasil lint/typecheck/test yang relevan.

## Product constraints from source

- Sistem ditujukan untuk administrasi cuti dan izin pegawai berbasis web.
- Proposal menyebut cakupan 93 pegawai.
- Sistem memiliki dashboard Admin dan Pegawai.
- Sistem harus mendukung arsip dokumen digital, pencarian/filter, ekspor PDF dan Excel, kalender cuti, grafik analitik, reminder, audit trail, dan validasi aturan otomatis.
- Saldo Cuti Tahunan memiliki bucket Cuti N, Cuti N-1, Cuti N-2, dan Klaim Cuti Bersama.
- Prioritas pemotongan Cuti Tahunan: Klaim Cuti Bersama -> Cuti N-2 -> Cuti N-1 -> Cuti N.

## Definition of done for implementation tasks

Task belum dianggap selesai jika hal berikut yang relevan belum dilakukan:

- requirement terkait telah diperiksa;
- authorization boundary telah diuji;
- lint/typecheck berhasil;
- automated test untuk logic kritis berhasil;
- error/empty/loading state tersedia untuk UI yang memerlukannya;
- tidak ada data rahasia atau data pegawai nyata di commit;
- perubahan didokumentasikan secara ringkas.

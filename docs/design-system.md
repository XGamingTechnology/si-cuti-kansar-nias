# SI CUTI - Design System Baseline

Status: **Visual direction derived from dashboard mockups in proposal page 8**

## 1. Design intent

Aplikasi harus terasa sebagai aplikasi internal instansi pemerintah yang:

- profesional;
- modern;
- bersih;
- padat informasi tetapi mudah dipindai;
- memprioritaskan fungsi dibanding dekorasi.

## 2. Visual reference

Gunakan mockup **Dashboard Admin** dan **Dashboard Pegawai** pada halaman 8 proposal sebagai referensi visual utama.

Karakter visual yang terlihat:

- sidebar kiri berwarna navy/dark blue;
- area kerja utama terang/putih;
- kartu statistik di bagian atas;
- kalender sebagai elemen utama;
- tabel ringkas;
- grafik batang dan donut/pie;
- status dan jenis cuti dibedakan dengan warna;
- topbar ringkas;
- layout desktop berbasis grid/kartu.

## 3. Layout primitives

Buat komponen reusable untuk:

- AppShell
- Sidebar
- Topbar
- PageHeader
- ContentGrid
- StatCard
- Panel/Card
- DataTable
- SearchBar
- FilterBar
- Badge / StatusBadge
- FormField
- Select
- DateRangePicker
- FileUpload
- Modal / ConfirmationDialog
- Alert / Toast
- Calendar
- ChartContainer
- EmptyState
- LoadingState
- ErrorState
- Pagination

## 4. Admin navigation baseline

Menu final mengikuti requirement, dengan candidate grouping:

- Dashboard
- Data Pegawai
- Pengajuan Cuti
- Klaim Cuti Bersama
- Perizinan
- Arsip/Riwayat
- Laporan
- Audit/Log (sesuai hak akses)
- Pengaturan

Jangan menganggap grouping ini sebagai aturan organisasi final; sesuaikan setelah review stakeholder.

## 5. Employee navigation baseline

- Dashboard
- Pengajuan Cuti
- Klaim Cuti Bersama
- Pengajuan Izin
- Riwayat Cuti
- Riwayat Izin
- Saldo Cuti
- Kalender Cuti
- Profil

## 6. Responsive behavior

Proposal menyatakan aplikasi harus dapat digunakan melalui komputer, tablet, dan smartphone.

Responsive expectation:

- desktop: sidebar persisten + multi-column dashboard;
- tablet: sidebar collapsible + grid berkurang;
- mobile: navigation drawer/bottom-friendly access, card stacked, table dapat menggunakan responsive pattern;
- tidak boleh ada horizontal overflow yang tidak terkendali.

## 7. Accessibility baseline

Technical recommendation:

- semantic HTML;
- keyboard navigation;
- visible focus;
- form labels;
- contrast yang memadai;
- status tidak disampaikan hanya dengan warna;
- chart memiliki text summary/accessible labeling.

## 8. Language

Semua label dan pesan pengguna menggunakan Bahasa Indonesia.

Contoh istilah:

- Dashboard
- Data Pegawai
- Pengajuan Cuti
- Pengajuan Izin
- Klaim Cuti Bersama
- Saldo Cuti
- Riwayat
- Menunggu Verifikasi
- Disetujui
- Ditolak

Status final harus mengikuti workflow yang disetujui.

## 9. Do not

- jangan mengubah identitas menjadi consumer SaaS yang terlalu dekoratif;
- jangan menggunakan animasi berlebihan;
- jangan menggunakan gradient dekoratif sebagai gaya utama;
- jangan membuat setiap halaman memiliki style sendiri-sendiri;
- jangan menaruh warna tanpa semantic meaning;
- jangan hard-code layout berulang jika dapat dibuat reusable.

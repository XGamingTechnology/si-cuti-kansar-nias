# Overlay resmi 2026 — sumber belum terverifikasi

Pemeriksaan 18 Oktober 2026 WIB pada task UAT kalender:

| Sumber / pemeriksaan                                                                                                                                 | Hasil aktual                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Artikel Kemenko PMK yang diberikan pengguna](https://www.kemenkopmk.go.id/pemerintah-tetapkan-17-hari-libur-nasional-dan-8-cuti-bersama-tahun-2026) | GET HTTPS mengikuti redirect ditolak HTTP **403** dari lingkungan cloud |
| Host tanpa `www`, artikel sama                                                                                                                       | Proxy menolak CONNECT, HTTP **403**, tidak mencapai origin              |
| `https://jdih.kemenkopmk.go.id/`                                                                                                                     | Proxy menolak CONNECT, HTTP **403**, tidak mencapai origin              |

TLS tidak dinonaktifkan. PDF SKB tidak berhasil diambil; nomor/tanggal SKB, isi lampiran,
checksum PDF, dan kemungkinan SKB perubahan **belum dapat diverifikasi**. Judul artikel saja
bukan bukti tanggal-tanggal di lampiran atau ketiadaan perubahan.

Karena itu **tidak ada JSON tanggal libur 2026 yang diklaim terverifikasi dalam PR ini**.
Tidak mengisi tanggal dari ingatan, data demo, API komunitas, atau menebak kuota. Tidak membuat
checksum palsu/berkas impor kosong. Fixture overlay sintetis hanya dipakai di DB disposable
atau intersepsi browser dan bukan dataset pemerintah untuk dipublikasikan.

## Melengkapi dataset ketika dokumen resmi dapat diakses

1. Ambil PDF SKB dan setiap perubahan dari sumber kementerian resmi; catat URL origin/final,
   waktu pengambilan WIB, nomor/tanggal dokumen, hubungan dokumen perubahan dan cakupan tahun.
2. Cocokkan seluruh tanggal/nama/kategori dengan lampiran yang berlaku. Simpan provenance
   dan SHA-256 byte PDF (`sha256sum`), bukan hanya checksum judul/URL.
3. Susun satu JSON yang lolos `normalizeOverlay` di
   `src/application/dashboard/overlay.ts`: `year`, `sourceReference`, `sourcePublishedOn`,
   `sourceUrl`, `events[{date,name,category}]`. Kategori hanya `PUBLIC_HOLIDAY` atau `JOINT_LEAVE`;
   tanggal sesuai tahun, maksimal 500 event, tidak duplikat tanggal+kategori. Provenance/checksum
   file sumber disimpan di dokumen pendamping; jangan menambah field asing ke payload import strict.
4. Hitung checksum file JSON serta digest payload yang telah dinormalisasi (`overlayDigest`).
   Jangan menyamakan checksum byte file dengan digest canonical payload.
5. Admin mengimpor pada **Kelola kalender hari libur**, memeriksa sumber/diff/version, membuat
   pratinjau, lalu mencentang konfirmasi publikasi. Tidak ada publikasi/scheduler/koneksi otomatis
   ke VPS dari task ini. Import existing tetap dipakai, tanpa jalur publikasi baru.

Overlay bersifat tampilan: tidak memutasi saldo, approval, WorkingCalendarException, hari kerja
atau eligibility klaim. Jika dataset belum terbit, UI tetap menyatakan tahun belum tersedia dan
kalender pengajuan tetap berfungsi. Dataset resmi adalah tindak lanjut yang masih membutuhkan
akses ke PDF sumber dan pemeriksaan perubahan, bukan persetujuan untuk memasukkan tanggal tebakan.

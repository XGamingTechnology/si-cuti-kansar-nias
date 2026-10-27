# Persiapan integrasi TTE

Pemeriksaan sumber pada task UAT 27 Oktober 2026: tidak ditemukan adapter penyedia,
proses penandatanganan kriptografis, atau verifikasi sertifikat/TTE. `generateDecisionPdf`
menggambar teks penanda dan menyalin halaman; ia bukan integrasi TTE. Admin pencatat
berasal dari snapshot aksi SI CUTI, bukan hasil verifikasi identitas pejabat oleh penyedia.
Tanda tangan fisik pada scan tetap bukti proses hybrid yang ada.

Rancangan berikut belum mengesahkan penyedia, otorisasi atau implementasi:

- Pisahkan **pejabat penandatangan** (identitas dan kapasitas definitif/Plt./Plh., periode
  kewenangan dan dasar penugasan) dari **Admin pencatat/verifikator administrasi**.
  Master pejabat sendiri tidak memberikan hak menandatangani; pemetaan identitas penyedia,
  delegasi dan alur persetujuan harus diputuskan dan diverifikasi.
- Nama penandatangan, identitas sertifikat, penyedia dan status TTE harus berasal dari hasil
  verifikasi penyedia yang terautentikasi, ditautkan ke hash dokumen/versi. Label “valid”
  hanya setelah keutuhan PDF, cakupan byte/revisi, rantai kepercayaan, waktu/timestamp dan
  status pencabutan sertifikat diperiksa. Kegagalan/hasil tidak diketahui tidak dianggap sah.
- Arsipkan byte PDF yang telah ditandatangani apa adanya beserta hash. Menyalin halaman,
  menambahkan cap atau ringkasan dengan renderer saat ini menghasilkan PDF baru dan **tidak
  mempertahankan validitas tanda tangan digital sumber**. Jangan menamai turunan itu sebagai
  PDF bertanda tangan sah. Tentukan apakah penanda/ringkasan dibuat sebelum penandatanganan,
  disajikan terpisah, atau melalui revisi incremental yang secara eksplisit diizinkan penyedia
  dan diverifikasi ulang. Dokumen lama tidak ditandatangani ulang secara diam-diam.
- Simpan versi input/output, hash, ID transaksi penyedia, aktor, dasar kewenangan, waktu,
  hasil/verifikasi dan versi verifier secara append-only. Bedakan waktu pencatatan aplikasi,
  waktu tanda tangan dan timestamp terpercaya. Callback/retry harus idempoten; kegagalan
  penyedia tidak boleh menggandakan keputusan/saldo. Pertahankan RBAC dan akses arsip privat.
- Kunci privat dikelola penyedia sesuai keputusan integrasi; tidak disimpan di aplikasi,
  repository, log atau fixture. Task ini tidak membuat kunci maupun tanda tangan.

Keputusan yang diperlukan: siapa penyedia TTE dan layanan verifikasinya; identitas akun dan
sertifikat pejabat; siapa berwenang meminta/mengonfirmasi tanda tangan; aturan Plt./Plh./delegasi;
urutan tanda tangan atasan dan pejabat; format PDF/PAdES dan kebijakan perubahan dokumen;
respons terhadap sertifikat dicabut/kedaluwarsa, outage, koreksi/pembatalan; retensi bukti
verifikasi, akses audit, serta pengujian sandbox dan acceptance operasional.

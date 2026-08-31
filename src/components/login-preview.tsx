import type { PreviewRole } from "@/lib/prototype-data";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span>S</span>
    </span>
  );
}

export function LoginPreview({
  onPreview,
}: {
  onPreview: (role: PreviewRole) => void;
}) {
  return (
    <div className="login-layout">
      <section className="login-intro">
        <div className="login-brand">
          <BrandMark />
          <div>
            <strong>SI CUTI</strong>
            <span>Kantor SAR Nias</span>
          </div>
        </div>
        <div className="intro-copy">
          <p className="eyebrow light">Sistem Informasi Kepegawaian</p>
          <h1>
            Kelola cuti dan izin
            <br />
            dengan lebih tertib.
          </h1>
          <p>
            Prototype antarmuka layanan administrasi cuti dan izin untuk
            mendukung proses kerja yang ringkas, transparan, dan terdokumentasi.
          </p>
          <div className="feature-list">
            <span>✓ Akses sesuai peran</span>
            <span>✓ Arsip terorganisir</span>
            <span>✓ Responsif di berbagai perangkat</span>
          </div>
        </div>
        <p className="agency">BADAN NASIONAL PENCARIAN DAN PERTOLONGAN</p>
      </section>
      <section className="login-form-wrap">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            onPreview("employee");
          }}
        >
          <div className="mobile-brand">
            <BrandMark />
            <strong>SI CUTI</strong>
          </div>
          <p className="eyebrow">Selamat datang</p>
          <h2>Masuk ke akun Anda</h2>
          <p className="form-lead">
            Gunakan NIP dan kata sandi untuk melanjutkan.
          </p>
          <label>
            NIP
            <input inputMode="numeric" placeholder="Masukkan NIP" />
          </label>
          <label>
            Kata sandi
            <div className="password-field">
              <input type="password" placeholder="Masukkan kata sandi" />
              <button type="button" aria-label="Tampilkan kata sandi">
                ◉
              </button>
            </div>
          </label>
          <div className="form-row">
            <label className="remember">
              <input type="checkbox" /> Ingat saya
            </label>
            <button className="link-button" type="button">
              Lupa kata sandi?
            </button>
          </div>
          <button className="primary-button full" type="submit">
            Masuk <span>→</span>
          </button>
          <div className="demo-note">
            <strong>Pratinjau statis</strong>
            <p>
              Form ini tidak mengirim atau menyimpan kredensial. Gunakan pemilih
              mode untuk melihat dashboard.
            </p>
          </div>
          <p className="help">Butuh bantuan? Hubungi Admin Kepegawaian</p>
        </form>
      </section>
    </div>
  );
}

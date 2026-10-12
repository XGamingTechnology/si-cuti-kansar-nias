"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { BrandMark } from "./login-preview";
import "./login-form.css";

type Notice = {
  kind: "error" | "warning" | "success";
  title: string;
  description: string;
  id: number;
};

function LoginIcon({
  name,
}: {
  name:
    | "eye"
    | "eye-off"
    | "arrow"
    | "shield"
    | "archive"
    | "devices"
    | "check"
    | "notice"
    | "close";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "eye" && (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === "eye-off" && (
        <>
          <path d="m3 3 18 18M10.5 5.1A12.4 12.4 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3.4 4.4M6.2 6.2A18.7 18.7 0 0 0 2 12s3.5 7 10 7a12.8 12.8 0 0 0 5.1-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      )}
      {name === "arrow" && <path d="M4 12h16m-6-6 6 6-6 6" />}
      {name === "shield" && (
        <>
          <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z" />
          <path d="m8 12 3 3 5-6" />
        </>
      )}
      {name === "archive" && (
        <>
          <path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6" />
        </>
      )}
      {name === "devices" && (
        <>
          <path d="M14 16H3V4h18v5M7 20h5m-2-4v4" />
          <rect x="15" y="11" width="6" height="10" rx="1" />
        </>
      )}
      {name === "check" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 3 3 5-6" />
        </>
      )}
      {name === "notice" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6m0 4h.01" />
        </>
      )}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}

function LoginToast({
  notice,
  onDismiss,
}: {
  notice: Notice;
  onDismiss: () => void;
}) {
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : 180;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [closing, onDismiss]);
  return (
    <aside
      className={`sign-in-toast sign-in-toast--${notice.kind}${closing ? " sign-in-toast--closing" : ""}`}
      aria-label="Notifikasi masuk"
    >
      <span className="sign-in-toast-icon">
        <LoginIcon name={notice.kind === "success" ? "check" : "notice"} />
      </span>
      <div
        role={notice.kind === "error" ? "alert" : "status"}
        aria-atomic="true"
      >
        <strong>{notice.title}</strong>
        <p>{notice.description}</p>
      </div>
      <button
        type="button"
        aria-label="Tutup notifikasi"
        onClick={() => setClosing(true)}
      >
        <LoginIcon name="close" />
      </button>
    </aside>
  );
}

export function LoginForm({
  sessionExpired = false,
}: {
  sessionExpired?: boolean;
}) {
  const [notice, setNotice] = useState<Notice | null>(
    sessionExpired
      ? {
          kind: "warning",
          title: "Sesi telah berakhir",
          description: "Silakan masuk kembali untuk melanjutkan.",
          id: 0,
        }
      : null,
  );
  const [phase, setPhase] = useState<"idle" | "pending" | "success">("idle");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const inFlight = useRef(false);
  const noticeSequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (phase !== "success") return;
    // Brief acknowledgement only; the API still owns authentication and cookies.
    const timer = window.setTimeout(() => window.location.assign("/"), 180);
    return () => window.clearTimeout(timer);
  }, [phase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("pending");
    setNotice(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nip: data.get("nip"),
          password: data.get("password"),
        }),
      });
      if (!mounted.current) return;
      if (!response.ok) {
        setNotice({
          kind: "error",
          title: "Belum berhasil masuk",
          description: "NIP atau kata sandi tidak valid.",
          id: ++noticeSequence.current,
        });
        setPhase("idle");
        inFlight.current = false;
        return;
      }
      setNotice({
        kind: "success",
        title: "Berhasil masuk",
        description: "Menyiapkan ruang kerja Anda…",
        id: ++noticeSequence.current,
      });
      setPhase("success");
    } catch {
      if (!mounted.current) return;
      setNotice({
        kind: "error",
        title: "Koneksi belum tersedia",
        description: "Silakan periksa koneksi dan coba lagi.",
        id: ++noticeSequence.current,
      });
      setPhase("idle");
      inFlight.current = false;
    }
  }

  const dismissNotice = useCallback(() => setNotice(null), []);
  const busy = phase !== "idle";
  return (
    <div className="sign-in-layout">
      <section
        className="sign-in-brand-panel"
        aria-label="SI CUTI Kantor SAR Nias"
      >
        <div className="sign-in-atmosphere" aria-hidden="true">
          <span />
          <span />
        </div>
        <header className="sign-in-brand">
          <BrandMark />
          <div>
            <strong>SI CUTI</strong>
            <span>Kantor SAR Nias</span>
          </div>
        </header>
        <div className="sign-in-intro">
          <p className="sign-in-eyebrow">Sistem Informasi Kepegawaian</p>
          <p className="sign-in-headline">
            Cuti dan izin,
            <br />
            tertib dalam
            <br />
            <span>satu layanan.</span>
          </p>
          <p className="sign-in-description">
            Administrasi yang lebih ringkas, transparan, dan terdokumentasi
            untuk mendukung kerja Kantor SAR Nias.
          </p>
          <ul className="sign-in-features">
            <li>
              <span>
                <LoginIcon name="shield" />
              </span>
              <div>
                <strong>Akses sesuai peran</strong>
                <p>Ruang kerja Pegawai dan Admin Kepegawaian.</p>
              </div>
            </li>
            <li>
              <span>
                <LoginIcon name="archive" />
              </span>
              <div>
                <strong>Arsip terorganisir</strong>
                <p>Dokumen administrasi mudah ditelusuri.</p>
              </div>
            </li>
            <li>
              <span>
                <LoginIcon name="devices" />
              </span>
              <div>
                <strong>Responsif di berbagai perangkat</strong>
                <p>Tetap nyaman dari desktop hingga ponsel.</p>
              </div>
            </li>
          </ul>
        </div>
        <footer className="sign-in-agency">
          <span />
          Badan Nasional Pencarian dan Pertolongan
        </footer>
      </section>
      <section className="sign-in-form-panel" aria-label="Masuk ke akun">
        <div className="sign-in-surface">
          <p className="sign-in-access">
            <LoginIcon name="shield" /> Akses internal kepegawaian
          </p>
          <form
            className="sign-in-card"
            onSubmit={submit}
            aria-busy={busy}
            aria-labelledby="sign-in-title"
          >
            <div className="sign-in-card-heading">
              <p className="sign-in-eyebrow">Selamat datang</p>
              <h1 id="sign-in-title">Masuk ke akun Anda</h1>
              <p>Gunakan NIP dan kata sandi untuk melanjutkan.</p>
            </div>
            <div className="sign-in-fields">
              <label htmlFor="sign-in-nip">NIP</label>
              <input
                id="sign-in-nip"
                name="nip"
                type="text"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={32}
                placeholder="Masukkan NIP"
                readOnly={busy}
              />
              <label htmlFor="sign-in-password">Kata sandi</label>
              <div className="sign-in-password-field">
                <input
                  id="sign-in-password"
                  name="password"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Masukkan kata sandi"
                  readOnly={busy}
                />
                <button
                  className="sign-in-password-toggle"
                  type="button"
                  aria-label={
                    passwordVisible
                      ? "Sembunyikan kata sandi"
                      : "Tampilkan kata sandi"
                  }
                  aria-pressed={passwordVisible}
                  aria-controls="sign-in-password"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setPasswordVisible(!passwordVisible)}
                >
                  <LoginIcon name={passwordVisible ? "eye-off" : "eye"} />
                </button>
              </div>
            </div>
            <button className="sign-in-submit" disabled={busy} type="submit">
              <span
                className={`sign-in-spinner${busy ? " sign-in-spinner--active" : ""}`}
                aria-hidden="true"
              />
              <span>
                {phase === "pending"
                  ? "Memeriksa akun…"
                  : phase === "success"
                    ? "Menyiapkan ruang kerja…"
                    : "Masuk"}
              </span>
              <span className="sign-in-submit-arrow">
                <LoginIcon name="arrow" />
              </span>
            </button>
            <p className="sign-in-help">
              Butuh bantuan?
              <br />
              <strong>Hubungi Admin Kepegawaian</strong>
            </p>
          </form>
          <p className="sign-in-office">
            Kantor Pencarian dan Pertolongan Kelas B Nias
          </p>
        </div>
      </section>
      {notice && (
        <LoginToast key={notice.id} notice={notice} onDismiss={dismissNotice} />
      )}
    </div>
  );
}

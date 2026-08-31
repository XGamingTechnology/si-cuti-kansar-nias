"use client";
import { useState, type FormEvent } from "react";
import { BrandMark } from "./login-preview";

export function LoginForm({ sessionExpired = false }: { sessionExpired?: boolean }) {
  const [error, setError] = useState(sessionExpired ? "Sesi Anda telah berakhir. Silakan masuk kembali." : "");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nip: data.get("nip"), password: data.get("password") }) });
    setPending(false);
    if (!response.ok) { setError("NIP atau kata sandi tidak valid."); return; }
    window.location.assign("/");
  }
  return <div className="login-layout">
    <section className="login-intro"><div className="login-brand"><BrandMark /><div><strong>SI CUTI</strong><span>Kantor SAR Nias</span></div></div><div className="intro-copy"><p className="eyebrow light">Sistem Informasi Kepegawaian</p><h1>Kelola cuti dan izin<br />dengan lebih tertib.</h1><p>Layanan administrasi cuti dan izin untuk mendukung proses kerja yang ringkas, transparan, dan terdokumentasi.</p><div className="feature-list"><span>✓ Akses sesuai peran</span><span>✓ Arsip terorganisir</span><span>✓ Responsif di berbagai perangkat</span></div></div><p className="agency">BADAN NASIONAL PENCARIAN DAN PERTOLONGAN</p></section>
    <section className="login-form-wrap"><form className="login-card" onSubmit={submit}><div className="mobile-brand"><BrandMark /><strong>SI CUTI</strong></div><p className="eyebrow">Selamat datang</p><h2>Masuk ke akun Anda</h2><p className="form-lead">Gunakan NIP dan kata sandi untuk melanjutkan.</p><label>NIP<input name="nip" inputMode="numeric" autoComplete="username" required maxLength={32} placeholder="Masukkan NIP" /></label><label>Kata sandi<div className="password-field"><input name="password" type="password" autoComplete="current-password" required placeholder="Masukkan kata sandi" /></div></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="primary-button full" disabled={pending} type="submit"><span>{pending ? "Memproses…" : "Masuk"}</span><span>→</span></button><p className="help">Butuh bantuan? Hubungi Admin Kepegawaian</p></form></section>
  </div>;
}

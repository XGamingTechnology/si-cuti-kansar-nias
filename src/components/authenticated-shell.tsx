"use client";
import type { Principal } from "@/modules/auth/service";

export function AuthenticatedShell({ principal }: { principal: Principal }) {
  const role = principal.role === "ADMIN_KEPEGAWAIAN" ? "Admin Kepegawaian" : "Pegawai";
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }
  return <main className="authenticated-proof"><section><p className="eyebrow">SESI TERAUTENTIKASI</p><h1>Selamat datang, {principal.fullName}</h1><p>Anda masuk sebagai <strong>{role}</strong>. Autentikasi dan status akun telah diverifikasi oleh server.</p><button className="primary-button" onClick={logout}>Keluar</button></section></main>;
}

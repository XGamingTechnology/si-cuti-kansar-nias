"use client";
import type { Principal } from "@/modules/auth/service";
import { EmployeeManagement } from "@/components/employee-management";

export function AuthenticatedShell({ principal }: { principal: Principal }) {
  const isAdmin = principal.role === "ADMIN_KEPEGAWAIAN";
  const role = isAdmin ? "Admin Kepegawaian" : "Pegawai";
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }
  return (
    <main className="authenticated-proof">
      <section className="authenticated-welcome">
        <p className="eyebrow">
          {isAdmin ? "RUANG ADMIN KEPEGAWAIAN" : "RUANG PEGAWAI"}
        </p>
        <h1>Selamat datang, {principal.fullName}</h1>
        <p>
          Anda masuk sebagai <strong>{role}</strong>.{" "}
          {isAdmin
            ? "Akses master pegawai diperiksa kembali oleh server pada setiap permintaan."
            : "Akses profil dibatasi oleh server hanya untuk data Anda sendiri."}
        </p>
        <p>
          <a
            href={
              isAdmin
                ? "/api/admin/access"
                : `/api/employees/${principal.employeeId}`
            }
          >
            {isAdmin ? "Verifikasi akses Admin" : "Lihat profil saya"}
          </a>
        </p>
        <button className="primary-button" onClick={logout}>
          Keluar
        </button>
      </section>
      {isAdmin && <EmployeeManagement />}
    </main>
  );
}

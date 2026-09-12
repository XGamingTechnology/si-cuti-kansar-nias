"use client";

import { useState } from "react";
import type { Principal } from "@/modules/auth/service";
import { EmployeeManagement } from "@/components/employee-management";
import { BrandMark } from "@/components/login-preview";
import { Icon } from "@/components/ui";
import { WorkflowWorkspace } from "@/components/workflow-workspace";
import { AnnualBalanceManagement } from "@/components/annual-balance-management";
import { isAdminPrincipal } from "@/application/authorization/policy";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AuthenticatedShell({
  principal,
  initialAdminSurface = "pegawai",
}: {
  principal: Principal;
  initialAdminSurface?: "pegawai" | "saldo" | "pengajuan";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminSurface, setAdminSurface] = useState<
    "pegawai" | "saldo" | "pengajuan"
  >(initialAdminSurface);
  const isAdmin = isAdminPrincipal(principal);
  const role = isAdmin ? "Admin Kepegawaian" : "Pegawai";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  const employeeActive = !isAdmin || adminSurface === "pegawai";
  const balanceActive = isAdmin && adminSurface === "saldo";
  const workflowActive = isAdmin && adminSurface === "pengajuan";

  return (
    <div className="authenticated-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>

      <aside
        className={`authenticated-sidebar ${menuOpen ? "open" : ""}`}
        aria-label="Navigasi aplikasi"
      >
        <div className="shell-brand">
          <BrandMark />
          <div title="Kantor Pencarian dan Pertolongan Kelas B Nias">
            <strong>SI CUTI</strong>
            <span>Kantor SAR Nias</span>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Tutup menu"
          >
            ×
          </button>
        </div>

        <p className="nav-label">NAVIGASI</p>
        <nav aria-label="Navigasi utama">
          <a
            className={employeeActive ? "active" : ""}
            aria-current={employeeActive ? "page" : undefined}
            href={isAdmin ? "/#pegawai" : "#profil"}
            onClick={() => {
              if (isAdmin) setAdminSurface("pegawai");
              setMenuOpen(false);
            }}
          >
            <Icon name="people" />
            <span>{isAdmin ? "Pegawai" : "Profil Saya"}</span>
          </a>

          {isAdmin && (
            <a
              className={balanceActive ? "active" : ""}
              aria-current={balanceActive ? "page" : undefined}
              href="/admin/saldo-cuti"
              onClick={() => {
                setAdminSurface("saldo");
                setMenuOpen(false);
              }}
            >
              <Icon name="file" />
              <span>Saldo Cuti</span>
            </a>
          )}

          <a
            className={workflowActive ? "active" : ""}
            aria-current={workflowActive ? "page" : undefined}
            href={isAdmin ? "/#pengajuan" : "#pengajuan"}
            onClick={() => {
              if (isAdmin) setAdminSurface("pengajuan");
              setMenuOpen(false);
            }}
          >
            <Icon name="calendar" />
            <span>Pengajuan</span>
          </a>
        </nav>

        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials(principal.fullName)}
          </span>
          <div>
            <strong>{principal.fullName}</strong>
            <span>{role}</span>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="shell-scrim"
          type="button"
          aria-label="Tutup menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="authenticated-workspace">
        <header className="authenticated-topbar">
          <div className="topbar-title">
            <button
              type="button"
              className="shell-menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label="Buka menu"
              aria-expanded={menuOpen}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <span className="mobile-app-name">SI CUTI</span>
            <span className="desktop-context">
              {isAdmin ? "Administrasi Kepegawaian" : "Layanan Pegawai"}
            </span>
          </div>

          <div
            className="current-user"
            aria-label={`Pengguna aktif: ${principal.fullName}, ${role}`}
          >
            <span className="top-avatar" aria-hidden="true">
              {initials(principal.fullName)}
            </span>
            <div>
              <strong>{principal.fullName}</strong>
              <span>{role}</span>
            </div>
            <button type="button" className="logout-button" onClick={logout}>
              Keluar
            </button>
          </div>
        </header>

        <main id="main-content" className="authenticated-content" tabIndex={-1}>
          {isAdmin && adminSurface === "pegawai" && <EmployeeManagement />}
          {isAdmin && adminSurface === "saldo" && <AnnualBalanceManagement />}
          {!isAdmin && (
            <section className="profile-surface" id="profil">
              <p className="eyebrow">PROFIL SAYA</p>
              <h1>{principal.fullName}</h1>
              <p>
                Informasi profil hanya dapat diakses oleh Anda sesuai otorisasi
                server.
              </p>
              <a
                className="primary-button button-link"
                href={`/api/employees/${principal.employeeId}`}
              >
                Lihat profil saya
              </a>
            </section>
          )}
          {(!isAdmin || adminSurface === "pengajuan") && (
            <WorkflowWorkspace role={principal.role} />
          )}
        </main>
      </div>
    </div>
  );
}

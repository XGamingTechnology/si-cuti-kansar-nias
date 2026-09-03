"use client";

import { useState } from "react";
import type { Principal } from "@/modules/auth/service";
import { EmployeeManagement } from "@/components/employee-management";
import { BrandMark } from "@/components/login-preview";
import { Icon } from "@/components/ui";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AuthenticatedShell({ principal }: { principal: Principal }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = principal.role === "ADMIN_KEPEGAWAIAN";
  const role = isAdmin ? "Admin Kepegawaian" : "Pegawai";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  return (
    <div className="authenticated-shell">
      <aside className={`authenticated-sidebar ${menuOpen ? "open" : ""}`}>
        <div className="shell-brand">
          <BrandMark />
          <div>
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
            className="active"
            href={isAdmin ? "#pegawai" : "#profil"}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="people" /> {isAdmin ? "Pegawai" : "Profil Saya"}
          </a>
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{initials(principal.fullName)}</span>
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
            >
              ☰
            </button>
            <span className="mobile-app-name">SI CUTI</span>
            <span className="desktop-context">
              {isAdmin ? "Administrasi Kepegawaian" : "Layanan Pegawai"}
            </span>
          </div>
          <div className="current-user">
            <span className="top-avatar">{initials(principal.fullName)}</span>
            <div>
              <strong>{principal.fullName}</strong>
              <span>{role}</span>
            </div>
            <button type="button" className="logout-button" onClick={logout}>
              Keluar
            </button>
          </div>
        </header>
        <main className="authenticated-content">
          {isAdmin ? (
            <EmployeeManagement />
          ) : (
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
        </main>
      </div>
    </div>
  );
}

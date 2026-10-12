"use client";
import { useState, type ReactNode } from "react";
import {
  adminNavigation,
  employeeNavigation,
  type PreviewRole,
} from "@/lib/prototype-data";
import { BrandMark } from "./login-preview";
import { Icon } from "./ui";

export function AppShell({
  role,
  activeItem,
  onNavigate,
  switcher,
  children,
}: {
  role: Exclude<PreviewRole, "login">;
  activeItem: string;
  onNavigate: (label: string) => void;
  switcher: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const nav = role === "admin" ? adminNavigation : employeeNavigation;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="side-brand">
          <BrandMark />
          <div>
            <strong>SI CUTI</strong>
            <span>Kantor SAR Nias</span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Tutup menu">
            ×
          </button>
        </div>
        <p className="nav-label">MENU UTAMA</p>
        <nav>
          {nav.map((item, i) => (
            <button
              key={item}
              className={activeItem === item ? "active" : ""}
              onClick={() => {
                onNavigate(item);
                setOpen(false);
              }}
            >
              <Icon
                name={
                  i === 0
                    ? "Dashboard"
                    : item === "Data Pegawai" || item === "Profil"
                      ? "people"
                      : item.includes("Kalender")
                        ? "calendar"
                        : item === "Pengaturan"
                          ? "settings"
                          : "file"
                }
              />
              <span>{item}</span>
              {i > 1 && <em title="Placeholder fitur lanjutan">•</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">{role === "admin" ? "AS" : "RM"}</div>
          <div>
            <strong>{role === "admin" ? "Admin Sistem" : "Raka Mahesa"}</strong>
            <span>{role === "admin" ? "Admin Kepegawaian" : "Pegawai"}</span>
          </div>
          <button aria-label="Keluar">↪</button>
        </div>
      </aside>
      {open && (
        <button
          className="scrim"
          aria-label="Tutup menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="Buka menu"
            onClick={() => setOpen(true)}
          >
            ☰
          </button>
          <div className="breadcrumb">
            <span>SI CUTI</span>
            <b>/</b>
            <strong>{activeItem}</strong>
          </div>
          <div className="top-actions">
            {switcher}
            <button className="notification" aria-label="Notifikasi pratinjau">
              ♢<i />
            </button>
            <div className="top-avatar">{role === "admin" ? "AS" : "RM"}</div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

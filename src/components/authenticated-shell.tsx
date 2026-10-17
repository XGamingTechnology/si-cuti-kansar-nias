"use client";

import "./employee-workspace.css";
import { EmployeeProfile } from "./employee-profile";
import { DashboardWorkspace } from "./dashboard-workspace";
import { useEffect, useState } from "react";
import { AdminUiIcon } from "./admin-ui-icon";
import "./admin-employee-ui.css";
import type { Principal } from "@/modules/auth/service";
import { EmployeeManagement } from "@/components/employee-management";
import { BrandMark } from "@/components/login-preview";
import { Icon } from "@/components/ui";
import { WorkflowWorkspace } from "@/components/workflow-workspace";
import { JointLeaveWorkspace } from "@/components/joint-leave-workspace";
import { AnnualBalanceManagement } from "@/components/annual-balance-management";
import { LeaveAuthorizedOfficialManagement } from "@/components/leave-authorized-official-management";
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
  initialWorkflow,
  initialEmployeeHome = false,
}: {
  principal: Principal;
  initialEmployeeHome?: boolean;
  initialWorkflow?: {
    kind: "leave" | "permission";
    requestId?: string;
    create?: boolean;
  };
  initialAdminSurface?:
    | "pegawai"
    | "saldo"
    | "pejabat"
    | "pengajuan"
    | "klaim"
    | "dashboard";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminSurface, setAdminSurface] = useState<
    "pegawai" | "saldo" | "pejabat" | "pengajuan" | "klaim" | "dashboard"
  >(initialAdminSurface);
  const isAdmin = isAdminPrincipal(principal);
  useEffect(() => {
    if (!initialEmployeeHome || isAdmin) return;
    // Keep old /#profil and /#pengajuan bookmarks intact.
    if (window.location.hash === "#pengajuan")
      window.location.replace("/pengajuan");
    else if (window.location.hash !== "#profil")
      window.location.replace("/dashboard");
  }, [initialEmployeeHome, isAdmin]);
  const role = isAdmin ? "Admin Kepegawaian" : "Pegawai";

  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = document.querySelector<HTMLElement>(
      ".authenticated-shell .authenticated-sidebar",
    );
    const trigger = document.querySelector<HTMLElement>(
      ".authenticated-shell .shell-menu-button",
    );
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (
      sidebar?.querySelector<HTMLElement>("nav a[aria-current='page']") ??
      sidebar?.querySelector<HTMLElement>("nav a")
    )?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
      } else if (event.key === "Tab") {
        const controls = sidebar?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    const desktop = window.matchMedia("(min-width: 1025px)");
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    desktop.addEventListener("change", onDesktop);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onDesktop);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [isAdmin, adminSurface, menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  const dashboardActive = adminSurface === "dashboard";
  const claimActive = adminSurface === "klaim";
  const employeeActive =
    !dashboardActive && !claimActive && adminSurface === "pegawai";
  const balanceActive = isAdmin && adminSurface === "saldo";
  const officialActive = isAdmin && adminSurface === "pejabat";
  const workflowActive = adminSurface === "pengajuan";

  return (
    <div
      className={`authenticated-shell${isAdmin ? " admin-interface" : " employee-interface"}${dashboardActive ? " m6-shell" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>

      <aside
        className={`authenticated-sidebar ${menuOpen ? "open" : ""}`}
        aria-label="Navigasi aplikasi"
        id="application-navigation"
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
            {isAdmin ? <AdminUiIcon name="close" /> : "×"}
          </button>
        </div>

        <p className="nav-label">NAVIGASI</p>
        <nav aria-label="Navigasi utama">
          <a
            href="/dashboard"
            className={dashboardActive ? "active" : ""}
            aria-current={dashboardActive ? "page" : undefined}
          >
            <Icon name="calendar" />
            <span>
              {isAdmin ? "Dashboard & Kalender" : "Beranda & Kalender"}
            </span>
          </a>
          <a
            className={employeeActive ? "active" : ""}
            aria-current={employeeActive ? "page" : undefined}
            href={isAdmin ? "/#pegawai" : "/#profil"}
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

          {isAdmin && (
            <a
              className={officialActive ? "active" : ""}
              aria-current={officialActive ? "page" : undefined}
              href="/admin/pejabat-cuti"
              onClick={() => {
                setAdminSurface("pejabat");
                setMenuOpen(false);
              }}
            >
              <Icon name="people" />
              <span>Pejabat Cuti</span>
            </a>
          )}

          <a
            className={workflowActive ? "active" : ""}
            aria-current={workflowActive ? "page" : undefined}
            href="/pengajuan"
            onClick={() => {
              if (isAdmin) setAdminSurface("pengajuan");
              setMenuOpen(false);
            }}
          >
            <Icon name="calendar" />
            <span>Pengajuan</span>
          </a>
          <a
            className={claimActive ? "active" : ""}
            aria-current={claimActive ? "page" : undefined}
            href="/klaim-cuti-bersama"
            onClick={() => {
              setAdminSurface("klaim");
              setMenuOpen(false);
            }}
          >
            <Icon name="calendar" />
            <span>Klaim Cuti Bersama</span>
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
              aria-controls="application-navigation"
            >
              {isAdmin ? (
                <AdminUiIcon name="menu" />
              ) : (
                <span aria-hidden="true">☰</span>
              )}
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
              {isAdmin && <AdminUiIcon name="logout" />}
              Keluar
            </button>
          </div>
        </header>

        <main id="main-content" className="authenticated-content" tabIndex={-1}>
          {dashboardActive && <DashboardWorkspace admin={isAdmin} />}
          {isAdmin && adminSurface === "pegawai" && <EmployeeManagement />}
          {isAdmin && adminSurface === "saldo" && <AnnualBalanceManagement />}
          {isAdmin && adminSurface === "pejabat" && (
            <LeaveAuthorizedOfficialManagement />
          )}
          {claimActive && <JointLeaveWorkspace admin={isAdmin} />}
          {!isAdmin &&
            !claimActive &&
            !dashboardActive &&
            adminSurface !== "pengajuan" && (
              <EmployeeProfile employeeId={principal.employeeId} />
            )}
          {!dashboardActive && !claimActive && adminSurface === "pengajuan" && (
            <WorkflowWorkspace
              role={principal.role}
              initialKind={initialWorkflow?.kind}
              initialRequestId={initialWorkflow?.requestId}
              initialCreate={initialWorkflow?.create}
            />
          )}
        </main>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LoginPreview } from "@/components/login-preview";
import { PreviewSwitcher } from "@/components/preview-switcher";
import {
  AdminDashboard,
  EmployeeDashboard,
  EmployeeDataPage,
} from "@/components/surfaces";
import type { PreviewRole } from "@/lib/prototype-data";

export default function Home() {
  const [preview, setPreview] = useState<PreviewRole>("login");
  const [adminPage, setAdminPage] = useState<"dashboard" | "employees">(
    "dashboard",
  );

  const selectPreview = (next: PreviewRole) => {
    setPreview(next);
    if (next === "admin") setAdminPage("dashboard");
  };

  if (preview === "login") {
    return (
      <main className="login-page">
        <PreviewSwitcher value={preview} onChange={selectPreview} />
        <LoginPreview onPreview={selectPreview} />
      </main>
    );
  }

  return (
    <AppShell
      role={preview}
      activeItem={
        preview === "admin" && adminPage === "employees"
          ? "Data Pegawai"
          : "Dashboard"
      }
      onNavigate={(label) => {
        if (preview === "admin" && label === "Data Pegawai")
          setAdminPage("employees");
        if (label === "Dashboard") setAdminPage("dashboard");
      }}
      switcher={
        <PreviewSwitcher value={preview} onChange={selectPreview} compact />
      }
    >
      {preview === "admin" ? (
        adminPage === "employees" ? (
          <EmployeeDataPage />
        ) : (
          <AdminDashboard />
        )
      ) : (
        <EmployeeDashboard />
      )}
    </AppShell>
  );
}

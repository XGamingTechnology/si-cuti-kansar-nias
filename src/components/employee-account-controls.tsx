"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AccountStatus } from "@/application/accounts/service";
import type { ApplicationRole } from "@/application/authorization/policy";

export function EmployeeAccountControls({
  employeeId,
}: {
  employeeId: string;
}) {
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [role, setRole] = useState<ApplicationRole>("PEGAWAI");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const endpoint = `/api/admin/employees/${employeeId}/account`;

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch(
        `/api/admin/employees/${employeeId}/account`,
      );
      const data = await response.json();
      if (!active) return;
      if (response.ok) {
        setAccount(data.account);
        if (data.account) setRole(data.account.role);
      } else setMessage(data.error ?? "Status akun gagal dimuat.");
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [employeeId]);

  async function send(url: string, method: "POST" | "PATCH", body: object) {
    setMessage("");
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Operasi akun gagal.");
      return false;
    }
    setAccount(data.account);
    setRole(data.account.role);
    return true;
  }

  async function provision(event: FormEvent) {
    event.preventDefault();
    if (await send(endpoint, "POST", { role, password })) {
      setPassword("");
      setMessage("Akun berhasil dibuat.");
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (await send(`${endpoint}/password`, "PATCH", { password })) {
      setPassword("");
      setMessage("Kata sandi berhasil diatur ulang.");
    }
  }

  if (loading) return <small>Memuat Status Akun Login…</small>;
  return (
    <div className="account-controls">
      <div className="account-status">
        <span>Status Akun Login</span>
        <strong
          className={
            account ? (account.isActive ? "active" : "inactive") : "pending"
          }
        >
          {account
            ? account.isActive
              ? "Aktif"
              : "Tidak aktif"
            : "Belum memiliki akun"}
        </strong>
      </div>
      {account && <span>Username: {account.username}</span>}
      <label>
        Role akun
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as ApplicationRole)}
        >
          <option value="PEGAWAI">Pegawai</option>
          <option value="ADMIN_KEPEGAWAIAN">Admin Kepegawaian</option>
        </select>
      </label>
      {account && role !== account.role && (
        <button
          type="button"
          onClick={() => void send(endpoint, "PATCH", { role })}
        >
          Simpan role
        </button>
      )}
      <form onSubmit={account ? resetPassword : provision}>
        <label>
          {account ? "Kata sandi baru" : "Kata sandi"}
          <input
            required
            maxLength={1024}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit">
          {account ? "Reset password" : "Buat akun"}
        </button>
      </form>
      {account && (
        <button
          type="button"
          onClick={() =>
            void send(endpoint, "PATCH", { isActive: !account.isActive })
          }
        >
          {account.isActive ? "Nonaktifkan Akun Login" : "Aktifkan Akun Login"}
        </button>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}

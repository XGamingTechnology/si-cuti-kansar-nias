"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AccountStatus } from "@/application/accounts/service";
import type { ApplicationRole } from "@/application/authorization/policy";

const roleLabel = (role: ApplicationRole) =>
  role === "ADMIN_KEPEGAWAIAN" ? "Admin Kepegawaian" : "Pegawai";

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
    void fetch(endpoint).then(async (response) => {
      const data = await response.json();
      if (!active) return;
      if (response.ok) {
        setAccount(data.account);
        if (data.account) setRole(data.account.role);
      } else setMessage(data.error ?? "Status akun gagal dimuat.");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [endpoint]);

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
  async function passwordAction(event: FormEvent) {
    event.preventDefault();
    const success = account
      ? await send(`${endpoint}/password`, "PATCH", { password })
      : await send(endpoint, "POST", { role, password });
    if (success) {
      setPassword("");
      setMessage(
        account ? "Kata sandi berhasil diatur ulang." : "Akun berhasil dibuat.",
      );
    }
  }

  if (loading)
    return <div className="account-loading">Memuat informasi akun…</div>;
  return (
    <div className="account-management">
      <dl className="detail-grid account-summary">
        <div>
          <dt>Username / NIP</dt>
          <dd>{account?.username ?? "Belum tersedia"}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{account ? roleLabel(account.role) : "Belum ditentukan"}</dd>
        </div>
        <div>
          <dt>Status Akun Login</dt>
          <dd>
            <span
              className={`status-badge ${!account ? "neutral" : account.isActive ? "success" : "inactive"}`}
            >
              <i aria-hidden="true" />
              {!account
                ? "Belum memiliki akun"
                : account.isActive
                  ? "Aktif"
                  : "Tidak aktif"}
            </span>
          </dd>
        </div>
      </dl>
      <form className="account-form" onSubmit={passwordAction}>
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
            className="secondary-button align-self-end"
            type="button"
            onClick={() => void send(endpoint, "PATCH", { role })}
          >
            Simpan Role
          </button>
        )}
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
        <button className="primary-button align-self-end" type="submit">
          {account ? "Reset Kata Sandi" : "Buat Akun"}
        </button>
      </form>
      {account && (
        <div className="account-lifecycle">
          <p>Status akun login dikelola terpisah dari Status Pegawai.</p>
          <button
            className={account.isActive ? "danger-button" : "success-button"}
            type="button"
            onClick={() =>
              void send(endpoint, "PATCH", { isActive: !account.isActive })
            }
          >
            {account.isActive
              ? "Nonaktifkan Akun Login"
              : "Aktifkan Akun Login"}
          </button>
        </div>
      )}
      {message && (
        <p className="inline-feedback" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

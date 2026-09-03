"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AccountStatus } from "@/application/accounts/service";
import type { Employee } from "@/application/employees/service";
import { EmployeeAccountControls } from "@/components/employee-account-controls";

const empty = {
  nip: "",
  fullName: "",
  positionTitle: "",
  workUnit: "",
  directSupervisorId: "",
};
type FormMode = "create" | "edit" | null;

function StatusBadge({
  active,
  emptyAccount = false,
}: {
  active?: boolean;
  emptyAccount?: boolean;
}) {
  return (
    <span
      className={`status-badge ${emptyAccount ? "neutral" : active ? "success" : "inactive"}`}
    >
      <i aria-hidden="true" />
      {emptyAccount ? "Belum memiliki akun" : active ? "Aktif" : "Tidak aktif"}
    </span>
  );
}

type AccountBadgeState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; account: AccountStatus | null };

function AccountBadge({
  employeeId,
  refreshVersion,
}: {
  employeeId: string;
  refreshVersion: number;
}) {
  const [state, setState] = useState<AccountBadgeState>({
    status: "loading",
  });

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const response = await fetch(
          `/api/admin/employees/${employeeId}/account`,
        );
        if (!response.ok) {
          if (active) setState({ status: "error" });
          return;
        }
        const data = await response.json();
        if (active) setState({ status: "success", account: data.account });
      } catch {
        if (active) setState({ status: "error" });
      }
    }

    void loadAccount();
    return () => {
      active = false;
    };
  }, [employeeId, refreshVersion]);

  if (state.status === "loading")
    return <span className="status-loading">Memuat…</span>;
  if (state.status === "error")
    return <span className="status-loading">Gagal memuat</span>;
  return (
    <StatusBadge
      active={state.account?.isActive}
      emptyAccount={!state.account}
    />
  );
}

export function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(empty);
  const [mode, setMode] = useState<FormMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [accountRefreshVersions, setAccountRefreshVersions] = useState<
    Record<string, number>
  >({});
  const selected =
    employees.find((employee) => employee.id === selectedId) ?? null;

  const handleAccountChanged = useCallback((employeeId: string) => {
    setAccountRefreshVersions((versions) => ({
      ...versions,
      [employeeId]: (versions[employeeId] ?? 0) + 1,
    }));
  }, []);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/employees");
    const data = await response.json();
    if (response.ok) setEmployees(data.employees);
    else setMessage(data.error ?? "Data pegawai gagal dimuat.");
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    async function initialLoad() {
      const response = await fetch("/api/admin/employees");
      const data = await response.json();
      if (!active) return;
      if (response.ok) setEmployees(data.employees);
      else setMessage(data.error ?? "Data pegawai gagal dimuat.");
      setLoading(false);
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  function openCreate() {
    setMode("create");
    setSelectedId(null);
    setForm(empty);
    setMessage("");
  }
  function openDetail(employee: Employee) {
    setSelectedId(employee.id);
    setMode(null);
    setMessage("");
  }
  function openEdit(employee: Employee) {
    setSelectedId(employee.id);
    setMode("edit");
    setMessage("");
    setForm({
      nip: employee.nip,
      fullName: employee.fullName,
      positionTitle: employee.positionTitle,
      workUnit: employee.workUnit,
      directSupervisorId: employee.directSupervisorId ?? "",
    });
  }
  function closePanel() {
    setMode(null);
    setSelectedId(null);
    setForm(empty);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const editing = mode === "edit" && selected;
    setMessage("");
    const response = await fetch(
      editing ? `/api/admin/employees/${selected.id}` : "/api/admin/employees",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Operasi gagal.");
    setMessage(
      editing
        ? "Data pegawai berhasil diperbarui."
        : "Pegawai berhasil ditambahkan.",
    );
    closePanel();
    await load();
  }
  async function changeStatus(employee: Employee) {
    const response = await fetch(`/api/admin/employees/${employee.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !employee.isActive }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? `Pegawai berhasil ${employee.isActive ? "dinonaktifkan" : "diaktifkan"}.`
        : data.error,
    );
    if (response.ok) await load();
  }

  return (
    <section className="employee-page" id="pegawai">
      <header className="employee-page-header">
        <div>
          <p className="eyebrow">MASTER PEGAWAI</p>
          <h1>Kelola Pegawai</h1>
          <p>Kelola data pegawai dan akses akun.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate}>
          ＋ Tambah Pegawai
        </button>
      </header>
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      <div className="employee-list-surface">
        <div className="list-heading">
          <div>
            <h2>Daftar Pegawai</h2>
            <p>
              {loading
                ? "Memuat data…"
                : `${employees.length} pegawai terdaftar`}
            </p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state" aria-live="polite">
            Memuat data pegawai…
          </div>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            <strong>Belum ada data pegawai</strong>
            <span>
              Gunakan tombol Tambah Pegawai untuk membuat data pertama.
            </span>
          </div>
        ) : (
          <>
            <div className="employee-table-wrap">
              <table className="employee-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>NIP</th>
                    <th>Jabatan</th>
                    <th>Unit kerja</th>
                    <th>Status Pegawai</th>
                    <th>Status Akun Login</th>
                    <th>
                      <span className="sr-only">Tindakan</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <strong>{employee.fullName}</strong>
                      </td>
                      <td className="mono">{employee.nip}</td>
                      <td>{employee.positionTitle}</td>
                      <td>{employee.workUnit}</td>
                      <td>
                        <StatusBadge active={employee.isActive} />
                      </td>
                      <td>
                        <AccountBadge
                          employeeId={employee.id}
                          refreshVersion={
                            accountRefreshVersions[employee.id] ?? 0
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="detail-button"
                          type="button"
                          onClick={() => openDetail(employee)}
                        >
                          Lihat Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="employee-mobile-list">
              {employees.map((employee) => (
                <article key={employee.id}>
                  <div className="mobile-employee-title">
                    <strong>{employee.fullName}</strong>
                    <span>{employee.nip}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Status Pegawai</dt>
                      <dd>
                        <StatusBadge active={employee.isActive} />
                      </dd>
                    </div>
                    <div>
                      <dt>Status Akun Login</dt>
                      <dd>
                        <AccountBadge
                          employeeId={employee.id}
                          refreshVersion={
                            accountRefreshVersions[employee.id] ?? 0
                          }
                        />
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {employee.positionTitle} <span>·</span> {employee.workUnit}
                  </p>
                  <button
                    className="detail-button"
                    type="button"
                    onClick={() => openDetail(employee)}
                  >
                    Lihat Detail
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      {(mode || selected) && (
        <>
          <button
            className="panel-scrim"
            type="button"
            aria-label="Tutup panel"
            onClick={closePanel}
          />
          <aside
            className="management-panel"
            aria-label={
              mode === "create"
                ? "Tambah Pegawai"
                : (selected?.fullName ?? "Detail Pegawai")
            }
          >
            <header>
              <div>
                <p className="eyebrow">
                  {mode === "create" ? "DATA BARU" : "MASTER PEGAWAI"}
                </p>
                <h2>
                  {mode === "create"
                    ? "Tambah Pegawai"
                    : mode === "edit"
                      ? "Edit Pegawai"
                      : selected?.fullName}
                </h2>
              </div>
              <button
                className="panel-close"
                type="button"
                onClick={closePanel}
                aria-label="Tutup panel"
              >
                ×
              </button>
            </header>
            {mode ? (
              <EmployeeForm
                form={form}
                setForm={setForm}
                employees={employees}
                editingId={selected?.id}
                mode={mode}
                submit={submit}
                cancel={() =>
                  mode === "edit" && selected ? setMode(null) : closePanel()
                }
              />
            ) : (
              selected && (
                <EmployeeDetail
                  employee={selected}
                  employees={employees}
                  onEdit={() => openEdit(selected)}
                  onStatus={() => void changeStatus(selected)}
                  onAccountChanged={handleAccountChanged}
                />
              )
            )}
          </aside>
        </>
      )}
    </section>
  );
}

function EmployeeForm({
  form,
  setForm,
  employees,
  editingId,
  mode,
  submit,
  cancel,
}: {
  form: typeof empty;
  setForm: (value: typeof empty) => void;
  employees: Employee[];
  editingId?: string;
  mode: Exclude<FormMode, null>;
  submit: (event: FormEvent) => void;
  cancel: () => void;
}) {
  return (
    <form className="management-form" onSubmit={submit}>
      <p className="panel-description">
        Lengkapi data utama pegawai. Semua kolom bertanda wajib harus diisi.
      </p>
      <div className="form-field-grid">
        {(
          [
            ["nip", "NIP"],
            ["fullName", "Nama lengkap"],
            ["positionTitle", "Jabatan"],
            ["workUnit", "Unit kerja"],
          ] as const
        ).map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              required
              maxLength={name === "nip" ? 32 : 200}
              value={form[name]}
              onChange={(event) =>
                setForm({ ...form, [name]: event.target.value })
              }
            />
          </label>
        ))}
      </div>
      <label>
        Atasan langsung <span className="optional">(opsional)</span>
        <select
          value={form.directSupervisorId}
          onChange={(event) =>
            setForm({ ...form, directSupervisorId: event.target.value })
          }
        >
          <option value="">Tidak ada</option>
          {employees
            .filter((employee) => employee.id !== editingId)
            .map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} — {employee.nip}
              </option>
            ))}
        </select>
      </label>
      <div className="panel-actions">
        <button className="secondary-button" type="button" onClick={cancel}>
          Batal
        </button>
        <button className="primary-button" type="submit">
          {mode === "edit" ? "Simpan Perubahan" : "Tambah Pegawai"}
        </button>
      </div>
    </form>
  );
}

function EmployeeDetail({
  employee,
  employees,
  onEdit,
  onStatus,
  onAccountChanged,
}: {
  employee: Employee;
  employees: Employee[];
  onEdit: () => void;
  onStatus: () => void;
  onAccountChanged: (employeeId: string) => void;
}) {
  const supervisor = employees.find(
    (item) => item.id === employee.directSupervisorId,
  );
  return (
    <div className="employee-detail">
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">DATA PEGAWAI</p>
            <h3>Informasi kepegawaian</h3>
          </div>
          <StatusBadge active={employee.isActive} />
        </div>
        <dl className="detail-grid">
          <div>
            <dt>NIP</dt>
            <dd>{employee.nip}</dd>
          </div>
          <div>
            <dt>Nama</dt>
            <dd>{employee.fullName}</dd>
          </div>
          <div>
            <dt>Jabatan</dt>
            <dd>{employee.positionTitle}</dd>
          </div>
          <div>
            <dt>Unit kerja</dt>
            <dd>{employee.workUnit}</dd>
          </div>
          <div>
            <dt>Atasan langsung</dt>
            <dd>{supervisor?.fullName ?? "Tidak ada"}</dd>
          </div>
          <div>
            <dt>Status Pegawai</dt>
            <dd>{employee.isActive ? "Aktif" : "Tidak aktif"}</dd>
          </div>
        </dl>
        <div className="detail-actions">
          <button className="secondary-button" type="button" onClick={onEdit}>
            Edit Pegawai
          </button>
          <button
            className={employee.isActive ? "danger-button" : "success-button"}
            type="button"
            onClick={onStatus}
          >
            {employee.isActive ? "Nonaktifkan Pegawai" : "Aktifkan Pegawai"}
          </button>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">AKUN LOGIN</p>
            <h3>Akses aplikasi</h3>
          </div>
        </div>
        <EmployeeAccountControls
          employeeId={employee.id}
          onAccountChanged={() => onAccountChanged(employee.id)}
        />
      </section>
    </div>
  );
}

"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Employee } from "@/application/employees/service";

const empty = {
  nip: "",
  fullName: "",
  positionTitle: "",
  workUnit: "",
  directSupervisorId: "",
};
export function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/employees");
    const data = await response.json();
    if (response.ok) setEmployees(data.employees);
    else setMessage(data.error);
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    async function initialLoad() {
      const response = await fetch("/api/admin/employees");
      const data = await response.json();
      if (!active) return;
      if (response.ok) setEmployees(data.employees);
      else setMessage(data.error);
      setLoading(false);
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, []);
  function edit(employee: Employee) {
    setEditing(employee.id);
    setForm({
      nip: employee.nip,
      fullName: employee.fullName,
      positionTitle: employee.positionTitle,
      workUnit: employee.workUnit,
      directSupervisorId: employee.directSupervisorId ?? "",
    });
    setMessage("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(
      editing ? `/api/admin/employees/${editing}` : "/api/admin/employees",
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
    setEditing(null);
    setForm(empty);
    await load();
  }
  async function status(employee: Employee) {
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
    <section className="employee-admin">
      <header>
        <div>
          <p className="eyebrow">MASTER PEGAWAI</p>
          <h2>Kelola Pegawai</h2>
          <p>
            Tambah, perbarui, dan atur status pegawai tanpa menghapus riwayat.
          </p>
        </div>
      </header>
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      <div className="employee-grid">
        <form className="employee-form" onSubmit={submit}>
          <h3>{editing ? "Edit Pegawai" : "Tambah Pegawai"}</h3>
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
                onChange={(e) => setForm({ ...form, [name]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Atasan langsung (opsional)
            <select
              value={form.directSupervisorId}
              onChange={(e) =>
                setForm({ ...form, directSupervisorId: e.target.value })
              }
            >
              <option value="">Tidak ada</option>
              {employees
                .filter((e) => e.id !== editing)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName} — {e.nip}
                  </option>
                ))}
            </select>
          </label>
          <div className="form-actions">
            <button className="primary-button" type="submit">
              {editing ? "Simpan perubahan" : "Tambah pegawai"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(empty);
                }}
              >
                Batal
              </button>
            )}
          </div>
        </form>
        <div className="employee-list">
          <h3>Daftar Pegawai</h3>
          {loading ? (
            <p>Memuat data pegawai…</p>
          ) : employees.length === 0 ? (
            <p>Belum ada data pegawai.</p>
          ) : (
            employees.map((employee) => (
              <article key={employee.id}>
                <div>
                  <strong>{employee.fullName}</strong>
                  <span>
                    {employee.nip} · {employee.positionTitle} ·{" "}
                    {employee.workUnit}
                  </span>
                  <small className={employee.isActive ? "active" : "inactive"}>
                    {employee.isActive ? "Aktif" : "Tidak aktif"}
                  </small>
                </div>
                <div>
                  <button onClick={() => edit(employee)}>Detail / Edit</button>
                  <button onClick={() => void status(employee)}>
                    {employee.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

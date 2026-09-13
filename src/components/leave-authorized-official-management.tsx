"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  authorizedOfficialStatus,
  authorizedOfficialTitle,
  type LeaveAuthorizedOfficialAssignment,
  type LeaveAuthorizedOfficialCapacity,
} from "@/application/leave-authorized-official/service";

const empty = {
  fullName: "",
  nip: "",
  capacity: "DEFINITIVE" as LeaveAuthorizedOfficialCapacity,
  effectiveFrom: "",
  effectiveTo: "",
  sourceReference: "",
  notes: "",
};
const statusLabels = {
  AKTIF: "Aktif",
  AKAN_DATANG: "Akan Datang",
  BERAKHIR: "Berakhir",
};
const capacityLabels = { DEFINITIVE: "Definitif", PLT: "Plt.", PLH: "Plh." };
function displayDate(value: string | null) {
  if (!value) return "seterusnya";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function LeaveAuthorizedOfficialManagement() {
  const [items, setItems] = useState<LeaveAuthorizedOfficialAssignment[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/leave-authorized-officials");
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Data pejabat cuti gagal dimuat.");
      setItems(data.assignments);
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Data pejabat cuti gagal dimuat.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/leave-authorized-officials${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Data pejabat gagal disimpan.");
      setForm(empty);
      setEditingId(null);
      setMessage("Data pejabat cuti berhasil disimpan.");
      await load();
    } catch (cause) {
      setError(true);
      setMessage(
        cause instanceof Error ? cause.message : "Data pejabat gagal disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(item: LeaveAuthorizedOfficialAssignment) {
    setEditingId(item.id);
    setForm({
      fullName: item.fullName,
      nip: item.nip,
      capacity: item.capacity,
      effectiveFrom: item.effectiveFrom,
      effectiveTo: item.effectiveTo ?? "",
      sourceReference: item.sourceReference ?? "",
      notes: item.notes ?? "",
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const hasActive = items.some(
    (item) => authorizedOfficialStatus(item) === "AKTIF",
  );
  return (
    <section className="employee-page official-page" id="pejabat-cuti">
      <header className="employee-page-header">
        <div>
          <p className="eyebrow">MASTER PEJABAT CUTI</p>
          <h1>Pejabat yang Berwenang Memberikan Cuti</h1>
          <p>Kelola riwayat pejabat berdasarkan periode berlaku.</p>
        </div>
      </header>
      {!loading && !hasActive && (
        <p className="official-warning" role="status">
          Belum ada pejabat cuti aktif yang dikonfigurasi untuk hari ini.
        </p>
      )}
      {message && (
        <p
          className={`feedback ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <div className="official-grid">
        <form className="employee-form official-form" onSubmit={submit}>
          <h2>{editingId ? "Ubah Pejabat Cuti" : "Tambah Pejabat Cuti"}</h2>
          <label>
            Nama lengkap
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
              maxLength={200}
            />
          </label>
          <label>
            NIP
            <input
              value={form.nip}
              onChange={(e) => setForm({ ...form, nip: e.target.value })}
              required
              maxLength={32}
            />
          </label>
          <label>
            Kapasitas
            <select
              value={form.capacity}
              onChange={(e) =>
                setForm({
                  ...form,
                  capacity: e.target.value as LeaveAuthorizedOfficialCapacity,
                })
              }
            >
              <option value="DEFINITIVE">Definitif</option>
              <option value="PLT">Plt.</option>
              <option value="PLH">Plh.</option>
            </select>
          </label>
          <p className="official-title-preview">
            Jabatan: {authorizedOfficialTitle(form.capacity)}
          </p>
          <label>
            Tanggal mulai berlaku
            <input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) =>
                setForm({ ...form, effectiveFrom: e.target.value })
              }
              required
            />
          </label>
          <label>
            Tanggal selesai berlaku (opsional)
            <input
              type="date"
              value={form.effectiveTo}
              onChange={(e) =>
                setForm({ ...form, effectiveTo: e.target.value })
              }
            />
          </label>
          <label>
            Dasar/Referensi SK atau delegasi (opsional)
            <input
              value={form.sourceReference}
              onChange={(e) =>
                setForm({ ...form, sourceReference: e.target.value })
              }
              maxLength={500}
            />
          </label>
          <label>
            Catatan (opsional)
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={busy}>
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(empty);
                }}
              >
                Batal
              </button>
            )}
          </div>
        </form>
        <div className="official-list" aria-live="polite">
          <h2>Riwayat Penugasan</h2>
          {loading ? (
            <p>Memuat data pejabat…</p>
          ) : items.length === 0 ? (
            <p className="empty-state">Belum ada data pejabat cuti.</p>
          ) : (
            items.map((item) => {
              const status = authorizedOfficialStatus(item);
              return (
                <article key={item.id}>
                  <div className="official-card-heading">
                    <div>
                      <strong>{item.fullName}</strong>
                      <span>NIP {item.nip}</span>
                    </div>
                    <span className={`status-badge ${status.toLowerCase()}`}>
                      {statusLabels[status]}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Kapasitas</dt>
                      <dd>{capacityLabels[item.capacity]}</dd>
                    </div>
                    <div>
                      <dt>Periode berlaku</dt>
                      <dd>
                        {displayDate(item.effectiveFrom)} –{" "}
                        {displayDate(item.effectiveTo)}
                      </dd>
                    </div>
                    <div>
                      <dt>Dasar/Referensi</dt>
                      <dd>{item.sourceReference ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Catatan</dt>
                      <dd>{item.notes ?? "-"}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => edit(item)}
                  >
                    Ubah
                  </button>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

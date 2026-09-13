"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  authorizedOfficialStatus,
  type LeaveAuthorizedOfficialAssignment,
  type LeaveAuthorizedOfficialCapacity,
} from "@/application/leave-authorized-official/service";
import { toBusinessDate } from "@/domain/business-date";

const emptyForm = {
  fullName: "",
  nip: "",
  capacity: "DEFINITIVE" as LeaveAuthorizedOfficialCapacity,
  effectiveFrom: "",
  effectiveTo: "",
  sourceReference: "",
  notes: "",
};

export function LeaveAuthorizedOfficialManagement() {
  const [items, setItems] = useState<readonly LeaveAuthorizedOfficialAssignment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<LeaveAuthorizedOfficialAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function applyResponse(response: Response) {
    return response.json().then((data) => {
      if (!response.ok) throw new Error(data.error ?? "Data pejabat cuti gagal dimuat.");
      setItems(data.assignments);
    });
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/leave-authorized-officials")
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!active) return;
        if (!response.ok) throw new Error(data.error ?? "Data pejabat cuti gagal dimuat.");
        setItems(data.assignments);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "Data pejabat cuti gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    setLoading(true);
    try {
      await fetch("/api/admin/leave-authorized-officials").then(applyResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data pejabat cuti gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }

  function beginEdit(item: LeaveAuthorizedOfficialAssignment) {
    setEditing(item);
    setForm({ ...item, effectiveTo: item.effectiveTo ?? "", sourceReference: item.sourceReference ?? "", notes: item.notes ?? "" });
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        editing ? `/api/admin/leave-authorized-officials/${editing.id}` : "/api/admin/leave-authorized-officials",
        {
          method: editing ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...form, effectiveTo: form.effectiveTo || null, sourceReference: form.sourceReference || null, notes: form.notes || null }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Data pejabat cuti gagal disimpan.");
      setForm(emptyForm);
      setEditing(null);
      setMessage("Penugasan pejabat cuti berhasil disimpan.");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data pejabat cuti gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  const today = toBusinessDate(new Date());
  const locked = editing !== null && editing.effectiveFrom <= today;
  const ended = editing?.effectiveTo !== null && editing?.effectiveTo !== undefined && editing.effectiveTo < today;

  return (
    <section className="employee-page" id="pejabat-cuti">
      <header className="employee-page-header">
        <div><p className="eyebrow">MASTER KEPEGAWAIAN</p><h1>Pejabat Cuti</h1><p>Kelola periode pejabat yang berwenang memberikan cuti.</p></div>
      </header>
      {message && <p className="feedback" role="status">{message}</p>}
      <form className="employee-form" onSubmit={save}>
        <h2>{editing ? "Ubah Penugasan" : "Tambah Penugasan"}</h2>
        {locked && <p>Identitas pejabat yang sudah aktif bersifat historis. Buat penugasan baru untuk pejabat pengganti.</p>}
        <label>Nama lengkap<input required maxLength={200} disabled={locked} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
        <label>NIP<input required maxLength={32} disabled={locked} value={form.nip} onChange={(e) => setForm({ ...form, nip: e.target.value })} /></label>
        <label>Kapasitas<select disabled={locked} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value as LeaveAuthorizedOfficialCapacity })}><option value="DEFINITIVE">Definitif</option><option value="PLT">Plt.</option><option value="PLH">Plh.</option></select></label>
        <label>Mulai berlaku<input required type="date" disabled={locked} value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></label>
        <label>Akhir berlaku<input type="date" disabled={Boolean(ended)} min={locked ? today : form.effectiveFrom} value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></label>
        <label>Referensi sumber<input maxLength={500} value={form.sourceReference} onChange={(e) => setForm({ ...form, sourceReference: e.target.value })} /></label>
        <label>Catatan<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button className="primary-button" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
        {editing && <button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}>Batal</button>}
      </form>
      {loading ? <p role="status">Memuat data pejabat cuti…</p> : items.length === 0 ? <p>Belum ada penugasan pejabat cuti.</p> : (
        <div className="employee-table-wrap"><table className="employee-table"><thead><tr><th>Nama / NIP</th><th>Kapasitas</th><th>Periode</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong><br />{item.nip}</td><td>{item.capacity}</td><td>{item.effectiveFrom} — {item.effectiveTo ?? "seterusnya"}</td><td>{authorizedOfficialStatus(item)}</td><td><button type="button" onClick={() => beginEdit(item)}>Ubah</button></td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}

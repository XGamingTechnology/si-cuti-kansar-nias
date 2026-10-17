"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AdminFloatingWindow } from "./admin-floating-window";
import {
  officialIdentity,
  correctionFields,
  type OfficialCorrection,
  type OfficialIdentity,
} from "@/application/leave-authorized-official/correction";
import {
  authorizedOfficialStatus,
  type LeaveAuthorizedOfficialAssignment,
} from "@/application/leave-authorized-official/service";

const labels = {
  fullName: "Nama lengkap",
  nip: "NIP",
  capacity: "Kapasitas",
  effectiveFrom: "Mulai berlaku",
  effectiveTo: "Akhir berlaku",
};
export function OfficialEmergencyCorrection({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: LeaveAuthorizedOfficialAssignment;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [current, setCurrent] = useState(assignment);
  const [form, setForm] = useState<OfficialIdentity>(
    officialIdentity(assignment),
  );
  const [history, setHistory] = useState<OfficialCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [key, setKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const endpoint = `/api/admin/leave-authorized-officials/${assignment.id}/corrections`;
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        if (!response.ok)
          throw new Error(data.error ?? "Riwayat gagal dimuat.");
        setCurrent(data.assignment);
        setForm(officialIdentity(data.assignment));
        setHistory(data.corrections);
      } catch (error) {
        if (active) {
          setFailed(true);
          setMessage(
            error instanceof Error ? error.message : "Riwayat gagal dimuat.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [endpoint]);
  async function refresh() {
    setLoading(true);
    setKey("");
    setConfirmed(false);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Riwayat gagal dimuat.");
      setCurrent(data.assignment);
      setForm(officialIdentity(data.assignment));
      setHistory(data.corrections);
      setFailed(false);
      setConflict(false);
      setMessage("Data terbaru dimuat. Periksa kembali perubahan Anda.");
    } catch {
      setFailed(true);
      setMessage("Data gagal dimuat ulang. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }
  const changed = correctionFields.filter(
    (field) => current[field] !== form[field],
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!key || !confirmed || conflict || failed) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: current.revision,
          idempotencyKey: key,
          changes: Object.fromEntries(
            changed.map((field) => [field, form[field]]),
          ),
          reason,
          sourceReference: reference,
          confirmed,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(data.error ?? "Koreksi gagal disimpan.");
      }
      await refresh();
      setReason("");
      setReference("");
      setMessage(
        "Koreksi darurat tersimpan. Arsip dan dokumen lama tetap dipertahankan.",
      );
      await onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Koneksi terputus. Coba simpan kembali dengan kunci retry yang sama.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFloatingWindow
      title="Koreksi Darurat dan Riwayat"
      onClose={onClose}
      busy={busy}
    >
      <div className="official-correction-content">
        <p>
          Koreksi master tidak mengubah snapshot pengajuan atau arsip/PDF lama.
          Penerbitan ulang dokumen tidak tersedia melalui aksi ini.
        </p>
        {message && (
          <p
            className="feedback"
            role={failed || conflict ? "alert" : "status"}
          >
            {message}
          </p>
        )}
        {loading ? (
          <p role="status">Memuat penugasan dan riwayat…</p>
        ) : (
          <>
            {(failed || conflict) && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void refresh()}
              >
                Muat ulang penugasan
              </button>
            )}
            {!failed && authorizedOfficialStatus(current) !== "Akan Datang" && (
              <form onSubmit={save}>
                <fieldset disabled={busy || conflict} className="employee-form">
                  <legend>Koreksi identitas atau periode</legend>
                  {correctionFields.map((field) => (
                    <label key={field}>
                      {labels[field]}
                      {field === "capacity" ? (
                        <select
                          value={form.capacity}
                          disabled={Boolean(key)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              capacity: e.target
                                .value as OfficialIdentity["capacity"],
                            })
                          }
                        >
                          <option value="DEFINITIVE">Definitif</option>
                          <option value="PLT">Plt.</option>
                          <option value="PLH">Plh.</option>
                        </select>
                      ) : (
                        <input
                          required={field !== "effectiveTo"}
                          disabled={Boolean(key)}
                          type={field.startsWith("effective") ? "date" : "text"}
                          maxLength={
                            field === "fullName"
                              ? 200
                              : field === "nip"
                                ? 32
                                : undefined
                          }
                          value={form[field] ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              [field]:
                                field === "effectiveTo"
                                  ? e.target.value || null
                                  : e.target.value,
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
                  <label>
                    Alasan koreksi
                    <textarea
                      required
                      maxLength={1000}
                      disabled={Boolean(key)}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <label>
                    Referensi dokumen/SK/surat
                    <input
                      required
                      maxLength={500}
                      disabled={Boolean(key)}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                </fieldset>
                {!key ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      busy ||
                      conflict ||
                      !changed.length ||
                      !reason.trim() ||
                      !reference.trim()
                    }
                    onClick={() => {
                      setKey(crypto.randomUUID());
                      setConfirmed(false);
                    }}
                  >
                    Tinjau perubahan
                  </button>
                ) : (
                  <section aria-label="Ringkasan koreksi">
                    <h3>Periksa sebelum menyimpan</h3>
                    <dl>
                      {changed.map((field) => (
                        <div key={field}>
                          <dt>{labels[field]}</dt>
                          <dd>
                            {current[field] || "—"} → {form[field] || "—"}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p>Alasan: {reason}</p>
                    <p>Referensi: {reference}</p>
                    <label>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={busy || conflict}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />{" "}
                      Saya mengonfirmasi koreksi ini berdasarkan dokumen yang
                      sah dan memahami arsip lama tidak berubah.
                    </label>
                    <div className="floating-form-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setKey("");
                          setConfirmed(false);
                        }}
                      >
                        Kembali ke formulir
                      </button>
                      <button
                        className="primary-button"
                        disabled={busy || conflict || !confirmed}
                      >
                        {busy ? "Menyimpan…" : "Simpan Koreksi Darurat"}
                      </button>
                    </div>
                  </section>
                )}
              </form>
            )}
            {!failed && (
              <section aria-label="Riwayat koreksi">
                <h3>Riwayat koreksi</h3>
                {history.length === 0 ? (
                  <p>Belum ada koreksi darurat.</p>
                ) : (
                  history.map((entry) => (
                    <article key={entry.id}>
                      <h4>
                        Revisi {entry.revision} ·{" "}
                        {new Date(entry.correctedAt).toLocaleString("id-ID")}
                      </h4>
                      <p>Admin (ID pengguna): {entry.actorUserId}</p>
                      <p>
                        {entry.reason} · Referensi: {entry.sourceReference}
                      </p>
                      <dl>
                        {entry.fields.map((field) => (
                          <div key={field}>
                            <dt>{labels[field as keyof typeof labels]}</dt>
                            <dd>
                              {entry.before[field as keyof OfficialIdentity] ||
                                "—"}{" "}
                              →{" "}
                              {entry.after[field as keyof OfficialIdentity] ||
                                "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AdminFloatingWindow>
  );
}

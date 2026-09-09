"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LeaveType, WorkflowStatus } from "@/application/workflow/types";

type Kind = "leave" | "permission";
type RequestRecord = {
  id: string;
  employeeId: string;
  status: WorkflowStatus;
  currentRevisionNumber: number;
  currentRevision: {
    leaveType?: LeaveType;
    permissionTypeId?: string;
    startDate: string;
    endDate: string;
    reason: string;
    calculatedWorkingDays?: number | null;
  };
};
type PermissionType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};
type Detail = {
  revisions: Array<
    RequestRecord["currentRevision"] & { revisionNumber: number }
  >;
  history: Array<{
    id: string;
    fromStatus: WorkflowStatus;
    toStatus: WorkflowStatus;
    occurredAt: string;
    reason: string | null;
    evidenceReference: string | null;
  }>;
};

const labels: Record<WorkflowStatus, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Diajukan",
  RETURNED_FOR_CORRECTION: "Dikembalikan untuk perbaikan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};
const leaveTypes: Array<[LeaveType, string]> = [
  ["ANNUAL", "Cuti Tahunan"],
  ["SICK", "Cuti Sakit"],
  ["IMPORTANT_REASON", "Cuti Alasan Penting"],
  ["LARGE", "Cuti Besar"],
  ["MATERNITY", "Cuti Melahirkan"],
  ["CLTN", "CLTN"],
];

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Operasi gagal.");
  return data;
}

export function WorkflowWorkspace({
  role,
}: {
  role: "ADMIN_KEPEGAWAIAN" | "PEGAWAI";
}) {
  const [kind, setKind] = useState<Kind>("leave");
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [types, setTypes] = useState<PermissionType[]>([]);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [message, setMessage] = useState("Memuat pengajuan…");

  const load = useCallback(async () => {
    try {
      const [{ requests: values }, typeData] = await Promise.all([
        api(`/api/workflow/${kind}`),
        api("/api/workflow/permission-types"),
      ]);
      setRequests(values);
      setTypes(typeData.permissionTypes);
      setMessage(values.length ? "" : "Belum ada pengajuan.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal memuat pengajuan.",
      );
    }
  }, [kind]);
  useEffect(() => {
    // Fetching is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function open(item: RequestRecord) {
    setSelected(item);
    setDetail(null);
    try {
      const [revisionData, historyData] = await Promise.all([
        api(`/api/workflow/${kind}/${item.id}/revisions`),
        api(`/api/workflow/${kind}/${item.id}/history`),
      ]);
      setDetail({
        revisions: revisionData.revisions,
        history: historyData.history,
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal memuat detail.",
      );
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/workflow/${kind}${selected ? `/${selected.id}` : ""}`, {
        method: selected ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      setSelected(null);
      setMessage("Pengajuan tersimpan.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan.");
    }
  }

  async function act(action: string) {
    if (!selected) return;
    let reason;
    let evidenceReference;
    if (action === "RETURN" || action === "REJECT")
      reason = window.prompt(
        action === "RETURN"
          ? "Alasan pengembalian (wajib)"
          : "Alasan penolakan (wajib)",
      );
    if (action === "APPROVE")
      evidenceReference = window.prompt(
        "Referensi bukti yang sudah diverifikasi (wajib)",
      );
    if (
      ((action === "RETURN" || action === "REJECT") && reason === null) ||
      (action === "APPROVE" && evidenceReference === null)
    )
      return;
    try {
      await api(`/api/workflow/${kind}/${selected.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, reason, evidenceReference }),
      });
      setSelected(null);
      setDetail(null);
      setMessage("Status pengajuan diperbarui.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tindakan gagal.");
    }
  }

  const editable =
    role === "PEGAWAI" &&
    (!selected ||
      ["DRAFT", "RETURNED_FOR_CORRECTION"].includes(selected.status));
  return (
    <section className="workflow-surface" id="pengajuan">
      <div className="workflow-heading">
        <div>
          <p className="eyebrow">ALUR PENGAJUAN</p>
          <h2>Cuti dan Izin</h2>
        </div>
        <div className="workflow-tabs">
          <button
            className={kind === "leave" ? "active" : ""}
            onClick={() => {
              setKind("leave");
              setSelected(null);
            }}
          >
            Cuti
          </button>
          <button
            className={kind === "permission" ? "active" : ""}
            onClick={() => {
              setKind("permission");
              setSelected(null);
            }}
          >
            Izin
          </button>
        </div>
      </div>
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      <div className="workflow-grid">
        <div className="request-list">
          {role === "PEGAWAI" && (
            <button
              className="primary-button"
              onClick={() => {
                setSelected(null);
                setDetail(null);
              }}
            >
              Buat pengajuan
            </button>
          )}
          {requests.map((item) => (
            <button
              className={`request-card ${selected?.id === item.id ? "selected" : ""}`}
              key={item.id}
              onClick={() => void open(item)}
            >
              <strong>
                {kind === "leave"
                  ? leaveTypes.find(
                      ([id]) => id === item.currentRevision.leaveType,
                    )?.[1]
                  : (types.find(
                      (type) =>
                        type.id === item.currentRevision.permissionTypeId,
                    )?.name ?? "Izin")}
              </strong>
              <span
                className={`workflow-status status-${item.status.toLowerCase()}`}
              >
                {labels[item.status]}
              </span>
              <small>
                {item.currentRevision.startDate} –{" "}
                {item.currentRevision.endDate}
              </small>
            </button>
          ))}
        </div>
        <div className="request-detail">
          {editable && (
            <form className="workflow-form" onSubmit={save}>
              <h3>
                {selected
                  ? "Edit revisi aktif"
                  : `Pengajuan ${kind === "leave" ? "cuti" : "izin"} baru`}
              </h3>
              <label>
                Jenis {kind === "leave" ? "cuti" : "izin"}
                <select
                  name={kind === "leave" ? "leaveType" : "permissionTypeId"}
                  defaultValue={
                    kind === "leave"
                      ? selected?.currentRevision.leaveType
                      : selected?.currentRevision.permissionTypeId
                  }
                  required
                >
                  {kind === "leave"
                    ? leaveTypes.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))
                    : types.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                </select>
              </label>
              <label>
                Tanggal mulai
                <input
                  type="date"
                  name="startDate"
                  defaultValue={selected?.currentRevision.startDate}
                  required
                />
              </label>
              <label>
                Tanggal selesai
                <input
                  type="date"
                  name="endDate"
                  defaultValue={selected?.currentRevision.endDate}
                  required
                />
              </label>
              <label>
                Alasan
                <textarea
                  name="reason"
                  defaultValue={selected?.currentRevision.reason}
                  required
                />
              </label>
              <button className="primary-button">Simpan draf</button>
            </form>
          )}
          {selected && (
            <>
              <div className="detail-summary">
                <h3>Detail pengajuan</h3>
                <p>
                  <strong>Status:</strong> {labels[selected.status]}
                </p>
                <p>
                  <strong>Alasan:</strong> {selected.currentRevision.reason}
                </p>
                {selected.currentRevision.leaveType === "ANNUAL" && (
                  <p>
                    <strong>Hari kerja (hasil server):</strong>{" "}
                    {selected.currentRevision.calculatedWorkingDays ??
                      "Dihitung saat diajukan"}
                  </p>
                )}
              </div>
              <div className="form-actions">
                {role === "PEGAWAI" &&
                  ["DRAFT", "RETURNED_FOR_CORRECTION"].includes(
                    selected.status,
                  ) && (
                    <button onClick={() => void act("SUBMIT")}>Ajukan</button>
                  )}
                {role === "PEGAWAI" &&
                  ["DRAFT", "SUBMITTED", "RETURNED_FOR_CORRECTION"].includes(
                    selected.status,
                  ) && (
                    <button onClick={() => void act("CANCEL")}>Batalkan</button>
                  )}
                {role === "ADMIN_KEPEGAWAIAN" &&
                  selected.status === "SUBMITTED" && (
                    <>
                      <button onClick={() => void act("RETURN")}>
                        Kembalikan
                      </button>
                      <button onClick={() => void act("REJECT")}>Tolak</button>
                      <button
                        className="primary-button"
                        onClick={() => void act("APPROVE")}
                      >
                        Catat disetujui
                      </button>
                    </>
                  )}
              </div>
              <h3>Riwayat revisi</h3>
              {!detail && <p>Memuat riwayat…</p>}
              {detail?.revisions.map((revision) => (
                <article className="history-row" key={revision.revisionNumber}>
                  <strong>Revisi {revision.revisionNumber}</strong>
                  <span>
                    {revision.startDate} – {revision.endDate}
                  </span>
                  <p>{revision.reason}</p>
                </article>
              ))}
              <h3>Riwayat status</h3>
              {detail?.history.length === 0 && (
                <p>Belum ada perubahan status.</p>
              )}
              {detail?.history.map((item) => (
                <article className="history-row" key={item.id}>
                  <strong>
                    {labels[item.fromStatus]} → {labels[item.toStatus]}
                  </strong>
                  <small>
                    {new Date(item.occurredAt).toLocaleString("id-ID")}
                  </small>
                  {item.reason && (
                    <p>
                      <strong>Alasan:</strong> {item.reason}
                    </p>
                  )}
                  {item.evidenceReference && (
                    <p>
                      <strong>Referensi bukti:</strong> {item.evidenceReference}
                    </p>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

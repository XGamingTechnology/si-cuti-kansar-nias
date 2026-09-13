"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LeaveType, WorkflowStatus } from "@/application/workflow/types";

type Kind = "leave" | "permission";
type ReviewAction = "RETURN" | "REJECT" | "APPROVE";
type WorkflowAction = "SUBMIT" | "CANCEL" | ReviewAction;

type RequestRecord = {
  id: string;
  employeeId: string;
  employee: {
    id: string;
    nip: string;
    fullName: string;
    positionTitle: string;
    workUnit: string;
    employmentStartDate: string | null;
    directSupervisor: {
      nip: string;
      fullName: string;
      positionTitle: string;
    } | null;
  };
  status: WorkflowStatus;
  currentRevisionNumber: number;
  currentRevision: {
    leaveType?: LeaveType;
    permissionTypeId?: string;
    startDate: string;
    endDate: string;
    reason: string;
    calculatedWorkingDays?: number | null;
    submittedAt?: string | null;
    formPlace?: string | null;
    leaveAddress?: string | null;
    leavePhone?: string | null;
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

const reviewCopy: Record<
  ReviewAction,
  {
    eyebrow: string;
    title: string;
    description: string;
    fieldLabel: string;
    placeholder: string;
    confirmLabel: string;
    tone: "neutral" | "danger" | "success";
  }
> = {
  RETURN: {
    eyebrow: "KEMBALIKAN PENGAJUAN",
    title: "Minta pegawai melakukan perbaikan",
    description:
      "Tuliskan alasan yang jelas agar pegawai mengetahui bagian yang perlu diperbaiki.",
    fieldLabel: "Alasan pengembalian",
    placeholder:
      "Contoh: Mohon perbaiki periode cuti dan lengkapi keterangannya.",
    confirmLabel: "Kembalikan untuk Perbaikan",
    tone: "neutral",
  },
  REJECT: {
    eyebrow: "TOLAK PENGAJUAN",
    title: "Tolak pengajuan ini",
    description:
      "Alasan penolakan akan tercatat pada riwayat status pengajuan.",
    fieldLabel: "Alasan penolakan",
    placeholder: "Tuliskan alasan penolakan secara singkat dan jelas.",
    confirmLabel: "Tolak Pengajuan",
    tone: "danger",
  },
  APPROVE: {
    eyebrow: "SETUJUI PENGAJUAN",
    title: "Setujui pengajuan ini",
    description:
      "Pastikan data pegawai, periode, saldo, dan dasar administrasi telah diperiksa.",
    fieldLabel: "Referensi administrasi",
    placeholder:
      "Contoh: Persetujuan Kepala Kantor / arsip administrasi terkait",
    confirmLabel: "Setujui Pengajuan",
    tone: "success",
  },
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Operasi gagal.");
  return data;
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusGuidance(
  status: WorkflowStatus,
  role: "ADMIN_KEPEGAWAIAN" | "PEGAWAI",
) {
  if (role === "ADMIN_KEPEGAWAIAN") {
    if (status === "SUBMITTED")
      return "Pengajuan menunggu keputusan administrasi.";
    if (status === "RETURNED_FOR_CORRECTION")
      return "Pengajuan sedang diperbaiki oleh pegawai.";
    if (status === "APPROVED")
      return "Pengajuan telah disetujui dan selesai diproses.";
    if (status === "REJECTED") return "Pengajuan telah ditolak.";
    if (status === "CANCELLED")
      return "Pengajuan telah dibatalkan oleh pegawai.";
    return "Draf masih berada pada pegawai dan belum diajukan.";
  }

  if (status === "DRAFT")
    return "Draf belum dikirim. Periksa kembali sebelum diajukan.";
  if (status === "SUBMITTED")
    return "Pengajuan sudah dikirim dan sedang menunggu tinjauan Admin Kepegawaian.";
  if (status === "RETURNED_FOR_CORRECTION")
    return "Admin meminta perbaikan. Buka edit, perbaiki data, lalu ajukan kembali.";
  if (status === "APPROVED") return "Pengajuan telah disetujui.";
  if (status === "REJECTED")
    return "Pengajuan telah ditolak. Lihat riwayat untuk alasan keputusan.";
  return "Pengajuan telah dibatalkan.";
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
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("Memuat pengajuan…");
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [reviewValue, setReviewValue] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ requests: values }, typeData] = await Promise.all([
        api(`/api/workflow/${kind}`),
        api("/api/workflow/permission-types"),
      ]);
      setRequests(values);
      setTypes(typeData.permissionTypes);
      setMessage(values.length ? "" : "Belum ada pengajuan.");
      return values as RequestRecord[];
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Gagal memuat pengajuan.",
      );
      return [] as RequestRecord[];
    }
  }, [kind]);

  useEffect(() => {
    // Fetching is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!reviewAction) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !acting) {
        setReviewAction(null);
        setReviewValue("");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [reviewAction, acting]);

  async function open(item: RequestRecord) {
    setCreating(false);
    setEditing(false);
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

  async function refreshSelected(requestId: string) {
    const [{ request }, values] = await Promise.all([
      api(`/api/workflow/${kind}/${requestId}`),
      load(),
    ]);
    const latest =
      values.find((item) => item.id === requestId) ??
      (request as RequestRecord);
    await open(latest);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const editingId = selected?.id;
    try {
      const result = await api(
        `/api/workflow/${kind}${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
      );
      setCreating(false);
      setEditing(false);
      const requestId = (result.request as RequestRecord).id;
      await refreshSelected(requestId);
      setMessage(
        editingId ? "Perubahan draf tersimpan." : "Draf pengajuan tersimpan.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan.");
    }
  }

  async function performAction(
    action: WorkflowAction,
    payload?: { reason?: string; evidenceReference?: string },
  ) {
    if (!selected) return;
    const requestId = selected.id;
    setActing(true);
    try {
      await api(`/api/workflow/${kind}/${requestId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });
      setReviewAction(null);
      setReviewValue("");
      setEditing(false);
      await refreshSelected(requestId);
      setMessage(
        action === "SUBMIT"
          ? "Pengajuan berhasil dikirim."
          : action === "APPROVE"
            ? "Pengajuan berhasil disetujui."
            : action === "RETURN"
              ? "Pengajuan dikembalikan untuk diperbaiki."
              : action === "REJECT"
                ? "Pengajuan ditolak."
                : "Pengajuan dibatalkan.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tindakan gagal.");
    } finally {
      setActing(false);
    }
  }

  function openReview(action: ReviewAction) {
    setReviewAction(action);
    setReviewValue("");
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewAction) return;
    const value = reviewValue.trim();
    if (!value) return;
    if (reviewAction === "APPROVE") {
      await performAction(reviewAction, { evidenceReference: value });
      return;
    }
    await performAction(reviewAction, { reason: value });
  }

  function requestName(item: RequestRecord) {
    if (kind === "leave") {
      return (
        leaveTypes.find(([id]) => id === item.currentRevision.leaveType)?.[1] ??
        "Cuti"
      );
    }
    return (
      types.find((type) => type.id === item.currentRevision.permissionTypeId)
        ?.name ?? "Izin"
    );
  }

  const showForm =
    role === "PEGAWAI" &&
    (creating ||
      (Boolean(selected) &&
        editing &&
        ["DRAFT", "RETURNED_FOR_CORRECTION"].includes(selected!.status)));

  const submittedCount = requests.filter(
    (item) => item.status === "SUBMITTED",
  ).length;

  function switchKind(next: Kind) {
    setKind(next);
    setSelected(null);
    setDetail(null);
    setCreating(false);
    setEditing(false);
    setMessage("Memuat pengajuan…");
  }

  return (
    <section className="workflow-surface" id="pengajuan">
      <div className="workflow-heading">
        <div>
          <p className="eyebrow">ALUR PENGAJUAN</p>
          <h2>Cuti dan Izin</h2>
          <p className="workflow-heading-copy">
            {role === "ADMIN_KEPEGAWAIAN"
              ? "Tinjau pengajuan berdasarkan pegawai, periksa riwayat, dan catat keputusan administrasi."
              : "Buat pengajuan, pantau status, dan lihat riwayat proses Anda."}
          </p>
        </div>

        <div
          className="workflow-tabs"
          role="tablist"
          aria-label="Jenis pengajuan"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === "leave"}
            className={kind === "leave" ? "active" : ""}
            onClick={() => switchKind("leave")}
          >
            Cuti
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "permission"}
            className={kind === "permission" ? "active" : ""}
            onClick={() => switchKind("permission")}
          >
            Izin
          </button>
        </div>
      </div>

      {role === "ADMIN_KEPEGAWAIAN" && (
        <div className="workflow-summary" aria-label="Ringkasan pengajuan">
          <span>
            <strong>{requests.length}</strong>
            Total {kind === "leave" ? "cuti" : "izin"}
          </span>
          <span className={submittedCount ? "attention" : ""}>
            <strong>{submittedCount}</strong>
            Menunggu tinjauan
          </span>
        </div>
      )}

      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}

      <div className="workflow-grid">
        <aside className="request-list-panel" aria-label="Daftar pengajuan">
          <div className="request-list-heading">
            <div>
              <h3>Daftar Pengajuan</h3>
              <span>{requests.length} data</span>
            </div>
            {role === "PEGAWAI" && (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setCreating(true);
                  setEditing(false);
                  setSelected(null);
                  setDetail(null);
                }}
              >
                + Pengajuan Baru
              </button>
            )}
          </div>

          <div className="request-list">
            {requests.length === 0 ? (
              <div className="workflow-empty-state">
                <strong>Belum ada pengajuan</strong>
                <span>
                  {role === "PEGAWAI"
                    ? "Buat pengajuan pertama Anda menggunakan tombol di atas."
                    : "Pengajuan yang masuk akan tampil di bagian ini."}
                </span>
              </div>
            ) : (
              requests.map((item) => (
                <button
                  type="button"
                  className={`request-card ${selected?.id === item.id ? "selected" : ""}`}
                  key={item.id}
                  onClick={() => void open(item)}
                  aria-pressed={selected?.id === item.id}
                >
                  {role === "ADMIN_KEPEGAWAIAN" && (
                    <div className="request-card-employee">
                      <strong>{item.employee.fullName}</strong>
                      <span>
                        {item.employee.nip} · {item.employee.workUnit}
                      </span>
                    </div>
                  )}
                  <div className="request-card-topline">
                    <strong>{requestName(item)}</strong>
                    <span
                      className={`workflow-status status-${item.status.toLowerCase()}`}
                    >
                      {labels[item.status]}
                    </span>
                  </div>
                  <small>
                    {formatDate(item.currentRevision.startDate)} →{" "}
                    {formatDate(item.currentRevision.endDate)}
                  </small>
                  <span className="request-card-reason">
                    {item.currentRevision.reason}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="request-detail">
          {showForm && (
            <form className="workflow-form" onSubmit={save}>
              <div className="workflow-form-heading">
                <p className="eyebrow">
                  {editing ? "PERBAIKI PENGAJUAN" : "PENGAJUAN BARU"}
                </p>
                <h3>
                  {editing
                    ? selected?.status === "RETURNED_FOR_CORRECTION"
                      ? "Perbaiki sesuai catatan admin"
                      : "Edit draf pengajuan"
                    : `Ajukan ${kind === "leave" ? "cuti" : "izin"}`}
                </h3>
                <p>
                  {editing
                    ? "Simpan perubahan terlebih dahulu. Setelah itu pengajuan dapat dikirim atau diajukan kembali."
                    : "Lengkapi data pengajuan. Data akan disimpan sebagai draf sebelum dikirim."}
                </p>
              </div>

              <label className="workflow-field-full">
                <span>Jenis {kind === "leave" ? "cuti" : "izin"}</span>
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

              {kind === "leave" && (
                <>
                  <label className="workflow-field-full">
                    <span>Tempat pembuatan formulir</span>
                    <input
                      name="formPlace"
                      maxLength={100}
                      defaultValue={selected?.currentRevision.formPlace ?? ""}
                      placeholder="Contoh: Gunungsitoli"
                    />
                  </label>
                  <label className="workflow-field-full">
                    <span>Alamat selama menjalankan cuti</span>
                    <textarea
                      name="leaveAddress"
                      defaultValue={
                        selected?.currentRevision.leaveAddress ?? ""
                      }
                      placeholder="Alamat yang dapat dihubungi selama cuti"
                    />
                  </label>
                  <label className="workflow-field-full">
                    <span>Nomor telepon selama menjalankan cuti</span>
                    <input
                      type="tel"
                      name="leavePhone"
                      maxLength={32}
                      defaultValue={selected?.currentRevision.leavePhone ?? ""}
                      placeholder="Contoh: +628123456789"
                    />
                  </label>
                  <p className="panel-description">
                    Ketiga data formulir boleh dilengkapi kemudian, tetapi wajib
                    sebelum pengajuan dikirim.
                  </p>
                </>
              )}

              <div className="workflow-date-grid">
                <label>
                  <span>Tanggal mulai</span>
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={selected?.currentRevision.startDate}
                    required
                  />
                </label>
                <label>
                  <span>Tanggal selesai</span>
                  <input
                    type="date"
                    name="endDate"
                    defaultValue={selected?.currentRevision.endDate}
                    required
                  />
                </label>
              </div>

              <label className="workflow-field-full">
                <span>Alasan</span>
                <textarea
                  name="reason"
                  defaultValue={selected?.currentRevision.reason}
                  placeholder="Jelaskan alasan pengajuan secara singkat dan jelas."
                  required
                />
              </label>

              <div className="workflow-form-actions">
                {editing && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setEditing(false)}
                  >
                    Batal Edit
                  </button>
                )}
                <button className="primary-button" type="submit">
                  {editing ? "Simpan Perubahan" : "Simpan Draf"}
                </button>
              </div>
            </form>
          )}

          {!showForm && !selected && (
            <div className="workflow-detail-placeholder">
              <span className="workflow-placeholder-icon" aria-hidden="true">
                ✓
              </span>
              <strong>Pilih pengajuan untuk melihat detail</strong>
              <p>
                Detail pegawai, status, alasan, riwayat revisi, dan tindakan
                administrasi akan tampil di sini.
              </p>
            </div>
          )}

          {!showForm && selected && (
            <section className="workflow-detail-content">
              <header className="workflow-detail-header">
                <div>
                  <p className="eyebrow">DETAIL PENGAJUAN</p>
                  <h3>{requestName(selected)}</h3>
                  <span
                    className={`workflow-status status-${selected.status.toLowerCase()}`}
                  >
                    {labels[selected.status]}
                  </span>
                </div>
              </header>

              <div
                className={`workflow-status-guidance status-${selected.status.toLowerCase()}`}
              >
                <strong>{labels[selected.status]}</strong>
                <span>{statusGuidance(selected.status, role)}</span>
              </div>

              <section className="workflow-employee-context">
                <div className="workflow-section-title">
                  <p className="eyebrow">DATA PEGAWAI</p>
                  <h3>{selected.employee.fullName}</h3>
                </div>
                <dl className="workflow-employee-grid">
                  <div>
                    <dt>NIP</dt>
                    <dd>{selected.employee.nip}</dd>
                  </div>
                  <div>
                    <dt>Jabatan</dt>
                    <dd>{selected.employee.positionTitle}</dd>
                  </div>
                  <div>
                    <dt>Unit Kerja</dt>
                    <dd>{selected.employee.workUnit}</dd>
                  </div>
                </dl>
              </section>

              <dl className="workflow-detail-grid">
                <div>
                  <dt>Periode</dt>
                  <dd>
                    {formatDate(selected.currentRevision.startDate)} →{" "}
                    {formatDate(selected.currentRevision.endDate)}
                  </dd>
                </div>
                <div>
                  <dt>Revisi aktif</dt>
                  <dd>Revisi {selected.currentRevisionNumber}</dd>
                </div>
                {selected.currentRevision.leaveType === "ANNUAL" && (
                  <div>
                    <dt>Hari kerja</dt>
                    <dd>
                      {selected.currentRevision.calculatedWorkingDays ??
                        "Dihitung saat diajukan"}
                    </dd>
                  </div>
                )}
                <div className="workflow-detail-reason">
                  <dt>Alasan pengajuan</dt>
                  <dd>{selected.currentRevision.reason}</dd>
                </div>
                {kind === "leave" && (
                  <>
                    <div>
                      <dt>Tempat pembuatan formulir</dt>
                      <dd>
                        {selected.currentRevision.formPlace || "Belum diisi"}
                      </dd>
                    </div>
                    <div>
                      <dt>Nomor telepon</dt>
                      <dd>
                        {selected.currentRevision.leavePhone || "Belum diisi"}
                      </dd>
                    </div>
                    <div className="workflow-detail-reason">
                      <dt>Alamat selama cuti</dt>
                      <dd>
                        {selected.currentRevision.leaveAddress || "Belum diisi"}
                      </dd>
                    </div>
                    <div>
                      <dt>Atasan langsung</dt>
                      <dd>
                        {selected.employee.directSupervisor
                          ? `${selected.employee.directSupervisor.fullName} — ${selected.employee.directSupervisor.nip}`
                          : "Belum ditetapkan"}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              <div className="workflow-actions">
                {role === "PEGAWAI" &&
                  ["DRAFT", "RETURNED_FOR_CORRECTION"].includes(
                    selected.status,
                  ) && (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={acting}
                      onClick={() => setEditing(true)}
                    >
                      {selected.status === "DRAFT"
                        ? "Edit Draf"
                        : "Perbaiki Pengajuan"}
                    </button>
                  )}

                {role === "PEGAWAI" &&
                  ["DRAFT", "RETURNED_FOR_CORRECTION"].includes(
                    selected.status,
                  ) && (
                    <button
                      className="primary-button"
                      type="button"
                      disabled={acting}
                      onClick={() => void performAction("SUBMIT")}
                    >
                      {selected.status === "DRAFT"
                        ? "Ajukan Sekarang"
                        : "Ajukan Kembali"}
                    </button>
                  )}

                {role === "PEGAWAI" &&
                  ["DRAFT", "SUBMITTED", "RETURNED_FOR_CORRECTION"].includes(
                    selected.status,
                  ) && (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={acting}
                      onClick={() => void performAction("CANCEL")}
                    >
                      Batalkan
                    </button>
                  )}

                {role === "ADMIN_KEPEGAWAIAN" &&
                  selected.status === "SUBMITTED" && (
                    <>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={acting}
                        onClick={() => openReview("RETURN")}
                      >
                        Kembalikan
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={acting}
                        onClick={() => openReview("REJECT")}
                      >
                        Tolak
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={acting}
                        onClick={() => openReview("APPROVE")}
                      >
                        Setujui Pengajuan
                      </button>
                    </>
                  )}
              </div>

              {kind === "leave" && selected.currentRevision.submittedAt && (
                <section className="workflow-document-panel">
                  <div>
                    <p className="eyebrow">DOKUMEN</p>
                    <h3>FORMULIR PENGAJUAN CUTI</h3>
                    <p>Unduh formulir ini untuk proses tanda tangan manual.</p>
                  </div>
                  <div className="workflow-document-actions">
                    <a
                      className="secondary-button"
                      href={`/api/workflow/leave/${selected.id}/document`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Lihat Formulir
                    </a>
                    <a
                      className="secondary-button"
                      href={`/api/workflow/leave/${selected.id}/document?download=1`}
                    >
                      Unduh PDF
                    </a>
                  </div>
                </section>
              )}

              <section className="workflow-history-section">
                <div className="workflow-section-title">
                  <p className="eyebrow">RIWAYAT</p>
                  <h3>Riwayat Status</h3>
                </div>

                {!detail && <p className="workflow-loading">Memuat riwayat…</p>}

                {detail?.history.length === 0 && (
                  <p className="workflow-empty-copy">
                    Belum ada perubahan status.
                  </p>
                )}

                {detail && detail.history.length > 0 && (
                  <div className="status-timeline">
                    {detail.history.map((item) => (
                      <article className="status-timeline-item" key={item.id}>
                        <span
                          className={`timeline-dot status-${item.toStatus.toLowerCase()}`}
                          aria-hidden="true"
                        />
                        <div>
                          <strong>
                            {labels[item.fromStatus]} → {labels[item.toStatus]}
                          </strong>
                          <small>{formatDateTime(item.occurredAt)}</small>
                          {item.reason && (
                            <p>
                              <b>Alasan:</b> {item.reason}
                            </p>
                          )}
                          {item.evidenceReference && (
                            <p>
                              <b>Referensi administrasi:</b>{" "}
                              {item.evidenceReference}
                            </p>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="workflow-history-section">
                <div className="workflow-section-title">
                  <p className="eyebrow">VERSI DATA</p>
                  <h3>Riwayat Revisi</h3>
                </div>

                {!detail && <p className="workflow-loading">Memuat revisi…</p>}

                {detail?.revisions.map((revision) => (
                  <article
                    className="revision-card"
                    key={revision.revisionNumber}
                  >
                    <div>
                      <strong>Revisi {revision.revisionNumber}</strong>
                      <span>
                        {formatDate(revision.startDate)} →{" "}
                        {formatDate(revision.endDate)}
                      </span>
                    </div>
                    <p>{revision.reason}</p>
                  </article>
                ))}
              </section>
            </section>
          )}
        </div>
      </div>

      {reviewAction && selected && (
        <div className="workflow-dialog-backdrop">
          <button
            className="workflow-dialog-scrim"
            type="button"
            aria-label="Tutup dialog"
            disabled={acting}
            onClick={() => {
              setReviewAction(null);
              setReviewValue("");
            }}
          />
          <form
            className={`workflow-review-dialog tone-${reviewCopy[reviewAction].tone}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workflow-review-title"
            onSubmit={submitReview}
          >
            <header>
              <div>
                <p className="eyebrow">{reviewCopy[reviewAction].eyebrow}</p>
                <h2 id="workflow-review-title">
                  {reviewCopy[reviewAction].title}
                </h2>
              </div>
              <button
                className="panel-close"
                type="button"
                disabled={acting}
                aria-label="Tutup dialog"
                onClick={() => {
                  setReviewAction(null);
                  setReviewValue("");
                }}
              >
                ×
              </button>
            </header>

            <div className="workflow-review-request">
              <span>
                {selected.employee.fullName} · {selected.employee.nip}
              </span>
              <strong>{requestName(selected)}</strong>
              <small>
                {formatDate(selected.currentRevision.startDate)} →{" "}
                {formatDate(selected.currentRevision.endDate)}
              </small>
            </div>

            <p className="workflow-review-description">
              {reviewCopy[reviewAction].description}
            </p>

            <label>
              <span>{reviewCopy[reviewAction].fieldLabel}</span>
              <textarea
                autoFocus
                required
                maxLength={1000}
                value={reviewValue}
                onChange={(event) => setReviewValue(event.target.value)}
                placeholder={reviewCopy[reviewAction].placeholder}
              />
            </label>

            <div className="workflow-dialog-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={acting}
                onClick={() => {
                  setReviewAction(null);
                  setReviewValue("");
                }}
              >
                Batal
              </button>
              <button
                className={
                  reviewAction === "REJECT"
                    ? "danger-button"
                    : reviewAction === "APPROVE"
                      ? "primary-button"
                      : "secondary-button"
                }
                type="submit"
                disabled={acting || !reviewValue.trim()}
              >
                {acting ? "Memproses…" : reviewCopy[reviewAction].confirmLabel}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

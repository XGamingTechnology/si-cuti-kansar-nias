"use client";

import { formatDate, formatDateTime } from "./indonesian-date";
import { LeaveOutcomePanel } from "./leave-outcome-panel";
import { AdminFloatingWindow } from "./admin-floating-window";
import { AdminPagination, useAdminPagination } from "./admin-pagination";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
    id: string;
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
  documents: Array<{
    id: string;
    revisionId: string;
    documentType: "SUBMISSION_PROOF" | "APPROVED_FORM" | "RETURN_BASIS";
    version: number;
    checksumSha256: string;
    sizeBytes: number;
    mimeType: string;
    originalFileName: string | null;
    uploadedAt: string | null;
    generatedAt: string;
  }>;
};

const labels: Record<WorkflowStatus, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Diajukan",
  RETURNED_FOR_CORRECTION: "Perlu diperbaiki",
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusGuidance(
  status: WorkflowStatus,
  role: "ADMIN_KEPEGAWAIAN" | "PEGAWAI",
) {
  if (role === "ADMIN_KEPEGAWAIAN") {
    if (status === "SUBMITTED")
      return "Pengajuan menunggu PDF bertanda tangan dari pegawai dan verifikasi Admin Kepegawaian.";
    if (status === "RETURNED_FOR_CORRECTION")
      return "Pengajuan sedang diperbaiki oleh pegawai.";
    if (status === "APPROVED")
      return "Pengajuan telah disetujui setelah dokumen bertanda tangan diverifikasi.";
    if (status === "REJECTED") return "Pengajuan telah ditolak.";
    if (status === "CANCELLED")
      return "Pengajuan telah dibatalkan oleh pegawai.";
    return "Draf masih berada pada pegawai dan belum diajukan.";
  }

  if (status === "DRAFT")
    return "Draf belum dikirim. Periksa kembali sebelum diajukan.";
  if (status === "SUBMITTED")
    return "Unduh formulir, selesaikan tanda tangan manual, lalu unggah kembali PDF bertanda tangan untuk diperiksa Admin Kepegawaian.";
  if (status === "RETURNED_FOR_CORRECTION")
    return "Admin meminta perbaikan. Buka edit, perbaiki data, lalu ajukan kembali.";
  if (status === "APPROVED")
    return "Pengajuan telah disetujui. PDF bertanda tangan tetap tersedia sebagai arsip.";
  if (status === "REJECTED")
    return "Pengajuan telah ditolak. Lihat riwayat untuk alasan keputusan.";
  return "Pengajuan telah dibatalkan.";
}

export function WorkflowWorkspace({
  role,
  initialKind = "leave",
  initialRequestId,
  initialCreate = false,
}: {
  role: "ADMIN_KEPEGAWAIAN" | "PEGAWAI";
  initialKind?: Kind;
  initialRequestId?: string;
  initialCreate?: boolean;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const pagination = useAdminPagination(requests, kind);
  const [types, setTypes] = useState<PermissionType[]>([]);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [creating, setCreating] = useState(
    initialCreate && role === "PEGAWAI" && !initialRequestId,
  );
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [reviewValue, setReviewValue] = useState("");
  const [acting, setActing] = useState(false);

  const listSequence = useRef(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const load = useCallback(async () => {
    const sequence = ++listSequence.current;
    setListLoading(true);
    setListError("");
    try {
      const [{ requests: values }, typeData] = await Promise.all([
        api(`/api/workflow/${kind}`),
        api("/api/workflow/permission-types"),
      ]);
      if (sequence !== listSequence.current) return [];
      setRequests(values);
      setTypes(typeData.permissionTypes);
      setListLoading(false);
      return values as RequestRecord[];
    } catch (error) {
      if (sequence !== listSequence.current) return [];
      setListLoading(false);
      setListError(
        error instanceof Error ? error.message : "Gagal memuat pengajuan.",
      );
      return [] as RequestRecord[];
    }
  }, [kind]);

  useEffect(() => {
    // Fetching is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const sequenceRef = listSequence;
    return () => {
      sequenceRef.current++;
    };
  }, [load]);

  const selectedIdRef = useRef<string | null>(null);
  const detailSequence = useRef(0);
  useEffect(() => {
    if (!initialRequestId) return;
    let active = true;
    const initialSequence = detailSequence.current;
    async function deepLink() {
      try {
        const data = await api(
          `/api/workflow/${initialKind}/${encodeURIComponent(initialRequestId!)}`,
        );
        if (
          active &&
          detailSequence.current === initialSequence &&
          selectedIdRef.current === null
        )
          await open(data.request as RequestRecord);
      } catch (error) {
        if (active && detailSequence.current === initialSequence)
          setMessage(
            error instanceof Error ? error.message : "Pengajuan gagal dibuka.",
          );
      }
    }
    void deepLink();
    return () => {
      active = false;
    };
    // The initial deep link is opened once; subsequent selection stays user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRequestId, initialKind]);

  async function open(item: RequestRecord) {
    const sequence = ++detailSequence.current;
    selectedIdRef.current = item.id;
    setMessage("");
    setReviewAction(null);
    setReviewValue("");
    setCreating(false);
    setEditing(false);
    setSelected(item);
    setDetail(null);
    setDetailError(false);
    try {
      const [revisionData, historyData, documentData] = await Promise.all([
        api(`/api/workflow/${kind}/${item.id}/revisions`),
        api(`/api/workflow/${kind}/${item.id}/history`),
        kind === "leave"
          ? api(`/api/workflow/leave/${item.id}/documents`)
          : Promise.resolve({ documents: [] }),
      ]);
      if (
        sequence !== detailSequence.current ||
        selectedIdRef.current !== item.id
      )
        return;
      setDetail({
        revisions: revisionData.revisions,
        history: historyData.history,
        documents: documentData.documents,
      });
    } catch (error) {
      if (
        sequence === detailSequence.current &&
        selectedIdRef.current === item.id
      ) {
        setDetailError(true);
        setMessage(
          error instanceof Error ? error.message : "Gagal memuat detail.",
        );
      }
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
    if (selectedIdRef.current !== requestId) return;
    await open(latest);
  }

  const saving = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setActing(true);
    const sequence = detailSequence.current;
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
      if (sequence !== detailSequence.current) {
        await load();
        return;
      }
      setCreating(false);
      setEditing(false);
      const requestId = (result.request as RequestRecord).id;
      selectedIdRef.current = requestId;
      setSelected(result.request as RequestRecord);
      await refreshSelected(requestId);
      if (selectedIdRef.current !== requestId) return;
      setMessage(
        editingId ? "Perubahan draf tersimpan." : "Draf pengajuan tersimpan.",
      );
    } catch (error) {
      if (sequence === detailSequence.current)
        setMessage(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      saving.current = false;
      setActing(false);
    }
  }

  const [reviewDocumentId, setReviewDocumentId] = useState("");
  const reviewKey = useRef<{ payload: string; key: string } | null>(null);

  const actionInFlight = useRef(false);
  async function performAction(
    action: WorkflowAction,
    payload?: {
      reason?: string;
      evidenceReference?: string;
      documentId?: string;
    },
  ) {
    if (!selected || actionInFlight.current) return;
    actionInFlight.current = true;
    const requestId = selected.id;
    setActing(true);
    try {
      const command = JSON.stringify({ action, ...payload });
      if (reviewKey.current?.payload !== command)
        reviewKey.current = { payload: command, key: crypto.randomUUID() };
      const result = await api(`/api/workflow/${kind}/${requestId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action,
          ...payload,
          idempotencyKey: reviewKey.current.key,
        }),
      });

      if (selectedIdRef.current !== requestId) return;
      setReviewAction(null);
      setReviewValue("");
      setEditing(false);
      await refreshSelected(requestId);
      if (selectedIdRef.current !== requestId) return;
      setMessage(
        result.decisionDocumentReady === false
          ? "Keputusan tersimpan. PDF hasil belum berhasil dibuat dan dapat dicoba lagi dari Arsip Hasil Keputusan."
          : action === "SUBMIT"
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
      if (selectedIdRef.current === requestId)
        setMessage(error instanceof Error ? error.message : "Tindakan gagal.");
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }

  function openReview(action: ReviewAction) {
    setReviewAction(action);
    setReviewValue("");
    reviewKey.current = null;
    setReviewDocumentId(
      detail?.documents.find(
        (d) =>
          d.documentType === "APPROVED_FORM" &&
          d.revisionId === selected?.currentRevision.id,
      )?.id ?? "",
    );
  }

  async function uploadSignedDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || kind !== "leave" || actionInFlight.current) return;
    actionInFlight.current = true;
    const requestId = selected.id;
    const form = event.currentTarget;
    const body = new FormData(form);
    setActing(true);
    try {
      const response = await fetch(
        `/api/workflow/leave/${selected.id}/documents`,
        { method: "POST", body },
      );
      const data = await response
        .json()
        .catch(() => null as { error?: string } | null);
      if (!response.ok) {
        if (response.status === 413)
          throw new Error(
            "PDF terlalu besar untuk dikirim. Ukuran maksimal 10 MB.",
          );
        throw new Error(
          data?.error ?? `Dokumen gagal diunggah (HTTP ${response.status}).`,
        );
      }
      if (selectedIdRef.current !== requestId) return;
      form.reset();
      await refreshSelected(requestId);
      if (selectedIdRef.current !== requestId) return;
      setMessage("PDF bertanda tangan berhasil diarsipkan.");
    } catch (error) {
      if (selectedIdRef.current === requestId)
        setMessage(
          error instanceof Error ? error.message : "Dokumen gagal diunggah.",
        );
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }

  async function downloadPdf(path: string, filename: string) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    const requestId = selectedIdRef.current;
    setActing(true);
    try {
      const response = await fetch(path);
      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => null as { error?: string } | null);
        throw new Error(data?.error ?? "PDF gagal diunduh.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      if (selectedIdRef.current === requestId)
        setMessage(
          "Unduhan PDF dimulai. Di iPad, periksa menu Unduhan atau aplikasi Files.",
        );
    } catch (error) {
      if (selectedIdRef.current === requestId)
        setMessage(
          error instanceof Error ? error.message : "PDF gagal diunduh.",
        );
    } finally {
      actionInFlight.current = false;
      setActing(false);
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewAction) return;
    const value = reviewValue.trim();
    if (!value) return;
    if (reviewAction === "APPROVE") {
      await performAction(reviewAction, {
        evidenceReference: value,
        documentId:
          kind === "leave" ? reviewDocumentId || undefined : undefined,
      });
      return;
    }
    await performAction(reviewAction, {
      reason: value,
      documentId:
        kind === "leave" && reviewAction === "REJECT"
          ? reviewDocumentId || undefined
          : undefined,
    });
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
    if (next === kind) return;
    listSequence.current++;
    setRequests([]);
    setKind(next);
    selectedIdRef.current = null;
    detailSequence.current++;
    setSelected(null);
    setDetail(null);
    setCreating(false);
    setEditing(false);
    setMessage("");
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

      {message && !selected && !showForm && (
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
                  setMessage("");
                  setCreating(true);
                  setEditing(false);
                  selectedIdRef.current = null;
                  detailSequence.current++;
                  setSelected(null);
                  setDetail(null);
                }}
              >
                + Pengajuan Baru
              </button>
            )}
          </div>

          <div className="request-list">
            {listLoading ? (
              <p role="status">Memuat pengajuan…</p>
            ) : listError ? (
              <div role="alert">
                <p>{listError}</p>
                <button type="button" onClick={() => void load()}>
                  Coba lagi
                </button>
              </div>
            ) : requests.length === 0 ? (
              <div className="workflow-empty-state">
                <strong>Belum ada pengajuan</strong>
                <span>
                  {role === "PEGAWAI"
                    ? "Buat pengajuan pertama Anda menggunakan tombol di atas."
                    : "Pengajuan yang masuk akan tampil di bagian ini."}
                </span>
              </div>
            ) : (
              pagination.items.map((item) => (
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
                  {role === "ADMIN_KEPEGAWAIAN" && (
                    <span className="request-card-reason">
                      {item.currentRevision.reason}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          <AdminPagination {...pagination.controls} />
          {role === "PEGAWAI" && requests.length > 10 && (
            <p className="employee-pagination-note">
              10 per halaman · Daftar dimuat sekaligus dari server.
            </p>
          )}
        </aside>

        {(selected || showForm) && (
          <AdminRequestDetailWindow
            floating={true}
            busy={acting}
            onClose={() => {
              selectedIdRef.current = null;
              detailSequence.current++;
              setSelected(null);
              setDetail(null);
              setCreating(false);
              setEditing(false);
              setMessage("");
            }}
          >
            <div className="request-detail">
              {message && (
                <p className="feedback" role="status">
                  {message}
                </p>
              )}
              {detailError && selected && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void open(selected)}
                >
                  Muat ulang detail
                </button>
              )}
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
                      aria-label={
                        kind === "leave" ? "Jenis cuti" : "Jenis izin"
                      }
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
                          defaultValue={
                            selected?.currentRevision.formPlace ?? ""
                          }
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
                          defaultValue={
                            selected?.currentRevision.leavePhone ?? ""
                          }
                          placeholder="Contoh: +628123456789"
                        />
                      </label>
                      <p className="panel-description">
                        Ketiga data formulir boleh dilengkapi kemudian, tetapi
                        wajib sebelum pengajuan dikirim.
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
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={acting}
                    >
                      {editing ? "Simpan Perubahan" : "Simpan Draf"}
                    </button>
                  </div>
                </form>
              )}

              {!showForm && !selected && (
                <div className="workflow-detail-placeholder">
                  <span
                    className="workflow-placeholder-icon"
                    aria-hidden="true"
                  >
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

                  {role === "PEGAWAI" &&
                    ["REJECTED", "RETURNED_FOR_CORRECTION"].includes(
                      selected.status,
                    ) && (
                      <div className="employee-review-reason" role="note">
                        <strong>
                          {selected.status === "REJECTED"
                            ? "Alasan penolakan"
                            : "Catatan perbaikan"}
                        </strong>
                        <p>
                          {detail
                            ? ([...detail.history]
                                .reverse()
                                .find((h) => h.toStatus === selected.status)
                                ?.reason ??
                              "Alasan belum tersedia pada riwayat.")
                            : "Memuat alasan…"}
                        </p>
                      </div>
                    )}
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
                            {selected.currentRevision.formPlace ||
                              "Belum diisi"}
                          </dd>
                        </div>
                        <div>
                          <dt>Nomor telepon</dt>
                          <dd>
                            {selected.currentRevision.leavePhone ||
                              "Belum diisi"}
                          </dd>
                        </div>
                        <div className="workflow-detail-reason">
                          <dt>Alamat selama cuti</dt>
                          <dd>
                            {selected.currentRevision.leaveAddress ||
                              "Belum diisi"}
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
                          onClick={() => {
                            setMessage("");
                            setEditing(true);
                          }}
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
                      [
                        "DRAFT",
                        "SUBMITTED",
                        "RETURNED_FOR_CORRECTION",
                      ].includes(selected.status) && (
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
                            disabled={
                              acting ||
                              !detail?.documents.some(
                                (document) =>
                                  document.documentType === "APPROVED_FORM" &&
                                  document.revisionId ===
                                    selected.currentRevision.id,
                              )
                            }
                            title={
                              detail?.documents.some(
                                (document) =>
                                  document.documentType === "APPROVED_FORM" &&
                                  document.revisionId ===
                                    selected.currentRevision.id,
                              )
                                ? undefined
                                : "PDF bertanda tangan dari pegawai belum tersedia."
                            }
                            onClick={() => openReview("APPROVE")}
                          >
                            Setujui Pengajuan
                          </button>
                        </>
                      )}
                  </div>

                  {kind === "leave" &&
                    ["APPROVED", "REJECTED"].includes(selected.status) && (
                      <LeaveOutcomePanel
                        key={selected.id + selected.status}
                        requestId={selected.id}
                        status={selected.status}
                        admin={role === "ADMIN_KEPEGAWAIAN"}
                        annual={selected.currentRevision.leaveType === "ANNUAL"}
                        signedDocuments={
                          detail?.documents.filter(
                            (d) =>
                              d.documentType === "APPROVED_FORM" &&
                              d.revisionId === selected.currentRevision.id,
                          ) ?? []
                        }
                      />
                    )}

                  {kind === "leave" && selected.currentRevision.submittedAt && (
                    <section className="workflow-document-panel">
                      <div className="workflow-document-generated">
                        <div>
                          <p className="eyebrow">DOKUMEN</p>
                          <h3>FORMULIR PENGAJUAN CUTI</h3>
                          <p>
                            Unduh formulir ini untuk proses tanda tangan manual.
                          </p>
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
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={acting}
                            onClick={() =>
                              void downloadPdf(
                                `/api/workflow/leave/${selected.id}/document?download=1`,
                                `formulir-pengajuan-cuti-${selected.employee.nip}.pdf`,
                              )
                            }
                          >
                            Unduh PDF
                          </button>
                        </div>
                      </div>

                      <div className="workflow-signed-archive">
                        <div className="workflow-section-title">
                          <p className="eyebrow">ARSIP RESMI</p>
                          <h3>Scan Bertanda Tangan</h3>
                        </div>

                        {role === "PEGAWAI" &&
                          selected.status === "SUBMITTED" && (
                            <form
                              className="workflow-document-upload"
                              onSubmit={uploadSignedDocument}
                            >
                              <label>
                                <span>
                                  Unggah PDF yang sudah ditandatangani/distempel
                                </span>
                                <input
                                  type="file"
                                  name="file"
                                  accept=".pdf,application/pdf"
                                  required
                                />
                              </label>
                              <small>
                                Setelah formulir dicetak dan ditandatangani
                                manual, unggah hasil scan PDF di sini. Maksimal
                                10 MB. Unggahan baru dibuat sebagai versi baru
                                dan tidak menimpa arsip sebelumnya.
                              </small>
                              <button
                                className="primary-button"
                                type="submit"
                                disabled={acting}
                              >
                                Unggah PDF Bertanda Tangan
                              </button>
                            </form>
                          )}

                        {!detail && !detailError && (
                          <p className="workflow-loading">
                            Memuat arsip dokumen…
                          </p>
                        )}

                        {detail &&
                          detail.documents.filter(
                            (document) =>
                              document.documentType === "APPROVED_FORM",
                          ).length === 0 && (
                            <p className="workflow-empty-copy">
                              Belum ada PDF bertanda tangan yang diarsipkan.
                            </p>
                          )}

                        {detail && (
                          <div className="workflow-signed-list">
                            {detail.documents
                              .filter(
                                (document) =>
                                  document.documentType === "APPROVED_FORM",
                              )
                              .map((document) => (
                                <article
                                  className="workflow-signed-item"
                                  key={document.id}
                                >
                                  <div>
                                    <strong>
                                      Versi {document.version}
                                      {document.originalFileName
                                        ? ` · ${document.originalFileName}`
                                        : ""}
                                    </strong>
                                    <span>
                                      {formatDateTime(
                                        document.uploadedAt ??
                                          document.generatedAt,
                                      )}{" "}
                                      · {formatBytes(document.sizeBytes)}
                                    </span>
                                  </div>
                                  <div className="workflow-document-actions">
                                    <a
                                      className="secondary-button"
                                      href={`/api/workflow/leave/${selected.id}/documents/${document.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Lihat
                                    </a>
                                    <button
                                      className="secondary-button"
                                      type="button"
                                      disabled={acting}
                                      onClick={() =>
                                        void downloadPdf(
                                          `/api/workflow/leave/${selected.id}/documents/${document.id}?download=1`,
                                          document.originalFileName ??
                                            `formulir-cuti-bertanda-tangan-v${document.version}.pdf`,
                                        )
                                      }
                                    >
                                      Unduh
                                    </button>
                                  </div>
                                </article>
                              ))}
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  <section className="workflow-history-section">
                    <div className="workflow-section-title">
                      <p className="eyebrow">RIWAYAT</p>
                      <h3>Riwayat Status</h3>
                    </div>

                    {!detail && !detailError && (
                      <p className="workflow-loading">Memuat riwayat…</p>
                    )}

                    {detail?.history.length === 0 && (
                      <p className="workflow-empty-copy">
                        Belum ada perubahan status.
                      </p>
                    )}

                    {detail && detail.history.length > 0 && (
                      <div className="status-timeline">
                        {detail.history.map((item) => (
                          <article
                            className="status-timeline-item"
                            key={item.id}
                          >
                            <span
                              className={`timeline-dot status-${item.toStatus.toLowerCase()}`}
                              aria-hidden="true"
                            />
                            <div>
                              <strong>
                                {labels[item.fromStatus]} →{" "}
                                {labels[item.toStatus]}
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

                    {!detail && !detailError && (
                      <p className="workflow-loading">Memuat revisi…</p>
                    )}

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
          </AdminRequestDetailWindow>
        )}
      </div>

      {reviewAction && selected && (
        <AdminFloatingWindow
          title={reviewCopy[reviewAction].title}
          busy={acting}
          onClose={() => {
            setReviewAction(null);
            setReviewValue("");
          }}
        >
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

              {message && (
                <p className="feedback" role="status">
                  {message}
                </p>
              )}
              <p className="workflow-review-description">
                {reviewCopy[reviewAction].description}
              </p>

              {kind === "leave" &&
                (reviewAction === "APPROVE" || reviewAction === "REJECT") && (
                  <label>
                    <span>Scan sumber untuk hasil keputusan</span>
                    <select
                      value={reviewDocumentId}
                      required={reviewAction === "APPROVE"}
                      disabled={acting}
                      onChange={(event) =>
                        setReviewDocumentId(event.target.value)
                      }
                    >
                      <option value="">
                        {reviewAction === "APPROVE"
                          ? "Pilih scan yang diverifikasi"
                          : "Tanpa scan sumber"}
                      </option>
                      {detail?.documents
                        .filter(
                          (d) =>
                            d.documentType === "APPROVED_FORM" &&
                            d.revisionId === selected.currentRevision.id,
                        )
                        .map((d) => (
                          <option value={d.id} key={d.id}>
                            Versi {d.version} ·{" "}
                            {d.originalFileName ?? "PDF bertanda tangan"}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

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
                  {acting
                    ? "Memproses…"
                    : reviewCopy[reviewAction].confirmLabel}
                </button>
              </div>
            </form>
          </div>
        </AdminFloatingWindow>
      )}
    </section>
  );
}

function AdminRequestDetailWindow({
  floating,
  busy,
  onClose,
  children,
}: {
  floating: boolean;
  busy?: boolean;
  onClose: () => void;
  children: import("react").ReactNode;
}) {
  return floating ? (
    <AdminFloatingWindow title="Detail pengajuan" onClose={onClose} busy={busy}>
      {children}
    </AdminFloatingWindow>
  ) : (
    <>{children}</>
  );
}

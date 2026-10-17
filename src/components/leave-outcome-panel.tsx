"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { formatDateTime } from "./indonesian-date";
import { DecisionStampEditor } from "./decision-stamp-editor";
import { AdminFloatingWindow } from "./admin-floating-window";
import type {
  DecisionSnapshot,
  ReturnInput,
} from "@/application/leave-records/ports";

type Decision = {
  id: string;
  sourceDocumentId: string | null;
  snapshot: DecisionSnapshot;
  ready: boolean;
  editions?: { id: string; version: number; createdAt: string }[];
};
type History = {
  id: string;
  restoredDays: number;
  reason: string;
  basisReference: string;
  recordedAt: string;
  evidenceDocumentId: string;
  idempotencyKey: string;
};
type Preview = {
  fingerprint: string;
  originalCommittedDays: number;
  previouslyRestoredDays: number;
  remainingCommittedDays: number;
  allocations: { bucket: string; days: number }[];
  accountsBefore: { bucket: string; availableDays: number }[];
  accountsAfterPreview: { bucket: string; availableDays: number }[];
};
const bucketName: Record<string, string> = {
  N: "Cuti N",
  N1: "Cuti N-1",
  N2: "Cuti N-2",
  JOINT_LEAVE_CLAIM: "Klaim Cuti Bersama",
};
class RequestFailure extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
async function json(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new RequestFailure(
      data.error ?? `Operasi gagal (HTTP ${response.status}).`,
      response.status,
    );
  return data;
}
export function LeaveOutcomePanel({
  requestId,
  status,
  admin,
  annual,
  signedDocuments = [],
}: {
  requestId: string;
  status: string;
  admin: boolean;
  annual: boolean;
  signedDocuments?: {
    id: string;
    version: number;
    originalFileName?: string | null;
  }[];
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [legacyDocumentId, setLegacyDocumentId] = useState("");
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [legacyBusy, setLegacyBusy] = useState(false);
  async function verifyLegacy(event: FormEvent) {
    event.preventDefault();
    setLegacyBusy(true);
    setError("");
    try {
      await json(`/api/workflow/leave/${requestId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentId: legacyDocumentId || null,
          confirmed: legacyConfirmed,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verifikasi arsip gagal.");
    } finally {
      setLegacyBusy(false);
    }
  }
  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        json(`/api/workflow/leave/${requestId}/decision`),
        json(`/api/workflow/leave/${requestId}/returns`),
      ]);
      setDecision(d.decision);
      setHistory(r.returns);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arsip gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, [requestId]);
  useEffect(() => {
    let active = true;
    Promise.all([
      json(`/api/workflow/leave/${requestId}/decision`),
      json(`/api/workflow/leave/${requestId}/returns`),
    ])
      .then(([d, r]) => {
        if (active) {
          setDecision(d.decision);
          setHistory(r.returns);
          setError("");
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Arsip gagal dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestId]);
  const download = async () => {
    setError("");
    try {
      const response = await fetch(
        `/api/workflow/leave/${requestId}/decision/document`,
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "PDF hasil gagal dibuat.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${status === "APPROVED" ? "arsip-final" : "hasil-penolakan"}-${decision?.id ?? requestId}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unduhan gagal.");
    }
  };
  return (
    <section className="leave-outcome-panel">
      <h3>Arsip Hasil Keputusan</h3>
      {loading && <p role="status">Memuat arsip keputusan…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => void load()}>
            Muat ulang
          </button>
        </p>
      )}
      {decision && (
        <>
          <p className="leave-decision-label">
            {status === "APPROVED"
              ? "FINAL · DISETUJUI DI SI CUTI"
              : "DITOLAK DI SI CUTI"}
          </p>
          <p>Referensi arsip: {decision.id}</p>
          {decision.editions?.map((e) => (
            <p key={e.id}>
              <a
                href={`/api/workflow/leave/${requestId}/decision/document?edition=${e.id}`}
              >
                Unduh PDF Keputusan Final · edisi {e.version}
              </a>{" "}
              · {formatDateTime(e.createdAt)}
            </p>
          ))}
          {admin && decision.sourceDocumentId && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setStampOpen(true)}
            >
              Atur Penanda pada Formulir
            </button>
          )}
          {stampOpen && (
            <DecisionStampEditor
              requestId={requestId}
              decision={decision}
              onClose={() => setStampOpen(false)}
              onSaved={async () => {
                await load();
                setStampOpen(false);
              }}
            />
          )}
          <p>
            Admin pencatat: {decision.snapshot.actorName} ·{" "}
            {formatDateTime(decision.snapshot.occurredAt)}
          </p>
          {decision.snapshot.sourceDocumentVersion !== null && (
            <p>Scan sumber: versi {decision.snapshot.sourceDocumentVersion}</p>
          )}
          {decision.snapshot.reason && (
            <p>Alasan penolakan: {decision.snapshot.reason}</p>
          )}
          {decision.sourceDocumentId && (
            <p>
              <a
                href={`/api/workflow/leave/${requestId}/documents/${decision.sourceDocumentId}`}
                target="_blank"
                rel="noreferrer"
              >
                Lihat Scan Asli Sumber Keputusan
              </a>
            </p>
          )}
          {(admin || decision.ready) && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => void download()}
            >
              {status === "APPROVED"
                ? "Unduh PDF Keputusan Final"
                : "Unduh Hasil Penolakan"}
            </button>
          )}
          {!decision.ready && (
            <p>
              {admin
                ? "PDF akan dibuat dari rekaman keputusan dan scan sumber saat diunduh. Jika gagal, keputusan tetap tersimpan dan pembuatan PDF dapat diulang."
                : "PDF Keputusan Final belum tersedia. Hubungi Admin; rekaman keputusan tetap tersimpan."}
            </p>
          )}
        </>
      )}
      {!loading && !error && !decision && (
        <p>
          Pengajuan lama belum memiliki arsip keputusan dengan versi sumber
          terkunci. Dokumen asli tetap tersedia; penandaan final memerlukan
          verifikasi arsip.
        </p>
      )}
      {!loading && !decision && admin && (
        <form onSubmit={verifyLegacy} className="leave-return-form">
          <h4>Verifikasi Sumber Arsip Lama</h4>
          <label>
            Scan yang menjadi dasar keputusan
            <select
              required={status === "APPROVED"}
              disabled={legacyBusy}
              value={legacyDocumentId}
              onChange={(e) => setLegacyDocumentId(e.target.value)}
            >
              <option value="">
                {status === "APPROVED"
                  ? "Pilih scan yang sudah diverifikasi"
                  : "Tidak ada scan sumber"}
              </option>
              {signedDocuments.map((d) => (
                <option key={d.id} value={d.id}>
                  Versi {d.version} · {d.originalFileName ?? "Scan"}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={legacyConfirmed}
              disabled={legacyBusy}
              onChange={(e) => setLegacyConfirmed(e.target.checked)}
            />
            Saya memverifikasi dasar keputusan lama dan versi sumber yang
            dipilih. Proses ini hanya mencatat arsip, tanpa mengulangi
            persetujuan atau mutasi saldo.
          </label>
          <button
            type="submit"
            className="secondary-button"
            disabled={legacyBusy || !legacyConfirmed}
          >
            Kunci Sumber Arsip Lama
          </button>
        </form>
      )}
      {status === "APPROVED" && annual && (
        <>
          <h3>Pengembalian Cuti</h3>
          <p>
            Pengajuan tetap disetujui. Pengembalian hari yang sah tidak
            digunakan dicatat sebagai kompensasi terpisah.
          </p>
          {history.map((item) => (
            <article key={item.id} className="leave-return-history">
              <p>
                {item.restoredDays} hari · {formatDateTime(item.recordedAt)}
              </p>
              <p>{item.reason}</p>
              <p>Dasar: {item.basisReference}</p>
              <a
                href={`/api/workflow/leave/${requestId}/documents/${item.evidenceDocumentId}`}
                target="_blank"
                rel="noreferrer"
              >
                Lihat bukti pengembalian
              </a>
            </article>
          ))}
          {!loading && !history.length && <p>Belum ada pengembalian saldo.</p>}
          {admin && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setOpen(true)}
            >
              Catat Pengembalian Cuti
            </button>
          )}
          {open && (
            <ReturnWindow
              requestId={requestId}
              onClose={() => setOpen(false)}
              onSuccess={async () => {
                setOpen(false);
                await load();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
function ReturnWindow({
  requestId,
  onClose,
  onSuccess,
}: {
  requestId: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [input, setInput] = useState<ReturnInput>({
    restoredDays: 1,
    reason: "",
    basisReference: "",
    basisDate: "",
    evidenceDocumentId: "",
    unusedDaysConfirmed: false,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const key = useRef<string | null>(null);
  const path = `/api/workflow/leave/${requestId}/returns`;
  function change(patch: Partial<ReturnInput>) {
    setInput((v) => ({ ...v, ...patch }));
    setPreview(null);
    key.current = null;
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    change({ evidenceDocumentId: "" });
    const form = new FormData();
    form.set("file", file);
    try {
      const data = await json(path + "/evidence", {
        method: "POST",
        body: form,
      });
      change({ evidenceDocumentId: data.document.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unggahan gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function checkResult() {
    try {
      const data = await json(path);
      if (data.returns.some((r: History) => r.idempotencyKey === key.current)) {
        await onSuccess();
        return true;
      }
      return false;
    } catch {
      setUnknown(true);
      setError(
        "Hasil belum dapat dipastikan. Periksa hasil atau ulangi konfirmasi dengan data yang sama.",
      );
      return false;
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!preview) {
        const result = await json(path + "/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        setPreview(result.preview);
        key.current = crypto.randomUUID();
      } else {
        await json(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...input,
            idempotencyKey: key.current,
            fingerprint: preview.fingerprint,
          }),
        });
        await onSuccess();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operasi gagal.");
      if (preview) {
        setUnknown(!(e instanceof RequestFailure && e.status < 500));
        await checkResult();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFloatingWindow
      title="Pengembalian Saldo Cuti Tahunan"
      busy={busy || unknown}
      onClose={onClose}
    >
      <form onSubmit={submit} className="leave-return-form">
        <fieldset disabled={busy || unknown}>
          <label>
            Hari kerja yang tidak digunakan
            <input
              type="number"
              min="1"
              step="1"
              required
              value={input.restoredDays}
              onChange={(e) => change({ restoredDays: Number(e.target.value) })}
            />
          </label>
          <label>
            Alasan pengembalian
            <textarea
              required
              maxLength={10000}
              value={input.reason}
              onChange={(e) => change({ reason: e.target.value })}
            />
          </label>
          <label>
            Nomor/referensi dasar resmi
            <input
              required
              maxLength={191}
              value={input.basisReference}
              onChange={(e) => change({ basisReference: e.target.value })}
            />
          </label>
          <label>
            Tanggal dasar resmi
            <input
              type="date"
              required
              value={input.basisDate}
              onChange={(e) => change({ basisDate: e.target.value })}
            />
          </label>
          <label>
            Bukti PDF pendukung
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          {input.evidenceDocumentId && <p>Bukti PDF tersimpan.</p>}
          <label>
            <input
              type="checkbox"
              checked={input.unusedDaysConfirmed}
              onChange={(e) =>
                change({ unusedDaysConfirmed: e.target.checked })
              }
            />
            Saya telah memverifikasi jumlah hari tidak digunakan sesuai dasar
            resmi.
          </label>
        </fieldset>
        {preview && (
          <div className="leave-return-preview">
            <p>
              COMMIT asal: {preview.originalCommittedDays} hari · Sudah
              dikembalikan: {preview.previouslyRestoredDays} hari · Batas ledger
              tersisa: {preview.remainingCommittedDays} hari
            </p>
            <p>
              Batas ledger bukan bukti penggunaan aktual. Pengembalian mengikuti
              dasar resmi yang Anda verifikasi.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Dikembalikan</th>
                  <th>Saldo sebelum</th>
                  <th>Saldo sesudah</th>
                </tr>
              </thead>
              <tbody>
                {preview.allocations.map((a) => (
                  <tr key={a.bucket}>
                    <td>{bucketName[a.bucket] ?? a.bucket}</td>
                    <td>{a.days}</td>
                    <td>
                      {
                        preview.accountsBefore.find(
                          (b) => b.bucket === a.bucket,
                        )?.availableDays
                      }
                    </td>
                    <td>
                      {
                        preview.accountsAfterPreview.find(
                          (b) => b.bucket === a.bucket,
                        )?.availableDays
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {unknown && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void checkResult()}
          >
            Periksa Hasil
          </button>
        )}
        <button
          className="primary-button"
          type="submit"
          disabled={busy || !input.evidenceDocumentId}
        >
          {busy
            ? "Memproses…"
            : preview
              ? "Konfirmasi Pengembalian"
              : "Preview Pengembalian"}
        </button>
        {preview && !unknown && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPreview(null);
              key.current = null;
            }}
          >
            Perbarui Preview
          </button>
        )}
      </form>
    </AdminFloatingWindow>
  );
}

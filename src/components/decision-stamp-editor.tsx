"use client";
import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "./indonesian-date";
import { PdfPagePreview } from "./pdf-page-preview";
import { AdminFloatingWindow } from "./admin-floating-window";
import type {
  DecisionPlacement,
  DecisionSnapshot,
} from "@/application/leave-records/ports";

export function DecisionStampEditor({
  requestId,
  decision,
  onClose,
  onSaved,
}: {
  requestId: string;
  decision: { snapshot: DecisionSnapshot; sourceDocumentId?: string | null };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [placement, setPlacement] = useState<DecisionPlacement>({
    page: 1,
    left: 0.06,
    top: 0.884,
    width: 0.5,
    height: 0.086,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<
    { page: number; width: number; height: number; rotation: number }[]
  >([]);
  const [sourceError, setSourceError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workflow/leave/${requestId}/decision/editions/preview`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Scan gagal dimuat.");
        if (data.sourceChecksum !== decision.snapshot.sourceChecksumSha256)
          throw new Error("Scan sumber berubah. Muat ulang arsip.");
        if (!controller.signal.aborted) setPages(data.pages);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setSourceError(e instanceof Error ? e.message : "Scan gagal dimuat.");
      });
    return () => controller.abort();
  }, [requestId, decision.snapshot.sourceChecksumSha256]);
  const key = useRef(crypto.randomUUID());
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function change(next: DecisionPlacement) {
    setPlacement(next);
    setPreview(null);
    setPreviewReady(false);
    setFingerprint("");
    setConfirmed(false);
    key.current = crypto.randomUUID();
  }
  async function makePreview() {
    setBusy(true);
    setError("");
    setConfirmed(false);
    setPreview(null);
    setPreviewReady(false);
    setFingerprint("");
    try {
      const r = await fetch(
        `/api/workflow/leave/${requestId}/decision/editions/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            placement,
            sourceChecksum: decision.snapshot.sourceChecksumSha256,
          }),
        },
      );
      if (!r.ok)
        throw new Error((await r.json()).error ?? "Preview gagal dibuat.");
      setPreview(URL.createObjectURL(await r.blob()));
      setFingerprint(r.headers.get("x-si-cuti-preview") ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `/api/workflow/leave/${requestId}/decision/editions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            placement,
            sourceChecksum: decision.snapshot.sourceChecksumSha256,
            confirmed,
            previewFingerprint: fingerprint,
            idempotencyKey: key.current,
          }),
        },
      );
      if (!r.ok)
        throw new Error(
          (await r.json()).error ?? "Edisi final gagal disimpan.",
        );
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Penyimpanan gagal. Ulangi dengan posisi yang sama.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFloatingWindow
      title="Penanda Keputusan pada Formulir"
      busy={busy}
      onClose={onClose}
    >
      <p>
        Penanda memakai hasil dan tanggal keputusan yang sudah dicatat. Pilih
        kolom keputusan atau ruang kosong yang sesuai. Penanda ini tidak mengisi
        persetujuan atasan lain atau menggantikan tanda tangan.
      </p>
      <p>
        Periksa nama, NIP, periode, serta seluruh tanda tangan pada scan. Jika
        sumber tidak sesuai pengajuan, jangan simpan edisi ini.
      </p>
      <dl className="decision-source-details">
        <dt>Status tercatat</dt>
        <dd>
          {decision.snapshot.status === "APPROVED" ? "Disetujui" : "Ditolak"}
        </dd>
        <dt>Admin pencatat</dt>
        <dd>{decision.snapshot.actorName}</dd>
        <dt>Waktu pencatatan</dt>
        <dd>{formatDateTime(decision.snapshot.occurredAt)}</dd>
        <dt>Scan yang dipakai</dt>
        <dd>Versi {decision.snapshot.sourceDocumentVersion ?? "—"}</dd>
      </dl>
      <p>
        PDF edisi menyertakan halaman scan dengan penanda, lalu halaman
        ringkasan keputusan. Admin pencatat bukan identitas pejabat
        penandatangan. Pilih posisi melalui persentase area halaman yang
        terlihat; buat ulang preview setiap kali posisi berubah.
      </p>
      {decision.sourceDocumentId && (
        <details open={!preview}>
          <summary>Lihat scan asli versi terpilih</summary>
          <a
            target="_blank"
            rel="noreferrer"
            href={`/api/workflow/leave/${requestId}/documents/${decision.sourceDocumentId}`}
          >
            Buka scan asli di tab baru
          </a>
          <PdfPagePreview
            key={String(decision.sourceDocumentId) + placement.page}
            url={`/api/workflow/leave/${requestId}/documents/${decision.sourceDocumentId}`}
            page={placement.page}
            label="Scan asli versi keputusan"
          />
        </details>
      )}
      <fieldset disabled={busy} className="decision-stamp-controls">
        <label>
          Halaman scan
          <select
            value={placement.page}
            disabled={!pages.length}
            onChange={(e) =>
              change({ ...placement, page: Number(e.target.value) })
            }
          >
            {!pages.length && <option value={1}>Memuat halaman…</option>}
            {pages.map((p) => (
              <option key={p.page} value={p.page}>
                Halaman {p.page} — {Math.round(p.width)} ×{" "}
                {Math.round(p.height)} pt, rotasi {p.rotation}°
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["left", "Posisi dari kiri"],
            ["top", "Posisi dari atas"],
            ["width", "Lebar penanda"],
            ["height", "Tinggi penanda"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label} (%)
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={Math.round(placement[field] * 1000) / 10}
              onChange={(e) =>
                change({ ...placement, [field]: Number(e.target.value) / 100 })
              }
            />
          </label>
        ))}
        <button
          type="button"
          className="secondary-button"
          disabled={!pages.length || Boolean(sourceError)}
          onClick={() => void makePreview()}
        >
          Lihat Preview PDF
        </button>
      </fieldset>
      {sourceError && (
        <p role="alert">
          {sourceError} Tutup dan buka kembali editor untuk mencoba lagi.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <>
          <p>
            <a href={preview} target="_blank" rel="noreferrer">
              Buka preview di tab baru
            </a>
          </p>
          <PdfPagePreview
            key={preview + placement.page}
            url={preview}
            page={placement.page}
            label="Preview penanda keputusan"
            onReady={setPreviewReady}
          />
          <label>
            <input
              type="checkbox"
              disabled={busy || !previewReady}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Saya telah memeriksa kesesuaian identitas, periode, dan posisi
            penanda; tidak ada tulisan atau tanda tangan yang tertutup.
          </label>
        </>
      )}
      <button
        type="button"
        className="primary-button"
        disabled={
          busy || !preview || !previewReady || !fingerprint || !confirmed
        }
        onClick={() => void save()}
      >
        {busy ? "Memproses…" : "Simpan Edisi Final"}
      </button>
    </AdminFloatingWindow>
  );
}

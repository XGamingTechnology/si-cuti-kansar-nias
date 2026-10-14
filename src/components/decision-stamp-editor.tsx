"use client";
import { useEffect, useRef, useState } from "react";
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
  decision: { snapshot: DecisionSnapshot };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [placement, setPlacement] = useState<DecisionPlacement>({
    page: 1,
    left: decision.snapshot.status === "APPROVED" ? 0.06 : 0.73,
    top: 0.88,
    width: decision.snapshot.status === "APPROVED" ? 0.2 : 0.21,
    height: 0.08,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    setFingerprint("");
    setConfirmed(false);
    key.current = crypto.randomUUID();
  }
  async function makePreview() {
    setBusy(true);
    setError("");
    setConfirmed(false);
    setPreview(null);
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
      <fieldset disabled={busy} className="decision-stamp-controls">
        <label>
          Halaman scan
          <input
            type="number"
            min="1"
            step="1"
            value={placement.page}
            onChange={(e) =>
              change({ ...placement, page: Number(e.target.value) })
            }
          />
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
          onClick={() => void makePreview()}
        >
          Lihat Preview PDF
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <>
          <p>
            <a href={preview} target="_blank" rel="noreferrer">
              Buka preview di tab baru
            </a>
          </p>
          <iframe
            className="decision-stamp-preview"
            title="Preview penanda keputusan"
            src={preview + "#page=" + placement.page}
          />
          <label>
            <input
              type="checkbox"
              disabled={busy}
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
        disabled={busy || !preview || !fingerprint || !confirmed}
        onClick={() => void save()}
      >
        {busy ? "Memproses…" : "Simpan Edisi Final"}
      </button>
    </AdminFloatingWindow>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import type {
  BalanceImportPreview,
  BalanceImportResult,
} from "@/application/leave-balance/batch-import";

const statusLabels = {
  READY: "Siap diinisialisasi",
  SKIP: "Dilewati",
  ERROR: "Perlu diperiksa",
  SUCCEEDED: "Berhasil",
  FAILED: "Gagal",
};

export function AnnualBalanceImport({
  year,
  onCommitted,
  onBusyChange,
}: {
  year: number;
  onCommitted: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BalanceImportPreview | null>(null);
  const [result, setResult] = useState<BalanceImportResult | null>(null);
  const [batchId, setBatchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  async function download() {
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/annual-balances/batch/template?year=${year}`,
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Template saldo gagal diunduh.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `template-saldo-${year}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Template saldo gagal diunduh.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function run(commit: boolean) {
    if (!file || (commit && (!preview || !confirmed))) return;
    setBusy(true);
    onBusyChange(true);
    setMessage("");
    try {
      const body = new FormData();
      body.set("file", file);
      if (commit && preview) {
        body.set("batchId", batchId);
        body.set("previewDigest", preview.digest);
        body.set(
          "confirmedRows",
          JSON.stringify(
            preview.rows
              .filter((row) => row.status === "READY")
              .map((row) => row.rowNumber),
          ),
        );
      }
      const response = await fetch(
        `/api/admin/annual-balances/batch/${commit ? "commit" : "preview"}?year=${year}`,
        { method: "POST", body },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Impor saldo gagal.");
      if (commit) {
        setResult(data.result);
        await onCommitted();
      } else {
        setPreview(data.preview);
        setBatchId(crypto.randomUUID());
        setConfirmed(false);
        setResult(null);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Impor saldo gagal. Periksa koneksi lalu coba lagi dengan batch yang sama.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  function downloadResult() {
    if (!result) return;
    const csvCell = (value: string | number) => {
      let contents = String(value);
      if (/^[=+\-@\t\r]/.test(contents)) contents = "'" + contents;
      return '"' + contents.replaceAll('"', '""') + '"';
    };
    const records = [
      ["Baris", "NIP", "Nama Pegawai", "Tahun", "Status", "Keterangan"],
      ...result.rows.map((row) => [
        row.rowNumber,
        row.nip,
        row.fullName,
        row.entitlementYear,
        statusLabels[row.status],
        row.messages.join(" "),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            records.map((row) => row.map(csvCell).join(",")).join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `hasil-saldo-${year}-${batchId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const rows = result?.rows ?? preview?.rows ?? [];
  return (
    <section className="balance-import" aria-label="Impor saldo awal">
      <div className="balance-import-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void download()}
        >
          Unduh Template Saldo
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => setOpen(!open)}
        >
          {open ? "Tutup Import Saldo" : "Import Saldo"}
        </button>
      </div>
      {message && (
        <p className="feedback error" role="alert">
          {message}
        </p>
      )}
      {open && (
        <div className="employee-list-surface balance-import-content">
          <h2>Import Saldo Awal {year}</h2>
          <p>
            Unduh template pegawai aktif. Isi N-1, N-2, dan Dasar Administrasi
            berdasarkan data sah. N=12 dan Cuti Bersama=0 merupakan referensi
            tetap. Nama hanya referensi; pegawai dicocokkan berdasarkan NIP.
          </p>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void run(false);
            }}
          >
            <label>
              File Excel (.xlsx, maksimal 2 MB)
              <input
                type="file"
                accept=".xlsx"
                required
                disabled={busy}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setResult(null);
                  setConfirmed(false);
                  setBatchId("");
                  setMessage("");
                }}
              />
            </label>
            <button className="secondary-button" disabled={busy || !file}>
              {busy ? "Memproses…" : "Preview dan Validasi"}
            </button>
          </form>
          <p>
            Preview belum menulis saldo. Baris salah perlu diperbaiki; saldo
            yang sudah siap tidak diubah.
          </p>
          {preview && (
            <>
              <p role="status">
                Total {preview.totalRows} · Valid {preview.validRows} · Dilewati{" "}
                {preview.skippedRows} · Error {preview.errorRows}
              </p>
              {result && (
                <p className="feedback" role="status">
                  Berhasil {result.succeededRows} · Dilewati{" "}
                  {result.skippedRows} · Gagal {result.failedRows}
                </p>
              )}
              <div
                className="balance-import-table"
                tabIndex={0}
                role="region"
                aria-label="Hasil validasi per baris"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>NIP / Nama</th>
                      <th>Tahun</th>
                      <th>N-1</th>
                      <th>N-2</th>
                      <th>Status</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>
                          {row.nip}
                          <br />
                          {row.fullName}
                        </td>
                        <td>{row.entitlementYear}</td>
                        <td>{row.n1Days ?? "—"}</td>
                        <td>{row.n2Days ?? "—"}</td>
                        <td>{statusLabels[row.status]}</td>
                        <td>{row.messages.join(" ") || "Siap diproses."}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={downloadResult}
                >
                  Unduh Hasil Proses
                </button>
              )}
              {preview.validRows > 0 && (
                <div className="balance-import-confirm">
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />{" "}
                    Saya telah memeriksa preview dan mengonfirmasi{" "}
                    {preview.validRows} baris valid. Baris error tidak diproses.
                  </label>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || !confirmed}
                    onClick={() => void run(true)}
                  >
                    {busy
                      ? "Memproses…"
                      : result
                        ? "Coba Ulang Batch yang Sama"
                        : "Konfirmasi dan Inisialisasi Saldo"}
                  </button>
                </div>
              )}
              {preview.validRows === 0 && (
                <p>
                  Tidak ada baris valid yang dapat diinisialisasi. Perbaiki file
                  bila terdapat error lalu lakukan preview ulang.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

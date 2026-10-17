"use client";
import { useEffect, useRef, useState } from "react";
import { toBusinessDate } from "@/domain/business-date";
import { formatDate, formatDateTime } from "./indonesian-date";
import { AdminFloatingWindow } from "./admin-floating-window";
import { useDashboardJSON } from "./use-dashboard-json";
import type { ReportRow, Filters } from "@/application/reporting/contracts";
import "./reporting-workspace.css";
const statuses: Record<string, string> = {
  APPROVED: "Disetujui",
  SUBMITTED: "Diajukan",
  RETURNED_FOR_CORRECTION: "Perlu diperbaiki",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  ALL_NON_DRAFT: "Semua non-draf",
};
const leaveTypes: Record<string, string> = {
  ANNUAL: "Cuti Tahunan",
  SICK: "Cuti Sakit",
  IMPORTANT_REASON: "Cuti Alasan Penting",
  LARGE: "Cuti Besar",
  MATERNITY: "Cuti Melahirkan",
  CLTN: "CLTN",
};
type Page = {
  run: {
    id: string;
    capturedAt: string;
    expiresAt: string;
    rowCount: number;
    datasetChecksum: string;
    filters: Filters;
  };
  summary: { requests: number; employees: number; withBalanceReturn: number };
  items: ReportRow[];
  offset: number;
  limit: number;
  nextCursor: string | null;
  artifacts: { id: string; format: string; checksum: string; size: number }[];
};
class Failure extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
async function json(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: "no-store", ...init });
  const d = await r.json();
  if (!r.ok)
    throw new Failure(
      d.error ?? "Laporan tidak tersedia.",
      d.code ?? "REPORT_UNAVAILABLE",
    );
  return d;
}
export function ReportingWorkspace() {
  const today = toBusinessDate(new Date()),
    initialMonth = today.slice(0, 7),
    [year, month] = initialMonth.split("-").map(Number);
  const [filters, setFilters] = useState<Filters>({
    reportCode: "LEAVE_REQUESTS",
    from: `${initialMonth}-01`,
    to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    status: "APPROVED",
    activeState: "all",
    search: "",
  });
  const [page, setPage] = useState<Page | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [notice, setNotice] = useState(""),
    [filterOpen, setFilterOpen] = useState(false),
    [retry, setRetry] = useState<(() => void) | null>(null);
  const inFlight = useRef(false),
    generation = useRef(0),
    attempt = useRef<{ payload: string; key: string } | null>(null),
    exportKeys = useRef<Record<string, string>>({});
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const [lookup, setLookup] = useState(""),
    [lookupCursor, setLookupCursor] = useState<string | null>(null),
    [choice, setChoice] = useState<{ id: string; fullName: string } | null>(
      null,
    );
  const employees = useDashboardJSON<{
    employees: { id: string; fullName: string; nip: string }[];
    nextCursor: string | null;
  }>(
    `/api/dashboard/employees?${new URLSearchParams({ q: lookup, ...(lookupCursor ? { cursor: lookupCursor } : {}) })}`,
  );
  const types = useDashboardJSON<{ types: { id: string; name: string }[] }>(
    filters.reportCode === "PERMISSION_REQUESTS"
      ? `/api/dashboard/summary?kind=permission&status=all&from=${filters.from}&to=${filters.to}`
      : null,
  );
  const signature = JSON.stringify(filters),
    dirty = Boolean(page && JSON.stringify(page.run.filters) !== signature);
  function change(next: Partial<Filters>) {
    generation.current++;
    setFilters((f) => ({ ...f, ...next }));
    setError("");
    setCode("");
    setNotice("");
    setRetry(null);
  }
  function fail(e: unknown, again: () => void) {
    setError(e instanceof Error ? e.message : "Laporan gagal diproses.");
    setCode(e instanceof Failure ? e.code : "REPORT_UNAVAILABLE");
    setRetry(() => again);
  }
  async function create() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setCode("");
    setNotice("");
    const seq = generation.current,
      payload = JSON.stringify(filters);
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await json("/api/reports/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...filters,
          idempotencyKey: attempt.current.key,
        }),
      });
      if (seq !== generation.current) return;
      setPage(result);
      setFilters(result.run.filters);
      setPrevious([]);
      setCursor(null);
      exportKeys.current = {};
      setRetry(null);
      setNotice("Pratinjau dibekukan. PDF dan Excel memakai data yang sama.");
    } catch (e) {
      if (seq === generation.current) fail(e, () => void create());
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function navigate(next: string | null, back = false, newSize?: number) {
    if (inFlight.current || !page || dirty) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const seq = generation.current;
    try {
      const result = await json(
        `/api/reports/runs/${page.run.id}?${next ? `cursor=${encodeURIComponent(next)}&` : ""}limit=${newSize ?? page.limit}`,
      );
      if (seq !== generation.current) return;
      setPage(result);
      setCursor(next);
      setPrevious((v) =>
        newSize ? [] : back ? v.slice(0, -1) : [...v, cursor],
      );
      setRetry(null);
    } catch (e) {
      if (seq === generation.current)
        fail(e, () => void navigate(next, back, newSize));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function download(format: "PDF" | "XLSX") {
    if (inFlight.current || !page || dirty) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const seq = generation.current,
      runId = page.run.id;
    exportKeys.current[format] ??= crypto.randomUUID();
    try {
      const result = await json(`/api/reports/runs/${runId}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format,
          idempotencyKey: exportKeys.current[format],
        }),
      });
      if (seq !== generation.current) return;
      const r = await fetch(
        `/api/reports/runs/${runId}/artifacts/${result.artifact.id}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const e = await r.json();
        throw new Failure(e.error, e.code);
      }
      const blob = await r.blob();
      if (seq !== generation.current) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `si-cuti-${runId}.${format.toLowerCase()}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setRetry(null);
      setNotice(
        `Berkas mulai dilayani ${formatDateTime(r.headers.get("X-Report-Served-At") ?? new Date().toISOString())}. Periksa unduhan perangkat Anda.`,
      );
    } catch (e) {
      if (seq === generation.current) fail(e, () => void download(format));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const expired = code === "REPORT_EXPIRED";
  const form = (
    <div className="report-filters">
      <label>
        Dari tanggal
        <input
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          value={filters.from}
          onChange={(e) => change({ from: e.target.value })}
        />
      </label>
      <label>
        Sampai tanggal
        <input
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          value={filters.to}
          onChange={(e) => change({ to: e.target.value })}
        />
      </label>
      <label>
        Status
        <select
          aria-label="Status laporan"
          value={filters.status}
          onChange={(e) =>
            change({ status: e.target.value as Filters["status"] })
          }
        >
          {Object.entries(statuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        Jenis
        <select
          aria-label="Jenis laporan"
          value={filters.type ?? ""}
          onChange={(e) => change({ type: e.target.value || undefined })}
        >
          <option value="">Semua jenis</option>
          {(filters.reportCode === "LEAVE_REQUESTS"
            ? Object.entries(leaveTypes).map(([id, name]) => ({ id, name }))
            : (types.data?.types ?? [])
          ).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cari nama atau NIP
        <input
          value={filters.search}
          maxLength={100}
          onChange={(e) => change({ search: e.target.value })}
        />
      </label>
      <label>
        Unit kerja (persis)
        <input
          value={filters.workUnit ?? ""}
          maxLength={200}
          onChange={(e) => change({ workUnit: e.target.value || undefined })}
        />
      </label>
      <label>
        Keaktifan pegawai
        <select
          aria-label="Keaktifan pegawai"
          value={filters.activeState}
          onChange={(e) =>
            change({ activeState: e.target.value as Filters["activeState"] })
          }
        >
          <option value="all">Semua, termasuk nonaktif</option>
          <option value="active">Aktif</option>
          <option value="inactive">Nonaktif</option>
        </select>
      </label>
      <div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setLookup(filters.search);
            setLookupCursor(null);
          }}
        >
          Cari pilihan pegawai
        </button>
        <label>
          Pegawai
          <select
            aria-label="Pegawai laporan"
            value={filters.employeeId ?? ""}
            onChange={(e) => {
              setChoice(
                employees.data?.employees.find(
                  (v) => v.id === e.target.value,
                ) ?? null,
              );
              change({ employeeId: e.target.value || undefined });
            }}
          >
            <option value="">Semua pegawai</option>
            {choice &&
              !employees.data?.employees.some((v) => v.id === choice.id) && (
                <option value={choice.id}>{choice.fullName}</option>
              )}
            {employees.data?.employees.map((v) => (
              <option key={v.id} value={v.id}>
                {v.fullName} · {v.nip}
              </option>
            ))}
          </select>
        </label>
        {employees.data?.nextCursor && (
          <button
            type="button"
            onClick={() => setLookupCursor(employees.data!.nextCursor)}
          >
            Pilihan berikutnya
          </button>
        )}
      </div>
      {employees.error && (
        <p role="alert">
          Pilihan pegawai gagal dimuat.{" "}
          <button type="button" onClick={employees.reload}>
            Coba lagi
          </button>
        </p>
      )}
      {filters.reportCode === "PERMISSION_REQUESTS" && types.error && (
        <p role="alert">
          Jenis izin gagal dimuat.{" "}
          <button type="button" onClick={types.reload}>
            Coba lagi
          </button>
        </p>
      )}
      <p>
        Periode beririsan, maksimal 366 hari dan 1.000 baris. Status dan
        identitas memakai keadaan saat pratinjau dibuat.
      </p>
    </div>
  );
  return (
    <section className="report-workspace">
      <header>
        <p className="eyebrow">ADMINISTRASI</p>
        <h1>Laporan</h1>
        <p>
          Rekap pengajuan dari snapshot baca; bukan laporan pemakaian aktual
          atau surat keputusan.
        </p>
      </header>
      <div
        className="report-actions"
        role="group"
        aria-label="Laporan pengajuan"
      >
        {(["LEAVE_REQUESTS", "PERMISSION_REQUESTS"] as const).map((k) => (
          <button
            type="button"
            className={
              filters.reportCode === k ? "primary-button" : "secondary-button"
            }
            key={k}
            aria-pressed={filters.reportCode === k}
            onClick={() => change({ reportCode: k, type: undefined })}
          >
            {k === "LEAVE_REQUESTS" ? "Cuti" : "Izin"}
          </button>
        ))}
        <button
          type="button"
          className="secondary-button report-filter-trigger"
          onClick={() => setFilterOpen(true)}
        >
          Filter laporan
        </button>
      </div>
      <section
        className="report-panel report-desktop-filters"
        aria-label="Filter laporan"
      >
        {form}
      </section>
      {filterOpen && (
        <AdminFloatingWindow
          title="Filter laporan"
          onClose={() => setFilterOpen(false)}
        >
          {form}
          <button
            className="primary-button"
            type="button"
            onClick={() => setFilterOpen(false)}
          >
            Selesai
          </button>
        </AdminFloatingWindow>
      )}
      <div className="report-actions">
        <button
          className="primary-button"
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              (page && !dirty) ||
              ["REPORT_EXPIRED", "VERSION_UNAVAILABLE"].includes(code)
            )
              attempt.current = null;
            void create();
          }}
        >
          {page ? "Buat pratinjau baru" : "Buat pratinjau"}
        </button>
        {page &&
          (["PDF", "XLSX"] as const).map((f) => (
            <button
              className="secondary-button"
              type="button"
              disabled={busy || dirty || expired}
              key={f}
              onClick={() => void download(f)}
            >
              Unduh {f === "XLSX" ? "Excel" : "PDF"}
            </button>
          ))}
      </div>
      {busy && <p role="status">Memproses laporan…</p>}
      {notice && (
        <p role="status" className="report-notice">
          {notice}
        </p>
      )}
      {dirty && (
        <p role="status">
          Filter berubah. Buat pratinjau baru sebelum mengekspor.
        </p>
      )}
      {error && (
        <div role="alert" className="report-error">
          <strong>
            {[
              "REPORT_TOO_LARGE",
              "DATASET_TOO_LARGE",
              "ARTIFACT_TOO_LARGE",
              "PDF_TOO_LARGE",
              "PDF_ROW_TOO_TALL",
            ].includes(code)
              ? "Hasil terlalu besar"
              : expired
                ? "Laporan kedaluwarsa"
                : code === "AUDIT_UNAVAILABLE"
                  ? "Audit tidak tersedia"
                  : code === "RETRY_CONFLICT"
                    ? "Permintaan berbeda"
                    : code === "REPORT_BUSY"
                      ? "Laporan sedang diproses"
                      : "Laporan belum berhasil"}
          </strong>
          <p>{error}</p>
          {code === "RETRY_CONFLICT" && retry && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                attempt.current = null;
                exportKeys.current = {};
                retry();
              }}
            >
              Mulai permintaan baru
            </button>
          )}
          {retry && !expired && (
            <button type="button" disabled={busy} onClick={retry}>
              Coba lagi permintaan yang sama
            </button>
          )}
        </div>
      )}
      {page && (
        <section
          className="report-panel"
          aria-label="Pratinjau laporan"
          aria-busy={busy}
        >
          <h2>
            {page.run.filters.reportCode === "LEAVE_REQUESTS"
              ? "Rekap Pengajuan Cuti"
              : "Rekap Izin"}
          </h2>
          <p>
            {formatDate(page.run.filters.from)} —{" "}
            {formatDate(page.run.filters.to)} ·{" "}
            {statuses[page.run.filters.status]}
          </p>
          <p>
            Data dibaca {formatDateTime(page.run.capturedAt)}. Akses sampai{" "}
            {formatDateTime(page.run.expiresAt)}.
          </p>
          <p>
            {page.summary.requests} pengajuan · {page.summary.employees} pegawai
            unik
            {page.run.filters.reportCode === "LEAVE_REQUESTS"
              ? ` · ${page.summary.withBalanceReturn} pengajuan memiliki pengembalian saldo`
              : ""}
          </p>
          <div className="report-actions">
            <label>
              Baris per halaman{" "}
              <select
                aria-label="Baris per halaman"
                value={page.limit}
                disabled={busy || dirty}
                onChange={(e) =>
                  void navigate(null, false, Number(e.target.value))
                }
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span>Halaman {Math.floor(page.offset / page.limit) + 1}</span>
            <button
              type="button"
              aria-label="Halaman sebelumnya"
              disabled={busy || dirty || !previous.length}
              onClick={() => void navigate(previous.at(-1) ?? null, true)}
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Halaman berikutnya"
              disabled={busy || dirty || !page.nextCursor}
              onClick={() => void navigate(page.nextCursor)}
            >
              →
            </button>
          </div>
          {!page.items.length ? (
            <p>Tidak ada pengajuan sesuai filter.</p>
          ) : (
            <div className="report-table">
              <table>
                <thead>
                  <tr>
                    <th>Pegawai</th>
                    <th>Jenis / periode penuh</th>
                    <th>Status / revisi</th>
                    {page.run.filters.reportCode === "LEAVE_REQUESTS" && (
                      <th>Hari kerja tahunan (revisi)</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((r) => (
                    <tr key={r.requestId}>
                      <td data-label="Pegawai">
                        <strong>{r.name}</strong>
                        <br />
                        {r.nip}
                        <br />
                        {r.workUnit} · {r.active ? "Aktif" : "Nonaktif"}
                      </td>
                      <td data-label="Jenis / periode">
                        <strong>{r.typeLabel}</strong>
                        <br />
                        {formatDate(r.startDate)} — {formatDate(r.endDate)}
                        {r.hasBalanceReturn && (
                          <details>
                            <summary>Ada pengembalian saldo</summary>
                            <p>
                              Periode persetujuan tetap tampil; tanggal
                              penggunaan aktual tidak ditentukan dari jumlah
                              pengembalian.
                            </p>
                          </details>
                        )}
                      </td>
                      <td data-label="Status / revisi">
                        {statuses[r.status] ?? r.status} · Revisi{" "}
                        {r.revisionNumber}
                      </td>
                      {page.run.filters.reportCode === "LEAVE_REQUESTS" && (
                        <td data-label="Hari kerja tahunan">
                          {r.workingDays ?? "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="report-caption">
            Identitas master dan status saat snapshot, bukan histori pada akhir
            periode. Hari tahunan adalah nilai tersimpan untuk revisi penuh,
            bukan hari penggunaan aktual.
          </p>
          <nav className="report-actions" aria-label="Halaman pratinjau">
            <button
              type="button"
              disabled={busy || dirty || !previous.length}
              onClick={() => void navigate(previous.at(-1) ?? null, true)}
            >
              Sebelumnya
            </button>
            <span>
              {page.run.rowCount
                ? `${page.offset + 1}–${Math.min(page.offset + page.limit, page.run.rowCount)} dari ${page.run.rowCount}`
                : "0 baris"}
            </span>
            <button
              type="button"
              disabled={busy || dirty || !page.nextCursor}
              onClick={() => void navigate(page.nextCursor)}
            >
              Berikutnya
            </button>
          </nav>
          <details>
            <summary>Identitas snapshot</summary>
            <p className="report-caption">
              ID internal: {page.run.id}
              <br />
              Checksum dataset: {page.run.datasetChecksum}
            </p>
          </details>
        </section>
      )}
      {!page && !busy && !error && (
        <p>
          Pilih filter lalu buat pratinjau. Belum ada laporan yang dihasilkan.
        </p>
      )}
    </section>
  );
}

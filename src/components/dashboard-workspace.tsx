"use client";
import { useCallback, useEffect, useState } from "react";
import { formatDate, formatMonth, formatDateTime } from "./indonesian-date";
import { toBusinessDate } from "@/domain/business-date";
import { AdminFloatingWindow } from "./admin-floating-window";
import { useDashboardJSON } from "./use-dashboard-json";
import { CalendarOverlayAdmin } from "./calendar-overlay-admin";
import "./dashboard-workspace.css";
const statusLabels: Record<string, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Menunggu tinjauan",
  RETURNED_FOR_CORRECTION: "Perlu diperbaiki",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  all: "Semua status non-draf",
};
const kindLabel = { leave: "Cuti", permission: "Izin" };
type Summary = {
  businessDate: string;
  asOf: string;
  fixed: {
    pendingLeave?: number;
    pendingPermission?: number;
    approvedTodayEmployees?: number;
    ownLeave?: Record<string, number>;
    ownPermission?: Record<string, number>;
  };
  groups: {
    typeId: string;
    typeLabel: string;
    status: string;
    count: number;
  }[];
  types: { id: string; name: string }[];
};
type Calendar = {
  days: { date: string; requestCount: number }[];
  uniqueRequestCount: number;
};
type Agenda = {
  items: {
    requestId: string;
    kind: string;
    status: string;
    typeLabel: string;
    startDate: string;
    endDate: string;
    hasBalanceReturn: boolean;
    employee?: { id: string; fullName: string };
  }[];
  total: number;
  nextCursor: string | null;
};
type Balance = {
  year: number;
  readiness: string;
  totalAvailableDays: number | null;
  buckets: { bucket: string; availableDays: number }[];
};
export type OverlayDataset = {
  status: string;
  year: number;
  dataset: null | {
    version: number;
    sourceReference: string;
    sourceUrl: string;
    sourcePublishedOn: string;
    publishedAt: string;
    events: {
      date: string;
      name: string;
      category: "PUBLIC_HOLIDAY" | "JOINT_LEAVE";
    }[];
  };
};
function ResourceState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  children: React.ReactNode;
}) {
  if (loading) return <p role="status">Memuat data…</p>;
  if (error)
    return (
      <div className="m6-error" role="alert">
        <p>{error}</p>
        <button className="secondary-button" onClick={retry} type="button">
          Coba lagi
        </button>
      </div>
    );
  return <>{children}</>;
}
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return { from: "", to: "" };
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}
export function DashboardWorkspace({ admin }: { admin: boolean }) {
  const [day, setDay] = useState(() => toBusinessDate(new Date()));
  const [month, setMonth] = useState(() => day.slice(0, 7));
  const [range, setRange] = useState(() => monthRange(month));
  const [kind, setKind] = useState<"leave" | "permission">("leave");
  const [status, setStatus] = useState("APPROVED");
  const [type, setType] = useState("");
  const [employee, setEmployee] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [lookup, setLookup] = useState("");
  const [lookupCursor, setLookupCursor] = useState<string | null>(null);
  const [employeeChoice, setEmployeeChoice] = useState<{
    id: string;
    fullName: string;
  } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [showMonth, setShowMonth] = useState(false);
  const [showHoliday, setShowHoliday] = useState(true);
  const [showJoint, setShowJoint] = useState(true);
  const params = new URLSearchParams({
    kind,
    status,
    from: range.from,
    to: range.to,
    ...(type ? { type } : {}),
    ...(employee ? { employeeId: employee } : {}),
  });
  const signature = params.toString();
  const fixedSummary = useDashboardJSON<Summary>(
    `/api/dashboard/summary?kind=leave&from=${day.slice(0, 7)}-01&to=${day}`,
  );
  const summary = useDashboardJSON<Summary>(
    `/api/dashboard/summary?${signature}`,
  );
  const calendarParams = new URLSearchParams({
    kind,
    status,
    ...monthRange(month),
    ...(type ? { type } : {}),
    ...(employee ? { employeeId: employee } : {}),
  });
  const calendar = useDashboardJSON<Calendar>(
    `/api/calendar?${calendarParams}`,
  );
  const agendaParams = new URLSearchParams(signature);
  if (selectedDay) {
    agendaParams.set("from", selectedDay);
    agendaParams.set("to", selectedDay);
  }
  if (cursor) agendaParams.set("cursor", cursor);
  const agenda = useDashboardJSON<Agenda>(
    `/api/calendar/agenda?${agendaParams}`,
  );
  const overlay = useDashboardJSON<OverlayDataset>(
    `/api/calendar/overlays?year=${month.slice(0, 4)}`,
  );
  const balance = useDashboardJSON<Balance>(
    admin ? null : "/api/dashboard/balance",
  );
  const lookupParams = new URLSearchParams({
    q: lookup,
    ...(lookupCursor ? { cursor: lookupCursor } : {}),
  });
  const employees = useDashboardJSON<{
    employees: { id: string; fullName: string; nip: string }[];
    nextCursor: string | null;
  }>(admin ? `/api/dashboard/employees?${lookupParams}` : null);
  const resetPages = () => {
    setCursor(null);
    setPrevious([]);
    setSelectedDay("");
  };
  const reloadFixed = fixedSummary.reload,
    reloadSummary = summary.reload,
    reloadCalendar = calendar.reload,
    reloadAgenda = agenda.reload,
    reloadOverlay = overlay.reload,
    reloadBalance = balance.reload;
  const refreshAll = useCallback(() => {
    reloadFixed();
    reloadSummary();
    reloadCalendar();
    reloadAgenda();
    reloadOverlay();
    if (!admin) reloadBalance();
  }, [
    reloadFixed,
    reloadSummary,
    reloadCalendar,
    reloadAgenda,
    reloadOverlay,
    reloadBalance,
    admin,
  ]);
  useEffect(() => {
    function tick() {
      if (document.visibilityState !== "visible") return;
      setDay(toBusinessDate(new Date()));
      refreshAll();
    }
    const timer = setInterval(() => {
      if (toBusinessDate(new Date()) !== day) tick();
    }, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [day, refreshAll]);
  function navigateMonth(delta: number) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const next = date.toISOString().slice(0, 7);
    setMonth(next);
    setRange(monthRange(next));
    resetPages();
  }
  const overlayEvents = (overlay.data?.dataset?.events ?? []).filter((v) =>
    v.category === "PUBLIC_HOLIDAY" ? showHoliday : showJoint,
  );
  const filters = (
    <div className="m6-filters">
      <label>
        Dari tanggal
        <input
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          value={range.from}
          onChange={(e) => {
            setRange({ ...range, from: e.target.value });
            resetPages();
          }}
        />
      </label>
      <label>
        Sampai tanggal
        <input
          type="date"
          min="1900-01-01"
          max="9999-12-31"
          value={range.to}
          onChange={(e) => {
            setRange({ ...range, to: e.target.value });
            resetPages();
          }}
        />
      </label>
      <label>
        Status
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetPages();
          }}
        >
          {[
            "APPROVED",
            "SUBMITTED",
            "RETURNED_FOR_CORRECTION",
            "REJECTED",
            "CANCELLED",
            "all",
          ].map((v) => (
            <option key={v} value={v}>
              {statusLabels[v]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Jenis
        <select
          aria-label="Jenis"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            resetPages();
          }}
        >
          <option value="">Semua jenis</option>
          {summary.data?.types.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {admin && (
        <div className="m6-employee-search">
          <label>
            Cari pegawai
            <input
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
              maxLength={100}
              placeholder="Nama atau NIP"
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setLookup(employeeQuery);
              setLookupCursor(null);
            }}
          >
            Cari pegawai
          </button>
          <label>
            Pegawai
            <select
              aria-label="Filter pegawai"
              value={employee}
              onChange={(e) => {
                const found = employees.data?.employees.find(
                  (v) => v.id === e.target.value,
                );
                setEmployeeChoice(found ?? null);
                setEmployee(e.target.value);
                resetPages();
              }}
            >
              <option value="">Semua pegawai</option>
              {employeeChoice &&
                !employees.data?.employees.some(
                  (v) => v.id === employeeChoice.id,
                ) && (
                  <option value={employeeChoice.id}>
                    {employeeChoice.fullName}
                  </option>
                )}
              {employees.data?.employees.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.fullName} · {v.nip}
                </option>
              ))}
            </select>
          </label>
          {employees.error && (
            <p role="alert">
              {employees.error}
              <button type="button" onClick={employees.reload}>
                Coba lagi
              </button>
            </p>
          )}
          {employees.data?.nextCursor && (
            <button
              type="button"
              onClick={() => setLookupCursor(employees.data!.nextCursor)}
            >
              Pegawai berikutnya
            </button>
          )}
          {lookupCursor && (
            <button type="button" onClick={() => setLookupCursor(null)}>
              Awal daftar pegawai
            </button>
          )}
        </div>
      )}
      <button
        className="secondary-button"
        type="button"
        onClick={() => {
          setStatus("APPROVED");
          setType("");
          setEmployee("");
          setEmployeeChoice(null);
          setMonth(day.slice(0, 7));
          setRange(monthRange(day.slice(0, 7)));
          resetPages();
        }}
      >
        Reset filter
      </button>
      <p>
        Filter ini mengatur tabel distribusi dan agenda. Kalender memakai bulan
        yang dipilih, dengan jenis/status/pegawai yang sama. Maksimal rentang
        agenda 366 hari.
      </p>
    </div>
  );
  const Distribution = admin ? "section" : "details";
  const DistributionTitle = admin ? "h2" : "summary";
  const gridStart = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const offset = (gridStart + 6) % 7;
  return (
    <section className="m6-workspace">
      <header className="m6-page-heading">
        <div>
          <p className="eyebrow">DASHBOARD & KALENDER</p>
          <h1>{admin ? "Ringkasan administrasi" : "Beranda saya"}</h1>
          <p>
            Periode pengajuan, bukan catatan kehadiran atau penggunaan aktual.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={refreshAll}>
          Perbarui tampilan
        </button>
      </header>
      {!admin && (
        <nav className="employee-quick-actions" aria-label="Aksi utama">
          <a
            className="primary-button button-link"
            href="/pengajuan?kind=leave&new=1"
          >
            Ajukan Cuti
          </a>
          <a
            className="secondary-button button-link"
            href="/pengajuan?kind=permission&new=1"
          >
            Ajukan Izin
          </a>
          <a
            className="secondary-button button-link"
            href="/klaim-cuti-bersama"
          >
            Klaim Cuti Bersama
          </a>
        </nav>
      )}
      {!admin && (
        <section className="m6-panel" aria-label="Saldo saya">
          <h2>Saldo Cuti Tahunan tersedia</h2>
          <ResourceState
            loading={balance.loading}
            error={balance.error}
            retry={balance.reload}
          >
            {balance.data && (
              <>
                <p>
                  Tahun saldo {balance.data.year} · Tidak mengikuti filter
                  kalender
                </p>
                {balance.data.readiness !== "INITIALIZED" ? (
                  <p>
                    {balance.data.readiness === "PARTIAL"
                      ? "Saldo perlu diperiksa Admin; jumlah tersedia belum dapat ditampilkan."
                      : "Saldo belum disiapkan Admin; jumlah tersedia belum dapat ditampilkan."}
                  </p>
                ) : (
                  <div>
                    <p>
                      Total tersedia:{" "}
                      <strong>{balance.data.totalAvailableDays} hari</strong>
                    </p>
                    <div className="m6-balance">
                      {balance.data.buckets.map((v) => (
                        <div key={v.bucket}>
                          <span>
                            {
                              (
                                {
                                  N: "Cuti N",
                                  N1: "Cuti N-1",
                                  N2: "Cuti N-2",
                                  JOINT_LEAVE_CLAIM: "Klaim Cuti Bersama",
                                } as Record<string, string>
                              )[v.bucket]
                            }
                          </span>
                          <strong>{v.availableDays} hari</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </ResourceState>
        </section>
      )}
      <section className="m6-panel" aria-label="Ringkasan tetap">
        <ResourceState
          loading={fixedSummary.loading}
          error={fixedSummary.error}
          retry={fixedSummary.reload}
        >
          {fixedSummary.data && (
            <>
              <div className="m6-stats">
                {admin ? (
                  <>
                    <div>
                      <span>Menunggu tinjauan — Cuti</span>
                      <strong>{fixedSummary.data.fixed.pendingLeave}</strong>
                      <small>Semua periode · Semua pegawai</small>
                    </div>
                    <div>
                      <span>Menunggu tinjauan — Izin</span>
                      <strong>
                        {fixedSummary.data.fixed.pendingPermission}
                      </strong>
                      <small>Semua periode · Semua pegawai</small>
                    </div>
                    <div>
                      <span>Pegawai dalam periode cuti disetujui hari ini</span>
                      <strong>
                        {fixedSummary.data.fixed.approvedTodayEmployees}
                      </strong>
                      <small>
                        {formatDate(fixedSummary.data.businessDate)} · WIB ·
                        Pegawai unik
                      </small>
                    </div>
                  </>
                ) : (
                  (["leave", "permission"] as const).map((k) => (
                    <div key={k}>
                      <span>Pengajuan saya — {kindLabel[k]}</span>
                      {["DRAFT", "SUBMITTED", "RETURNED_FOR_CORRECTION"].map(
                        (s) => (
                          <p key={s}>
                            <a href={`/pengajuan?kind=${k}`}>
                              {s === "SUBMITTED" ? "Diajukan" : statusLabels[s]}
                            </a>{" "}
                            <b>
                              {(k === "leave"
                                ? fixedSummary.data!.fixed.ownLeave
                                : fixedSummary.data!.fixed.ownPermission)?.[
                                s
                              ] ?? 0}
                            </b>
                          </p>
                        ),
                      )}
                      <small>Semua periode · Milik sendiri</small>
                      <details className="employee-action-hint">
                        <summary>Langkah selanjutnya</summary>
                        <p>
                          Draf: lengkapi dan ajukan. Perlu diperbaiki: buka
                          catatan Admin. Diajukan: periksa formulir dan
                          kelengkapan berkas.
                        </p>
                      </details>
                    </div>
                  ))
                )}
              </div>
              <p className="m6-caption">
                Periode disetujui tetap dihitung meskipun ada pengembalian
                saldo. Status diajukan belum memastikan kelengkapan bukti.
              </p>
            </>
          )}
        </ResourceState>
      </section>
      <div className="m6-tabs" role="group" aria-label="Kategori pengajuan">
        {(["leave", "permission"] as const).map((k) => (
          <button
            type="button"
            className={kind === k ? "active" : ""}
            aria-pressed={kind === k}
            key={k}
            onClick={() => {
              setKind(k);
              setType("");
              resetPages();
            }}
          >
            {kindLabel[k]}
          </button>
        ))}
        <button
          type="button"
          className="m6-filter-trigger"
          onClick={() => setFilterOpen(true)}
        >
          Filter periode
        </button>
      </div>
      <section
        className="m6-panel m6-desktop-filters"
        aria-label="Filter periode"
      >
        {filters}
      </section>
      {filterOpen && (
        <AdminFloatingWindow
          title="Filter periode pengajuan"
          onClose={() => setFilterOpen(false)}
        >
          {filters}
          <button
            type="button"
            className="primary-button"
            onClick={() => setFilterOpen(false)}
          >
            Selesai
          </button>
        </AdminFloatingWindow>
      )}
      <Distribution className="m6-panel employee-distribution">
        <DistributionTitle>
          Distribusi {kindLabel[kind]} — {formatDate(range.from)} sampai{" "}
          {formatDate(range.to)}
        </DistributionTitle>
        <p className="m6-caption">
          Jumlah pengajuan yang periodenya beririsan, status saat dibaca. Satu
          pengajuan dihitung sekali.
        </p>
        <ResourceState
          loading={summary.loading}
          error={summary.error}
          retry={summary.reload}
        >
          {summary.data?.groups.length ? (
            <div className="m6-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Jenis</th>
                    <th>Status</th>
                    <th>Pengajuan</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.groups.map((v) => (
                    <tr key={`${v.typeId}-${v.status}`}>
                      <td>{v.typeLabel}</td>
                      <td>{statusLabels[v.status]}</td>
                      <td>{v.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Tidak ada pengajuan pada filter ini.</p>
          )}
        </ResourceState>
      </Distribution>
      <section className="m6-panel">
        <header className="m6-calendar-header">
          <h2>
            Kalender {kindLabel[kind]} · {formatMonth(month)}
          </h2>
          <div>
            <button
              type="button"
              aria-label="Bulan sebelumnya"
              onClick={() => navigateMonth(-1)}
            >
              ←
            </button>
            <label>
              Bulan
              <input
                type="month"
                min="1900-01"
                max="9999-12"
                value={month}
                onChange={(e) => {
                  if (e.target.value) {
                    setMonth(e.target.value);
                    setRange(monthRange(e.target.value));
                    resetPages();
                  }
                }}
              />
            </label>
            <button
              type="button"
              aria-label="Bulan berikutnya"
              onClick={() => navigateMonth(1)}
            >
              →
            </button>
            <button
              type="button"
              onClick={() => {
                setMonth(day.slice(0, 7));
                setRange(monthRange(day.slice(0, 7)));
                resetPages();
              }}
            >
              Hari ini
            </button>
          </div>
        </header>
        <p>
          {statusLabels[status]} · WIB. Hitungan sel adalah pengajuan pada
          tanggal itu, bukan hari saldo.
        </p>
        <div className="m6-overlay-controls">
          <label>
            <input
              type="checkbox"
              checked={showHoliday}
              onChange={(e) => setShowHoliday(e.target.checked)}
            />{" "}
            Libur Nasional
          </label>
          <label>
            <input
              type="checkbox"
              checked={showJoint}
              onChange={(e) => setShowJoint(e.target.checked)}
            />{" "}
            Cuti Bersama
          </label>
          {admin && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setOverlayOpen(true)}
            >
              Kelola kalender hari libur
            </button>
          )}
        </div>
        <ResourceState
          loading={overlay.loading}
          error={overlay.error}
          retry={overlay.reload}
        >
          {overlay.data?.dataset ? (
            <p className="m6-caption">
              Input Admin berdasarkan dokumen resmi · Versi{" "}
              {overlay.data.dataset.version} ·{" "}
              {overlay.data.dataset.sourceReference} (
              {formatDate(overlay.data.dataset.sourcePublishedOn)}) · Terbit{" "}
              {formatDateTime(overlay.data.dataset.publishedAt)}. Tidak
              tersinkronisasi otomatis.
              {overlay.data.dataset.sourceUrl && (
                <>
                  {" "}
                  <a
                    href={overlay.data.dataset.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Sumber resmi
                  </a>
                </>
              )}
            </p>
          ) : (
            <p>
              Data libur resmi tahun {month.slice(0, 4)} belum tersedia.
              Kalender pengajuan tetap berfungsi.
            </p>
          )}
        </ResourceState>
        <button
          className="m6-calendar-toggle secondary-button"
          type="button"
          aria-expanded={showMonth}
          aria-controls="m6-month-region"
          onClick={() => setShowMonth((v) => !v)}
        >
          {showMonth
            ? "Sembunyikan kalender bulanan"
            : "Tampilkan kalender bulanan"}
        </button>
        <div
          id="m6-month-region"
          className={`m6-month-region${showMonth ? " expanded" : ""}`}
        >
          <ResourceState
            loading={calendar.loading}
            error={calendar.error}
            retry={calendar.reload}
          >
            <div
              className="m6-month-grid"
              aria-label={`Kalender ${formatMonth(month)}`}
            >
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((v) => (
                <span className="m6-weekday" key={v}>
                  {v}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`pad-${i}`} aria-hidden="true" />
              ))}
              {calendar.data?.days.map((v) => {
                const events = overlayEvents.filter((e) => e.date === v.date);
                return (
                  <button
                    className={`${v.date === day ? "today" : ""} ${v.date === selectedDay ? "selected" : ""}`}
                    key={v.date}
                    type="button"
                    aria-label={`${formatDate(v.date)}, ${v.requestCount} pengajuan${events.length ? `, ${events.map((e) => e.name).join(", ")}` : ""}`}
                    onClick={() => {
                      setSelectedDay(v.date);
                      setCursor(null);
                      setPrevious([]);
                    }}
                  >
                    <span>{Number(v.date.slice(-2))}</span>
                    {v.requestCount > 0 && (
                      <b>
                        {v.requestCount} {kindLabel[kind]}
                      </b>
                    )}
                    {events.map((e) => (
                      <small
                        className={
                          e.category === "PUBLIC_HOLIDAY" ? "holiday" : "joint"
                        }
                        key={e.category}
                      >
                        {e.name}
                      </small>
                    ))}
                  </button>
                );
              })}
            </div>
            <p className="m6-caption">
              {calendar.data?.uniqueRequestCount} pengajuan unik pada bulan ini;
              jumlah sel tidak boleh dijumlahkan sebagai total unik.
            </p>
          </ResourceState>
        </div>
      </section>
      <section className="m6-panel" aria-label="Agenda pengajuan">
        <header className="m6-calendar-header">
          <h2>
            Agenda {kindLabel[kind]}{" "}
            {selectedDay
              ? `tanggal ${formatDate(selectedDay)}`
              : "periode terpilih"}
          </h2>
          {selectedDay && (
            <button type="button" onClick={resetPages}>
              Kembali ke rentang filter
            </button>
          )}
        </header>
        <ResourceState
          loading={agenda.loading}
          error={agenda.error}
          retry={agenda.reload}
        >
          {agenda.data && (
            <>
              <p>
                {agenda.data.total} pengajuan · {statusLabels[status]} ·{" "}
                {selectedDay
                  ? formatDate(selectedDay)
                  : `${formatDate(range.from)} sampai ${formatDate(range.to)}`}
              </p>
              {agenda.data.items.length ? (
                agenda.data.items.map((v) => (
                  <article className="m6-agenda-item" key={v.requestId}>
                    <div>
                      <strong>{v.employee?.fullName ?? v.typeLabel}</strong>
                      <p>
                        {v.employee ? `${v.typeLabel} · ` : ""}
                        {statusLabels[v.status]}
                      </p>
                      <p>
                        {formatDate(v.startDate)} — {formatDate(v.endDate)}
                        {v.startDate < (selectedDay || range.from) ||
                        v.endDate > (selectedDay || range.to)
                          ? " · Berlanjut di luar tampilan"
                          : ""}
                      </p>
                      {v.hasBalanceReturn && (
                        <details className="m6-return">
                          <summary>Ada pengembalian saldo</summary>
                          <p>
                            Periode persetujuan tetap ditampilkan. Tanggal
                            penggunaan aktual belum ditentukan dari jumlah hari
                            pengembalian.
                          </p>
                        </details>
                      )}
                    </div>
                    <a
                      className="secondary-button button-link"
                      href={`/pengajuan?kind=${v.kind}&request=${v.requestId}`}
                    >
                      Lihat pengajuan
                    </a>
                  </article>
                ))
              ) : (
                <p>Tidak ada pengajuan pada filter ini.</p>
              )}
              <nav className="m6-pagination" aria-label="Halaman agenda">
                <button
                  type="button"
                  disabled={!previous.length}
                  onClick={() => {
                    setCursor(previous.at(-1) ?? null);
                    setPrevious((v) => v.slice(0, -1));
                  }}
                >
                  Sebelumnya
                </button>
                <span>Halaman {previous.length + 1}</span>
                <button
                  type="button"
                  disabled={!agenda.data.nextCursor}
                  onClick={() => {
                    setPrevious((v) => [...v, cursor]);
                    setCursor(agenda.data!.nextCursor);
                  }}
                >
                  Berikutnya
                </button>
              </nav>
            </>
          )}
        </ResourceState>
      </section>
      <section className="m6-panel" aria-label="Kalender hari libur">
        <h2>Kalender hari libur · {formatMonth(month)}</h2>
        <ResourceState
          loading={overlay.loading}
          error={overlay.error}
          retry={overlay.reload}
        >
          {overlayEvents
            .filter((v) => v.date.startsWith(month))
            .map((v) => (
              <p key={`${v.date}-${v.category}`}>
                {formatDate(v.date)} ·{" "}
                {v.category === "PUBLIC_HOLIDAY"
                  ? "Libur Nasional"
                  : "Cuti Bersama"}{" "}
                · {v.name}
              </p>
            ))}
          {!overlayEvents.some((v) => v.date.startsWith(month)) && (
            <p>
              {overlay.data?.dataset
                ? "Tidak ada tanggal pada kategori yang dipilih bulan ini; bukan bukti kelengkapan kalender kerja."
                : "Data tahun ini belum tersedia."}
            </p>
          )}
          <p className="m6-caption">
            Kalender hari libur tidak mengubah saldo, perhitungan hari kerja,
            persetujuan atau syarat klaim; bukan bukti pegawai sedang cuti.
          </p>
        </ResourceState>
      </section>
      {overlayOpen && (
        <CalendarOverlayAdmin
          year={Number(month.slice(0, 4))}
          onClose={() => setOverlayOpen(false)}
          onPublished={overlay.reload}
        />
      )}
    </section>
  );
}

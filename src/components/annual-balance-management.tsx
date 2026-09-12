"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AnnualBalanceAdministrationDetail } from "@/application/leave-balance/administration";
import type { AnnualBalanceBucket } from "@/domain/leave-balance";

const labels: Record<AnnualBalanceBucket, string> = {
  N: "Cuti Tahunan Tahun Berjalan",
  N1: "Sisa Tahun Sebelumnya",
  N2: "Hak N-2",
  JOINT_LEAVE_CLAIM: "Cuti Bersama",
};

const order: AnnualBalanceBucket[] = ["N", "N1", "N2", "JOINT_LEAVE_CLAIM"];

type ReadinessFilter = "all" | "INITIALIZED" | "UNINITIALIZED" | "PARTIAL";

function readinessLabel(
  item: AnnualBalanceAdministrationDetail,
  year: number,
) {
  if (item.readiness === "INITIALIZED") return `Saldo ${year} siap`;
  if (item.readiness === "PARTIAL") return "Data saldo perlu diperiksa";
  return `Saldo ${year} belum diinisialisasi`;
}

function BalanceCards({ item }: { item: AnnualBalanceAdministrationDetail }) {
  return (
    <div className="balance-card-grid">
      {order.map((bucket) => {
        const balance = item.balances[bucket];
        return (
          <article className="balance-card" key={bucket}>
            <span>{labels[bucket]}</span>
            <strong>{balance?.availableDays ?? 0} hari</strong>
            <small>
              Terpakai {balance?.committedDays ?? 0} · Direservasi{" "}
              {balance?.reservedDays ?? 0} · Hak {balance?.grantedDays ?? 0}
            </small>
          </article>
        );
      })}
    </div>
  );
}

export function AnnualBalanceManagement() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [items, setItems] = useState<AnnualBalanceAdministrationDetail[]>([]);
  const [selected, setSelected] =
    useState<AnnualBalanceAdministrationDetail | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [n1Days, setN1Days] = useState(0);
  const [n2Days, setN2Days] = useState(0);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [readinessFilter, setReadinessFilter] =
    useState<ReadinessFilter>("all");

  const summary = useMemo(
    () => ({
      total: items.length,
      ready: items.filter((item) => item.readiness === "INITIALIZED").length,
      pending: items.filter(
        (item) =>
          item.readiness !== "INITIALIZED" && item.readiness !== "PARTIAL",
      ).length,
      review: items.filter((item) => item.readiness === "PARTIAL").length,
    }),
    [items],
  );

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
    return items.filter((item) => {
      const readinessMatches =
        readinessFilter === "all" || item.readiness === readinessFilter;
      if (!readinessMatches) return false;
      if (!normalizedQuery) return true;
      return [item.fullName, item.nip].some((value) =>
        value.toLocaleLowerCase("id-ID").includes(normalizedQuery),
      );
    });
  }, [items, query, readinessFilter]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/annual-balances?year=${year}`);
      const data = await response.json();
      if (!response.ok)
        setMessage(data.error ?? "Data saldo cuti gagal dimuat.");
      else setItems(data.balances);
    } catch {
      setMessage(
        "Data saldo cuti gagal dimuat. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const response = await fetch(
          `/api/admin/annual-balances?year=${year}`,
        );
        const data = await response.json();
        if (!active) return;
        if (!response.ok)
          setMessage(data.error ?? "Data saldo cuti gagal dimuat.");
        else setItems(data.balances);
      } catch {
        if (active)
          setMessage(
            "Data saldo cuti gagal dimuat. Periksa koneksi lalu coba lagi.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [year]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

  async function showDetail(employeeId: string) {
    setMessage("");
    const response = await fetch(
      `/api/admin/annual-balances/${employeeId}?year=${year}`,
    );
    const data = await response.json();
    if (!response.ok)
      return setMessage(data.error ?? "Detail saldo gagal dimuat.");
    setSelected(data.balance);
    setFormOpen(false);
  }

  async function initialize(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/annual-balances/${selected.employeeId}/initialize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entitlementYear: year,
            n1Days,
            n2Days,
            reason,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        return setMessage(data.error ?? "Inisialisasi saldo gagal.");
      setSelected(data.balance);
      setFormOpen(false);
      setReason("");
      setN1Days(0);
      setN2Days(0);
      setMessage(`Saldo ${year} berhasil diinisialisasi.`);
      await load();
    } catch {
      setMessage("Inisialisasi saldo gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="employee-page balance-page" id="saldo-cuti">
      <header className="employee-page-header balance-page-header">
        <div>
          <p className="eyebrow">ADMINISTRASI SALDO</p>
          <h1>Manajemen Saldo Cuti</h1>
          <p>Siapkan saldo awal berdasarkan data kepegawaian yang sah.</p>
        </div>
        <label className="year-selector">
          <span>Tahun administrasi</span>
          <select
            value={year}
            onChange={(event) => {
              setLoading(true);
              setYear(Number(event.target.value));
              setSelected(null);
              setMessage("");
              setQuery("");
              setReadinessFilter("all");
            }}
          >
            {[year - 1, year, year + 1].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </header>

      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="balance-summary-grid" aria-label="Ringkasan saldo cuti">
            <article>
              <span>PEGAWAI AKTIF</span>
              <strong>{summary.total}</strong>
              <small>Terdaftar pada tahun {year}</small>
            </article>
            <article className="ready">
              <span>SALDO SIAP</span>
              <strong>{summary.ready}</strong>
              <small>Sudah dapat digunakan</small>
            </article>
            <article className="pending">
              <span>BELUM DIINISIALISASI</span>
              <strong>{summary.pending}</strong>
              <small>Perlu disiapkan admin</small>
            </article>
            <article className="review">
              <span>PERLU DIPERIKSA</span>
              <strong>{summary.review}</strong>
              <small>Data belum lengkap</small>
            </article>
          </div>

          <div className="balance-toolbar" aria-label="Pencarian dan filter saldo">
            <label className="employee-search">
              <span className="sr-only">Cari pegawai</span>
              <span className="search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau NIP"
              />
            </label>
            <label className="employee-filter">
              <span>Status saldo</span>
              <select
                value={readinessFilter}
                onChange={(event) =>
                  setReadinessFilter(event.target.value as ReadinessFilter)
                }
              >
                <option value="all">Semua status</option>
                <option value="INITIALIZED">Saldo siap</option>
                <option value="UNINITIALIZED">Belum diinisialisasi</option>
                <option value="PARTIAL">Perlu diperiksa</option>
              </select>
            </label>
          </div>
        </>
      )}

      {loading ? (
        <div className="empty-state" aria-live="polite">
          Memuat saldo cuti…
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <strong>Belum ada pegawai aktif</strong>
          <span>Data saldo akan muncul setelah pegawai aktif tersedia.</span>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">
          <strong>Data saldo tidak ditemukan</strong>
          <span>Ubah kata kunci atau filter untuk melihat data lainnya.</span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setQuery("");
              setReadinessFilter("all");
            }}
          >
            Reset pencarian
          </button>
        </div>
      ) : (
        <div className="balance-layout">
          <div className="employee-list-surface">
            <div className="list-heading balance-list-heading">
              <div>
                <h2>Daftar Saldo Pegawai</h2>
                <p>
                  {query || readinessFilter !== "all"
                    ? `${visibleItems.length} dari ${items.length} pegawai ditampilkan`
                    : `${items.length} pegawai aktif`}
                </p>
              </div>
              <span className="balance-year-chip">{year}</span>
            </div>

            <div className="balance-employee-list">
              {visibleItems.map((item) => (
                <article
                  key={item.employeeId}
                  className="balance-employee-row"
                >
                  <div className="balance-person">
                    <span className="balance-avatar" aria-hidden="true">
                      {item.fullName
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <div>
                      <strong>{item.fullName}</strong>
                      <span>NIP {item.nip}</span>
                      <em
                        className={`status-badge ${
                          item.readiness === "INITIALIZED"
                            ? "success"
                            : item.readiness === "PARTIAL"
                              ? "inactive"
                              : "neutral"
                        }`}
                      >
                        {readinessLabel(item, year)}
                      </em>
                    </div>
                  </div>

                  <div className="balance-row-action">
                    <span>Saldo tersedia</span>
                    <b>{item.regularAvailableDays} hari</b>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void showDetail(item.employeeId)}
                    >
                      Lihat detail
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop">
          <button
            className="balance-modal-scrim"
            type="button"
            aria-label="Tutup detail saldo"
            onClick={() => setSelected(null)}
          />
          <section
            className="balance-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="balance-title"
          >
            <header className="balance-detail-header">
              <div>
                <p className="eyebrow">DETAIL SALDO {year}</p>
                <h2 id="balance-title">{selected.fullName}</h2>
                <p>NIP {selected.nip}</p>
              </div>
              <button
                className="panel-close"
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Tutup"
              >
                ×
              </button>
            </header>

            <div className="balance-detail-content">
              {selected.readiness === "PARTIAL" ? (
                <p className="feedback error">
                  Data saldo tidak lengkap dan tidak dapat digunakan. Hubungi
                  pengelola sistem.
                </p>
              ) : selected.isInitialized ? (
                <>
                  <div className="balance-detail-summary">
                    <span>Total saldo tersedia</span>
                    <strong>{selected.regularAvailableDays} hari</strong>
                    <small>Tahun administrasi {year}</small>
                  </div>
                  <BalanceCards item={selected} />

                  <section className="balance-history-section">
                    <div>
                      <p className="eyebrow">RIWAYAT</p>
                      <h3>Riwayat Saldo</h3>
                    </div>
                    {selected.history.length === 0 ? (
                      <p className="balance-empty-copy">
                        Belum ada riwayat saldo.
                      </p>
                    ) : (
                      <div className="balance-history">
                        {selected.history.map((entry) => (
                          <div key={entry.id}>
                            <strong>
                              {labels[entry.bucket]} · {entry.days} hari
                            </strong>
                            <span>
                              {new Date(entry.occurredAt).toLocaleDateString(
                                "id-ID",
                              )}{" "}
                              · {entry.reason ?? "Tanpa keterangan"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <div className="uninitialized-callout">
                    <strong>Saldo {year} belum diinisialisasi</strong>
                    <span>
                      Siapkan saldo awal menggunakan data administrasi yang telah
                      diverifikasi.
                    </span>
                  </div>

                  {!formOpen ? (
                    <button
                      className="primary-button balance-start-button"
                      type="button"
                      onClick={() => setFormOpen(true)}
                    >
                      Inisialisasi Saldo {year}
                    </button>
                  ) : (
                    <form className="balance-form" onSubmit={initialize}>
                      <div className="balance-form-intro">
                        <p className="eyebrow">SALDO AWAL {year}</p>
                        <h3>Masukkan data saldo awal</h3>
                        <p>
                          Nilai N dan Cuti Bersama ditetapkan oleh sistem.
                          Lengkapi N-1, N-2, dan dasar administrasinya.
                        </p>
                      </div>

                      <div className="balance-form-grid">
                        <div className="fixed-balance">
                          <span>Cuti Tahunan Tahun Berjalan (N)</span>
                          <strong>12 hari</strong>
                        </div>

                        <label>
                          <span>Sisa Tahun Sebelumnya (N-1)</span>
                          <small>Maksimal 6 hari</small>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="6"
                            step="1"
                            required
                            value={n1Days}
                            onChange={(e) => setN1Days(Number(e.target.value))}
                          />
                        </label>

                        <label>
                          <span>Hak N-2</span>
                          <small>Maksimal 6 hari</small>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="6"
                            step="1"
                            required
                            value={n2Days}
                            onChange={(e) => setN2Days(Number(e.target.value))}
                          />
                        </label>

                        <div className="fixed-balance">
                          <span>Cuti Bersama</span>
                          <strong>0 hari</strong>
                        </div>
                      </div>

                      <label className="balance-reason">
                        <span>Dasar Administrasi</span>
                        <small>
                          Cantumkan sumber atau dasar data saldo awal.
                        </small>
                        <textarea
                          required
                          maxLength={1000}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Contoh: Rekap saldo cuti pegawai per 31 Desember 2025"
                        />
                      </label>

                      <div className="balance-form-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setFormOpen(false)}
                          disabled={busy}
                        >
                          Batal
                        </button>
                        <button className="primary-button" disabled={busy}>
                          {busy ? "Memproses…" : "Inisialisasi Saldo"}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

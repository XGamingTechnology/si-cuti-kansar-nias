"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AnnualBalanceAdministrationDetail } from "@/application/leave-balance/administration";
import type { AnnualBalanceBucket } from "@/domain/leave-balance";

const labels: Record<AnnualBalanceBucket, string> = {
  N: "Cuti Tahunan Tahun Berjalan",
  N1: "Sisa Tahun Sebelumnya",
  N2: "Hak N-2",
  JOINT_LEAVE_CLAIM: "Cuti Bersama",
};
const order: AnnualBalanceBucket[] = ["N", "N1", "N2", "JOINT_LEAVE_CLAIM"];

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
        const response = await fetch(`/api/admin/annual-balances?year=${year}`);
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
      <header className="employee-page-header">
        <div>
          <p className="eyebrow">ADMINISTRASI SALDO</p>
          <h1>Manajemen Saldo Cuti</h1>
          <p>Siapkan saldo awal berdasarkan data kepegawaian yang sah.</p>
        </div>
        <label className="year-selector">
          Tahun
          <select
            value={year}
            onChange={(event) => {
              setLoading(true);
              setYear(Number(event.target.value));
              setSelected(null);
              setMessage("");
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
      {loading ? (
        <p className="empty-state">Memuat saldo cuti…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">Belum ada pegawai aktif.</p>
      ) : (
        <div className="balance-layout">
          <div className="employee-list-surface">
            <div className="list-heading">
              <strong>Pegawai aktif</strong>
              <span>{items.length} pegawai</span>
            </div>
            <div className="balance-employee-list">
              {items.map((item) => (
                <article key={item.employeeId} className="balance-employee-row">
                  <div>
                    <strong>{item.fullName}</strong>
                    <span>NIP {item.nip}</span>
                    <em
                      className={`status-badge ${item.readiness === "INITIALIZED" ? "success" : item.readiness === "PARTIAL" ? "inactive" : "neutral"}`}
                    >
                      {item.readiness === "INITIALIZED"
                        ? `Saldo ${year} siap`
                        : item.readiness === "PARTIAL"
                          ? "Data saldo perlu diperiksa"
                          : `Saldo ${year} belum diinisialisasi`}
                    </em>
                  </div>
                  <div>
                    <b>{item.regularAvailableDays} hari tersedia</b>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void showDetail(item.employeeId)}
                    >
                      Detail
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
          <section
            className="balance-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="balance-title"
          >
            <button
              className="panel-close"
              onClick={() => setSelected(null)}
              aria-label="Tutup"
            >
              ×
            </button>
            <p className="eyebrow">DETAIL SALDO {year}</p>
            <h2 id="balance-title">{selected.fullName}</h2>
            <p>NIP {selected.nip}</p>
            {selected.readiness === "PARTIAL" ? (
              <p className="feedback error">
                Data saldo tidak lengkap dan tidak dapat digunakan. Hubungi
                pengelola sistem.
              </p>
            ) : selected.isInitialized ? (
              <>
                <BalanceCards item={selected} />
                <h3>Riwayat Saldo</h3>
                {selected.history.length === 0 ? (
                  <p>Belum ada riwayat saldo.</p>
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
              </>
            ) : (
              <>
                <p className="uninitialized-callout">
                  Saldo {year} belum diinisialisasi
                </p>
                {!formOpen ? (
                  <button
                    className="primary-button"
                    onClick={() => setFormOpen(true)}
                  >
                    Inisialisasi Saldo {year}
                  </button>
                ) : (
                  <form className="balance-form" onSubmit={initialize}>
                    <div className="fixed-balance">
                      <span>Cuti Tahunan Tahun Berjalan (N)</span>
                      <strong>12 hari</strong>
                    </div>
                    <label>
                      Sisa Tahun Sebelumnya (N-1)
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
                      Hak N-2
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
                    <label>
                      Dasar Administrasi
                      <textarea
                        required
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Tuliskan dasar data saldo awal"
                      />
                    </label>
                    <button className="primary-button" disabled={busy}>
                      {busy ? "Memproses…" : "Inisialisasi Saldo"}
                    </button>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

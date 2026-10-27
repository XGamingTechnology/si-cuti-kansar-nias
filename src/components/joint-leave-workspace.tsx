"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { formatDate, formatDateTime } from "./indonesian-date";
import { AdminFloatingWindow } from "./admin-floating-window";
import { AdminPagination } from "./admin-pagination";
import type {
  Claim,
  Policy,
  PolicyInput,
  ReviewInput,
  AssignmentType,
} from "@/application/joint-leave/ports";
import "./joint-leave-workspace.css";

type PublicClaim = Omit<
  Claim,
  "evidenceKey" | "payloadHash" | "reviewHash" | "idempotencyKey" | "reviewKey"
>;
const assignmentLabels: Record<string, string> = {
  SPECIAL_STANDBY: "Siaga Khusus",
  OPERATIONS: "Ops",
  REGULAR_STANDBY: "Siaga Rutin",
  SPRIN_ASSIGNMENT: "Sprin Penugasan",
};
const statusLabels: Record<string, string> = {
  SUBMITTED: "Diajukan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  PENDING: "Menunggu pemeriksaan",
};
const localYear = () =>
  Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date()),
  );
const dateLabel = formatDate;
const timeLabel = (s: Date | string) =>
  formatDateTime(new Date(s).toISOString());
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function api(path: string, init?: RequestInit) {
  const r = await fetch("/api/joint-leave" + path, {
    cache: "no-store",
    ...init,
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(j.error ?? "Permintaan gagal.", r.status);
  return j;
}
export function JointLeaveWorkspace({ admin }: { admin: boolean }) {
  const [year, setYear] = useState(localYear),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  const [claims, setClaims] = useState<PublicClaim[]>([]),
    [policies, setPolicies] = useState<Policy[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [form, setForm] = useState(false),
    [configuration, setConfiguration] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [retry, setRetry] = useState<PublicClaim | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(
        `?year=${year}&page=${page}&status=${status}&search=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ),
      api(`/policies?year=${year}`, { signal: controller.signal }),
    ])
      .then(([c, p]) => {
        if (!controller.signal.aborted) {
          const lastPage = Math.max(1, Math.ceil(c.total / 10));
          if (page > lastPage) {
            setPage(lastPage);
            return;
          }
          setClaims(c.claims);
          setTotal(c.total);
          setPolicies(p.policies);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [year, page, status, query, reload]);
  const refresh = () => {
    setLoading(true);
    setReload((n) => n + 1);
  };
  return (
    <section className="joint-leave-workspace" id="klaim-cuti-bersama">
      <header className="joint-heading">
        <div>
          <p className="eyebrow">KLAIM CUTI BERSAMA</p>
          <h1>{admin ? "Pemeriksaan Klaim" : "Klaim Cuti Bersama"}</h1>
          <p>
            Klaim penugasan pada tanggal cuti bersama. Saldo hasil persetujuan
            hanya berlaku pada tahun saldo tujuan.
          </p>
        </div>
        {admin ? (
          <button
            className="primary-button"
            onClick={() => setConfiguration(true)}
          >
            Atur Tanggal Cuti Bersama
          </button>
        ) : (
          <button
            className="primary-button"
            onClick={() => {
              setRetry(null);
              setForm(true);
            }}
          >
            Ajukan Klaim
          </button>
        )}
      </header>
      {notice && (
        <p role="status" className="joint-notice">
          {notice}
        </p>
      )}
      <form
        className="joint-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setLoading(true);
          setQuery(search);
          setReload((n) => n + 1);
        }}
      >
        <label>
          Tahun saldo
          <input
            aria-label="Tahun saldo"
            type="number"
            min="1900"
            max="9998"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setPage(1);
              setLoading(true);
            }}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Status klaim"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              setLoading(true);
            }}
          >
            <option value="">Semua status</option>
            {Object.entries(statusLabels)
              .filter(([v]) => v !== "PENDING")
              .map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label>
          Cari
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
            placeholder={
              admin ? "Nama, NIP, judul penugasan" : "Judul penugasan"
            }
          />
        </label>
        <button className="secondary-button">Cari</button>
      </form>
      {error && (
        <p role="alert">
          {error} <button onClick={refresh}>Muat ulang</button>
        </p>
      )}
      {loading ? (
        <p role="status">Memuat klaim…</p>
      ) : claims.length === 0 ? (
        <p>Belum ada klaim untuk filter ini.</p>
      ) : (
        <div className="joint-list">
          {claims.map((c) => (
            <article key={c.id}>
              <div>
                <span className={`joint-badge joint-${c.status.toLowerCase()}`}>
                  {statusLabels[c.status]}
                  {c.status === "APPROVED" &&
                  c.dates.some((d) => d.status === "REJECTED")
                    ? " sebagian"
                    : ""}
                </span>
                <h3>{c.title}</h3>
                <p>
                  {admin ? `${c.employeeName} · ${c.employeeNip} · ` : ""}
                  {assignmentLabels[c.assignmentType]} · {c.dates.length}{" "}
                  tanggal · Tahun saldo {c.creditYear}
                </p>
                <p>Diajukan {timeLabel(c.submittedAt)}</p>
                {c.status === "REJECTED" && (
                  <p className="joint-rejection">
                    <strong>Alasan penolakan:</strong> {c.reason}
                  </p>
                )}
              </div>
              <button
                className="secondary-button"
                onClick={() => {
                  setSelected(c.id);
                  setNotice("");
                }}
              >
                Lihat Detail
              </button>
            </article>
          ))}
        </div>
      )}
      <AdminPagination
        total={total}
        size={10}
        page={page}
        pages={Math.max(1, Math.ceil(total / 10))}
        onPage={(p) => {
          setPage(p);
          setLoading(true);
        }}
      />
      {admin && (
        <details>
          <summary>Pengaturan tanggal dan batas tahun {year}</summary>
          {policies.length === 0 ? (
            <p>Belum ada pengaturan.</p>
          ) : (
            policies.map((p) => (
              <div className="joint-policy" key={p.id}>
                <strong>{p.name}</strong>
                <p>
                  Tahun saldo {p.creditYear} · Batas kumulatif {p.quotaDays}{" "}
                  hari per pegawai · Dasar: {p.sourceReference}
                </p>
                <ul>
                  {p.eventDates.map((e) => (
                    <li key={e.id}>
                      {dateLabel(e.date)} · {e.name} ·{" "}
                      {e.kind === "YEAR_END" ? "Natal/Tahun Baru" : "Biasa"}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </details>
      )}
      {form && (
        <ClaimForm
          policies={policies}
          retry={retry}
          year={year}
          onClose={() => setForm(false)}
          onSaved={() => {
            setForm(false);
            setNotice("Klaim berhasil diajukan. Tunggu pemeriksaan Admin.");
            refresh();
          }}
        />
      )}
      {configuration && (
        <PolicyForm
          year={year}
          onClose={() => setConfiguration(false)}
          onSaved={() => {
            setConfiguration(false);
            setNotice(
              "Pengaturan tanggal berhasil disimpan sebagai versi baru.",
            );
            refresh();
          }}
        />
      )}
      {selected && (
        <ClaimDetail
          key={selected}
          id={selected}
          admin={admin}
          onClose={() => setSelected(null)}
          onChanged={refresh}
          onRetry={(c) => {
            setSelected(null);
            setRetry(c);
            setYear(localYear());
            setForm(true);
          }}
        />
      )}
    </section>
  );
}
function ClaimForm({
  policies,
  retry,
  year,
  onClose,
  onSaved,
}: {
  policies: Policy[];
  retry: PublicClaim | null;
  year: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const available = policies.filter(
    (p) => p.isActive && p.creditYear === localYear(),
  );
  const initialPolicy =
    available.find((p) => p.id === retry?.policyId) ?? available[0];
  const [policyId, setPolicyId] = useState(initialPolicy?.id ?? ""),
    [selected, setSelected] = useState<string[]>(
      retry?.dates
        .filter((d) => d.status === "REJECTED")
        .flatMap((d) => {
          const event = initialPolicy?.eventDates.find(
            (e) => e.date === d.eventDate,
          );
          return event ? [event.id] : [];
        }) ?? [],
    ),
    [blocked, setBlocked] = useState<string[]>([]),
    [checking, setChecking] = useState(true);
  const [type, setType] = useState(retry?.assignmentType ?? "SPECIAL_STANDBY"),
    [title, setTitle] = useState(retry?.title ?? ""),
    [sprin, setSprin] = useState(retry?.sprinNumber ?? ""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(crypto.randomUUID()),
    policy = available.find((p) => p.id === policyId);
  useEffect(() => {
    const controller = new AbortController();
    api(
      `/duplicates?dates=${policy?.eventDates.map((e) => e.date).join(",") ?? ""}`,
      { signal: controller.signal },
    )
      .then((j) => {
        if (!controller.signal.aborted) {
          setBlocked(j.dates);
          setSelected((ids) =>
            ids.filter(
              (id) =>
                !j.dates.includes(
                  policy?.eventDates.find((e) => e.id === id)?.date,
                ),
            ),
          );
          key.current = crypto.randomUUID();
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [policy]);
  function change() {
    key.current = crypto.randomUUID();
    setError("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !selected.length) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set(
        "data",
        JSON.stringify({
          policyId,
          eventIds: selected,
          assignmentType: type as AssignmentType,
          title,
          sprinNumber: sprin || null,
          idempotencyKey: key.current,
        }),
      );
      data.set("evidence", file);
      await api("", { method: "POST", body: data });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pengajuan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFloatingWindow
      title={
        retry ? "Ajukan Ulang dengan Perbaikan" : "Ajukan Klaim Cuti Bersama"
      }
      onClose={onClose}
      busy={busy}
    >
      <form className="joint-form" onSubmit={submit} onChange={change}>
        <fieldset disabled={busy}>
          {retry && (
            <p>
              Keputusan lama tetap tersimpan. Perbaiki isian dan unggah kembali
              bukti yang sesuai untuk klaim baru.
            </p>
          )}
          {year !== localYear() && (
            <p role="alert">
              Pengajuan baru hanya untuk tahun berjalan. Pilih tahun saldo{" "}
              {localYear()} pada daftar.
            </p>
          )}
          <label>
            Pengaturan tanggal
            <select
              required
              value={policyId}
              onChange={(e) => {
                setPolicyId(e.target.value);
                setSelected([]);
                setChecking(true);
              }}
            >
              <option value="">Pilih pengaturan</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · Tahun saldo {p.creditYear}
                </option>
              ))}
            </select>
          </label>
          {!available.length && (
            <p>
              Belum ada tanggal yang dapat diklaim. Hubungi Admin untuk
              pengaturan tahun berjalan.
            </p>
          )}
          <fieldset>
            <legend>Pilih tanggal cuti bersama</legend>
            {checking && (
              <p role="status">Memeriksa tanggal yang sudah diklaim…</p>
            )}
            {policy?.eventDates.map((e) => (
              <label className="joint-check" key={e.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(e.id) && !blocked.includes(e.date)}
                  disabled={checking || blocked.includes(e.date)}
                  onChange={(v) =>
                    setSelected((ids) =>
                      v.target.checked
                        ? [...ids, e.id]
                        : ids.filter((id) => id !== e.id),
                    )
                  }
                />
                <span>
                  {dateLabel(e.date)} · {e.name}
                  {e.kind === "YEAR_END" ? " · Natal/Tahun Baru" : ""}
                  {blocked.includes(e.date) && (
                    <small>
                      Sudah ada klaim yang diperiksa/disetujui untuk tanggal
                      ini.
                    </small>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Jenis penugasan
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(assignmentLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Judul penugasan
            <input
              required
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Nomor Sprin/Surat Perintah Penugasan (jika ada)
            <input
              maxLength={200}
              value={sprin}
              onChange={(e) => setSprin(e.target.value)}
            />
          </label>
          <label>
            Bukti penugasan/pelaksanaan
            <input
              required
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <small>
            PDF, JPG atau PNG, maksimal 10 MB. Bukti hanya dapat dibaca oleh
            Anda dan Admin. Pilih bukti yang menunjukkan penugasan serta
            pelaksanaannya.
          </small>
          <p>
            {
              selected.filter(
                (id) =>
                  !blocked.includes(
                    policy?.eventDates.find((e) => e.id === id)?.date ?? "",
                  ),
              ).length
            }{" "}
            tanggal dipilih. Saldo bertambah setelah disetujui dan hanya berlaku
            pada tahun saldo {policy?.creditYear ?? year}.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            className="primary-button"
            disabled={
              checking ||
              !file ||
              !selected.length ||
              selected.some((id) =>
                blocked.includes(
                  policy?.eventDates.find((e) => e.id === id)?.date ?? "",
                ),
              ) ||
              !policy ||
              year !== localYear()
            }
          >
            {busy ? "Mengajukan…" : "Ajukan Klaim"}
          </button>
        </fieldset>
      </form>
    </AdminFloatingWindow>
  );
}
function PolicyForm({
  year,
  onClose,
  onSaved,
}: {
  year: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [input, setInput] = useState<PolicyInput>({
      name: "",
      creditYear: year,
      quotaDays: 0,
      sourceReference: "",
      events: [{ date: "", name: "", kind: "REGULAR" }],
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key.current,
        },
        body: JSON.stringify(input),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pengaturan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminFloatingWindow
      title="Pengaturan Tanggal Cuti Bersama"
      onClose={onClose}
      busy={busy}
    >
      <form
        className="joint-form"
        onSubmit={submit}
        onChange={() => {
          key.current = crypto.randomUUID();
          setError("");
        }}
      >
        <fieldset disabled={busy}>
          <p>
            Masukkan tanggal dan batas berdasarkan keputusan resmi. Simpan
            sebagai versi baru; keputusan dan bukti klaim sebelumnya tidak
            berubah. Batas menghitung seluruh tanggal yang sudah disetujui pada
            tahun saldo tersebut, termasuk dari versi lain.
          </p>
          <label>
            Nama pengaturan/versi
            <input
              required
              maxLength={200}
              value={input.name}
              onChange={(e) => setInput({ ...input, name: e.target.value })}
            />
          </label>
          <label>
            Tahun saldo tujuan
            <input
              required
              type="number"
              min="1900"
              max="9998"
              value={input.creditYear}
              onChange={(e) =>
                setInput({ ...input, creditYear: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Batas hari kumulatif per pegawai pada tahun saldo
            <input
              required
              type="number"
              min="1"
              max="366"
              value={input.quotaDays || ""}
              onChange={(e) =>
                setInput({ ...input, quotaDays: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Referensi keputusan resmi
            <input
              required
              maxLength={500}
              value={input.sourceReference}
              onChange={(e) =>
                setInput({ ...input, sourceReference: e.target.value })
              }
            />
          </label>
          {input.events.map((event, i) => (
            <fieldset key={i}>
              <legend>Tanggal {i + 1}</legend>
              <label>
                Tanggal cuti bersama
                <input
                  required
                  type="date"
                  value={event.date}
                  onChange={(e) =>
                    setInput({
                      ...input,
                      events: input.events.map((v, n) =>
                        n === i ? { ...v, date: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Nama/keterangan
                <input
                  required
                  maxLength={200}
                  value={event.name}
                  onChange={(e) =>
                    setInput({
                      ...input,
                      events: input.events.map((v, n) =>
                        n === i ? { ...v, name: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Kelompok
                <select
                  value={event.kind}
                  onChange={(e) =>
                    setInput({
                      ...input,
                      events: input.events.map((v, n) =>
                        n === i
                          ? {
                              ...v,
                              kind: e.target.value as "REGULAR" | "YEAR_END",
                            }
                          : v,
                      ),
                    })
                  }
                >
                  <option value="REGULAR">
                    Biasa, tahun kejadian = tahun saldo
                  </option>
                  <option value="YEAR_END">
                    Natal/Tahun Baru, Desember sebelumnya atau Januari tahun
                    saldo
                  </option>
                </select>
              </label>
              {input.events.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setInput({
                      ...input,
                      events: input.events.filter((_, n) => n !== i),
                    })
                  }
                >
                  Hapus tanggal
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="secondary-button"
            disabled={input.events.length >= 366}
            onClick={() =>
              setInput({
                ...input,
                events: [
                  ...input.events,
                  { date: "", name: "", kind: "REGULAR" },
                ],
              })
            }
          >
            Tambah Tanggal
          </button>
          {error && <p role="alert">{error}</p>}
          <button className="primary-button">
            {busy ? "Menyimpan…" : "Simpan Pengaturan"}
          </button>
        </fieldset>
      </form>
    </AdminFloatingWindow>
  );
}
function ClaimDetail({
  id,
  admin,
  onClose,
  onChanged,
  onRetry,
}: {
  id: string;
  admin: boolean;
  onClose: () => void;
  onChanged: () => void;
  onRetry: (c: PublicClaim) => void;
}) {
  const [reviewBusy, setReviewBusy] = useState(false);
  const [claim, setClaim] = useState<PublicClaim | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(`/${id}`, { signal: controller.signal })
      .then((j) => {
        if (!controller.signal.aborted) {
          setClaim(j.claim);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, reload]);
  return (
    <AdminFloatingWindow
      title="Detail Klaim Cuti Bersama"
      onClose={onClose}
      busy={reviewBusy}
    >
      {loading && <p role="status">Memuat detail…</p>}
      {error && <p role="alert">{error}</p>}
      {claim && (
        <div className="joint-detail">
          <span className={`joint-badge joint-${claim.status.toLowerCase()}`}>
            {statusLabels[claim.status]}
          </span>
          <h2>{claim.title}</h2>
          <dl>
            <dt>Pegawai</dt>
            <dd>
              {claim.employeeName} · {claim.employeeNip}
            </dd>
            <dt>Jenis penugasan</dt>
            <dd>{assignmentLabels[claim.assignmentType]}</dd>
            <dt>Nomor Sprin</dt>
            <dd>{claim.sprinNumber || "Tidak dicantumkan"}</dd>
            <dt>Tahun saldo</dt>
            <dd>{claim.creditYear}; tidak dibawa ke tahun berikutnya</dd>
            <dt>Diajukan</dt>
            <dd>{timeLabel(claim.submittedAt)}</dd>
            <dt>Dasar tanggal</dt>
            <dd>
              {claim.policySnapshot.name} ·{" "}
              {claim.policySnapshot.sourceReference}
            </dd>
          </dl>
          <a
            className="secondary-button"
            href={`/api/joint-leave/${id}/evidence`}
            target="_blank"
            rel="noreferrer"
          >
            Lihat Bukti
          </a>{" "}
          <a href={`/api/joint-leave/${id}/evidence?download=1`}>Unduh Bukti</a>
          <ul>
            {claim.dates.map((d) => (
              <li key={d.id}>
                {dateLabel(d.eventDate)} · {statusLabels[d.status]}
              </li>
            ))}
          </ul>
          {claim.status !== "SUBMITTED" && (
            <section
              className={
                claim.status === "REJECTED" ? "joint-rejection" : "joint-notice"
              }
            >
              <h3>
                {claim.status === "REJECTED"
                  ? "Alasan Penolakan"
                  : "Hasil Pemeriksaan"}
              </h3>
              <p>{claim.reason}</p>
              <p>
                {claim.reviewedAt && timeLabel(claim.reviewedAt)} ·{" "}
                {claim.dates.filter((d) => d.status === "APPROVED").length} hari
                dikreditkan ke tahun {claim.creditYear}.
              </p>
            </section>
          )}
          {!admin &&
            claim.status === "REJECTED" &&
            claim.creditYear === localYear() && (
              <button className="primary-button" onClick={() => onRetry(claim)}>
                Ajukan Ulang dengan Perbaikan
              </button>
            )}
          {admin && claim.status === "SUBMITTED" && (
            <ReviewForm
              onBusy={setReviewBusy}
              key={claim.id}
              claim={claim}
              onSaved={() => {
                setReload((n) => n + 1);
                onChanged();
              }}
            />
          )}
        </div>
      )}
    </AdminFloatingWindow>
  );
}
type Preview = {
  fingerprint: string;
  approvedDays: number;
  creditYear: number;
  previouslyApproved: number;
  accountsBefore: { bucket: string; availableDays: number }[];
};
function ReviewForm({
  claim,
  onBusy,
  onSaved,
}: {
  claim: PublicClaim;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const [approved, setApproved] = useState(claim.dates.map((d) => d.eventId)),
    [reason, setReason] = useState(""),
    [verified, setVerified] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  const input = (): ReviewInput => ({
    approvedEventIds: approved,
    reason,
    evidenceVerified: verified,
    idempotencyKey: key.current,
    fingerprint: preview?.fingerprint ?? "",
  });
  const invalidate = useCallback(() => {
    setPreview(null);
    setConfirmed(false);
    key.current = crypto.randomUUID();
    setError("");
  }, []);
  async function perform(save: boolean) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const j = await api(`/${claim.id}/${save ? "review" : "preview"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input()),
      });
      if (save) onSaved();
      else {
        setPreview(j.preview);
        setConfirmed(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pemeriksaan gagal.");
      if (e instanceof ApiError && [400, 409, 422].includes(e.status)) {
        setPreview(null);
        setConfirmed(false);
      }
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section>
      <h3>Pemeriksaan Admin</h3>
      <form
        className="joint-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(false);
        }}
      >
        <fieldset disabled={busy}>
          <p>
            Pilih tanggal yang disetujui. Tanggal yang tidak dipilih ditolak
            dengan alasan di bawah. Untuk menolak seluruh pengajuan, kosongkan
            semua pilihan.
          </p>
          {claim.dates.map((d) => (
            <label className="joint-check" key={d.id}>
              <input
                type="checkbox"
                checked={approved.includes(d.eventId)}
                onChange={(e) => {
                  setApproved((ids) =>
                    e.target.checked
                      ? [...ids, d.eventId]
                      : ids.filter((v) => v !== d.eventId),
                  );
                  invalidate();
                }}
              />
              Setujui {dateLabel(d.eventDate)}
            </label>
          ))}
          <label>
            Alasan/catatan pemeriksaan
            <textarea
              required
              maxLength={3000}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label className="joint-check">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => {
                setVerified(e.target.checked);
                invalidate();
              }}
            />
            Saya telah memeriksa kelengkapan dan kebenaran bukti
            penugasan/pelaksanaan untuk tanggal yang disetujui.
          </label>
          <button
            className="secondary-button"
            disabled={approved.length > 0 && !verified}
          >
            {busy ? "Memproses…" : "Pratinjau Keputusan"}
          </button>
          {error && <p role="alert">{error}</p>}
        </fieldset>
      </form>
      {preview && (
        <div className="joint-notice">
          <h4>{preview.approvedDays ? "Persetujuan" : "Penolakan"}</h4>
          <p>
            {preview.approvedDays} hari ditambahkan ke saldo Klaim Cuti Bersama
            tahun {preview.creditYear}.{" "}
            {claim.dates.length - preview.approvedDays} tanggal ditolak.
          </p>
          <p>
            Saldo tersedia:{" "}
            {preview.accountsBefore.find(
              (a) => a.bucket === "JOINT_LEAVE_CLAIM",
            )?.availableDays ?? 0}{" "}
            →{" "}
            {(preview.accountsBefore.find(
              (a) => a.bucket === "JOINT_LEAVE_CLAIM",
            )?.availableDays ?? 0) + preview.approvedDays}{" "}
            hari.
          </p>
          <p>
            Total tanggal disetujui tahun ini setelah keputusan:{" "}
            {preview.previouslyApproved + preview.approvedDays} dari batas{" "}
            {claim.policySnapshot.quotaDays} hari.
          </p>
          <label className="joint-check">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Saya mengonfirmasi hasil pemeriksaan di atas.
          </label>
          <button
            className="primary-button"
            disabled={!confirmed || busy}
            onClick={() => void perform(true)}
          >
            {busy ? "Menyimpan…" : "Simpan Keputusan"}
          </button>
        </div>
      )}
    </section>
  );
}

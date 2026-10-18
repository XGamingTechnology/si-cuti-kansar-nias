"use client";

import { handoffReportDownload } from "./reporting-client";
import { AdminFloatingWindow } from "./admin-floating-window";

import { AdminPagination, useAdminPagination } from "./admin-pagination";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { AccountStatus } from "@/application/accounts/service";
import type { Employee } from "@/application/employees/service";
import type { EmployeeImportPreview } from "@/application/employees/import-service";
import { AdminUiIcon } from "./admin-ui-icon";
import { EmployeeAccountControls } from "@/components/employee-account-controls";

const empty = {
  nip: "",
  fullName: "",
  positionTitle: "",
  workUnit: "",
  directSupervisorId: "",
  employmentStartDate: "",
};
type FormMode = "create" | "edit" | null;
type EmployeeStatusFilter = "all" | "active" | "inactive";

function employeeInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function StatusBadge({
  active,
  emptyAccount = false,
}: {
  active?: boolean;
  emptyAccount?: boolean;
}) {
  return (
    <span
      className={`status-badge ${emptyAccount ? "neutral" : active ? "success" : "inactive"}`}
    >
      <i aria-hidden="true" />
      {emptyAccount ? "Belum memiliki akun" : active ? "Aktif" : "Tidak aktif"}
    </span>
  );
}

type AccountBadgeState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; account: AccountStatus | null };

function AccountBadge({
  employeeId,
  refreshVersion,
}: {
  employeeId: string;
  refreshVersion: number;
}) {
  const [state, setState] = useState<AccountBadgeState>({
    status: "loading",
  });

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        const response = await fetch(
          `/api/admin/employees/${employeeId}/account`,
        );
        if (!response.ok) {
          if (active) setState({ status: "error" });
          return;
        }
        const data = await response.json();
        if (active) setState({ status: "success", account: data.account });
      } catch {
        if (active) setState({ status: "error" });
      }
    }

    void loadAccount();
    return () => {
      active = false;
    };
  }, [employeeId, refreshVersion]);

  if (state.status === "loading")
    return <span className="status-loading">Memuat…</span>;
  if (state.status === "error")
    return (
      <span className="status-loading directory-account-error">
        Gagal memuat
      </span>
    );
  return (
    <StatusBadge
      active={state.account?.isActive}
      emptyAccount={!state.account}
    />
  );
}

export function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(empty);
  const [editVersion, setEditVersion] = useState<string>("");
  const [mode, setMode] = useState<FormMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [unitFilter, setUnitFilter] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const templateFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const panelEpoch = useRef(0);
  const listSequence = useRef(0);
  const importAttempt = useRef<string | null>(null);
  const [importComplete, setImportComplete] = useState(false);
  const [importUnknown, setImportUnknown] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<EmployeeStatusFilter>("active");
  const [accountRefreshVersions, setAccountRefreshVersions] = useState<
    Record<string, number>
  >({});
  const selected =
    employees.find((employee) => employee.id === selectedId) ?? null;

  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
    return employees.filter((employee) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && employee.isActive) ||
        (statusFilter === "inactive" && !employee.isActive);
      if (!matchesStatus || (unitFilter && employee.workUnit !== unitFilter))
        return false;
      if (!normalizedQuery) return true;
      return [
        employee.fullName,
        employee.nip,
        employee.positionTitle,
        employee.workUnit,
      ].some((value) =>
        value.toLocaleLowerCase("id-ID").includes(normalizedQuery),
      );
    });
  }, [employees, query, statusFilter, unitFilter]);

  const pagination = useAdminPagination(
    visibleEmployees,
    `${query}|${statusFilter}|${unitFilter}`,
  );

  const summary = useMemo(
    () => ({
      total: employees.length,
      active: employees.filter((employee) => employee.isActive).length,
      inactive: employees.filter((employee) => !employee.isActive).length,
      units: new Set(
        employees
          .map((employee) =>
            employee.workUnit.trim().toLocaleLowerCase("id-ID"),
          )
          .filter(Boolean),
      ).size,
    }),
    [employees],
  );

  const handleAccountChanged = useCallback((employeeId: string) => {
    setAccountRefreshVersions((versions) => ({
      ...versions,
      [employeeId]: (versions[employeeId] ?? 0) + 1,
    }));
  }, []);

  const requestEmployees = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const sequence = ++listSequence.current;
      try {
        const response = await fetch("/api/admin/employees", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!isCurrent() || sequence !== listSequence.current) return;
        if (response.ok && Array.isArray(data?.employees))
          setEmployees(data.employees);
        else {
          setListError(true);
          setMessage(data?.error ?? "Data pegawai gagal dimuat.");
        }
      } catch {
        if (isCurrent() && sequence === listSequence.current) {
          setListError(true);
          setMessage(
            "Data pegawai gagal dimuat. Periksa koneksi lalu coba lagi.",
          );
        }
      } finally {
        if (isCurrent() && sequence === listSequence.current) setLoading(false);
      }
    },
    [],
  );
  function load(resetFeedback = false) {
    setLoading(true);
    setListError(false);
    if (resetFeedback) setMessage("");
    return requestEmployees();
  }
  useEffect(() => {
    let active = true;
    async function initialLoad() {
      await requestEmployees(() => active);
    }
    void initialLoad();
    return () => {
      active = false;
    };
  }, [requestEmployees]);

  function openCreate() {
    if (inFlight.current || busy) return;
    panelEpoch.current++;
    setMode("create");
    setSelectedId(null);
    setForm(empty);
    setMessage("");
  }
  function openDetail(employee: Employee) {
    if (inFlight.current || busy) return;
    panelEpoch.current++;
    setSelectedId(employee.id);
    setMode(null);
    setMessage("");
  }
  function openEdit(employee: Employee) {
    setEditVersion(String(employee.updatedAt ?? ""));
    setSelectedId(employee.id);
    setMode("edit");
    setMessage("");
    setForm({
      nip: employee.nip,
      fullName: employee.fullName,
      positionTitle: employee.positionTitle,
      workUnit: employee.workUnit,
      directSupervisorId: employee.directSupervisorId ?? "",
      employmentStartDate: employee.employmentStartDate
        ? String(employee.employmentStartDate).slice(0, 10)
        : "",
    });
  }
  function closePanel() {
    if (inFlight.current) return;
    panelEpoch.current++;
    setMessage("");
    setMode(null);
    setSelectedId(null);
    setForm(empty);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const epoch = panelEpoch.current;
    const editing = mode === "edit" && selected;
    setMessage("");
    try {
      const response = await fetch(
        editing
          ? `/api/admin/employees/${selected.id}`
          : "/api/admin/employees",
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            ...(editing ? { "if-match": `"${editVersion}"` } : {}),
          },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json().catch(() => null);
      if (epoch !== panelEpoch.current) return;
      if (!response.ok || typeof data?.employee?.id !== "string") {
        setMessage(
          data?.error ??
            "Respons simpan belum dapat dipastikan. Tutup dan muat ulang daftar/NIP sebelum mengulang.",
        );
        return;
      }
      inFlight.current = false;
      closePanel();
      await load();
      setMessage(
        editing
          ? "Data pegawai berhasil diperbarui."
          : "Pegawai berhasil ditambahkan; akun dan saldo belum dibuat.",
      );
    } catch {
      if (epoch === panelEpoch.current)
        setMessage(
          "Respons simpan belum diterima. Tutup dan muat ulang daftar sebelum mengulang; periksa NIP agar tidak membuat data ganda.",
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function changeStatus(employee: Employee) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/employees/${employee.id}/status`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "if-match": `"${employee.updatedAt}"`,
          },
          body: JSON.stringify({ isActive: !employee.isActive }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.employee?.id !== "string") {
        setMessage(
          data?.error ??
            "Respons status belum dapat dipastikan. Muat ulang data sebelum mengulang.",
        );
        return;
      }
      inFlight.current = false;
      closePanel();
      await load();
      setMessage(
        employee.isActive
          ? "Pegawai dinonaktifkan dan dapat ditemukan di Nonaktif (Arsip). Sesi lama dicabut."
          : "Pegawai diaktifkan kembali. Status akun login tetap dikelola terpisah.",
      );
    } catch {
      setMessage(
        "Respons perubahan status belum diterima. Muat ulang data sebelum mengulang.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function downloadTemplate() {
    if (templateFlight.current) return;
    templateFlight.current = true;
    setTemplateBusy(true);
    setMessage("");
    const epoch = panelEpoch.current;
    try {
      const response = await fetch("/api/admin/employees/template", {
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error ??
            "Template belum dapat diunduh. Periksa sesi/koneksi lalu coba lagi.",
        );
      }
      if (
        !response.headers
          .get("content-type")
          ?.startsWith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
      )
        throw new Error(
          "Respons template tidak valid. Muat ulang sesi dan coba lagi.",
        );
      handoffReportDownload(await response.blob(), "template-pegawai.xlsx");
      if (epoch === panelEpoch.current)
        setMessage(
          "Template diteruskan ke unduhan browser. Periksa daftar unduhan perangkat Anda.",
        );
    } catch (error) {
      if (epoch === panelEpoch.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Template gagal diunduh. Coba lagi.",
        );
    } finally {
      templateFlight.current = false;
      setTemplateBusy(false);
    }
  }
  function closeImport() {
    if (inFlight.current) return;
    panelEpoch.current++;
    setImportOpen(false);
    setMessage("");
  }
  function downloadImportResult() {
    if (!preview || importBusy) return;
    try {
      // Derived only from the already Admin-authorized preview; never an account/password export.
      const tahap = importUnknown
        ? "KONFIRMASI_BELUM_DIKETAHUI"
        : importComplete
          ? "TERSIMPAN"
          : "PRATINJAU_BELUM_DISIMPAN";
      const result = {
        tahap,
        totalBaris: preview.totalRows,
        barisValid: preview.validRows,
        barisTidakValid: preview.invalidRows,
        baris: preview.rows.map((row) => ({
          baris: row.rowNumber,
          nip: row.nip,
          nama: row.fullName,
          status: preview.errors.some(
            (error) => error.rowNumber === row.rowNumber,
          )
            ? "TIDAK_VALID"
            : importUnknown
              ? "BELUM_DIKETAHUI"
              : importComplete
                ? "BERHASIL"
                : "VALID_BELUM_DISIMPAN",
          kesalahan: preview.errors
            .filter((error) => error.rowNumber === row.rowNumber)
            .map((error) => ({ kolom: error.field, pesan: error.message })),
        })),
      };
      handoffReportDownload(
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json;charset=utf-8",
        }),
        "hasil-impor-pegawai.json",
      );
    } catch {
      setMessage(
        "Hasil belum dapat diteruskan ke unduhan browser. Coba unduh lagi.",
      );
    }
  }
  async function sendImport(commit: boolean) {
    if (!importFile || inFlight.current) return;
    inFlight.current = true;
    setImportBusy(true);
    setMessage("");
    const body = new FormData();
    body.append("file", importFile);
    if (commit) importAttempt.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/employees/import", {
        method: commit ? "PUT" : "POST",
        ...(commit
          ? { headers: { "idempotency-key": importAttempt.current! } }
          : {}),
        body,
      });
      const data = await response.json().catch(() => null);
      if (
        !response.ok ||
        (commit
          ? !Number.isInteger(data?.imported)
          : !data?.preview ||
            !Array.isArray(data.preview.rows) ||
            !Array.isArray(data.preview.errors))
      ) {
        setMessage(
          data?.error ??
            "Respons impor tidak valid. Coba lagi dengan file dan kunci yang sama.",
        );
        if (commit) {
          const unknown =
            response.status >= 500 ||
            (response.ok && !Number.isInteger(data?.imported)) ||
            !data;
          setImportUnknown(unknown);
          if (!unknown) setPreview(null);
        }
        return;
      }
      if (commit) {
        setImportUnknown(false);
        setMessage(
          `Berhasil: ${data.imported}. Dilewati: 0. Gagal: 0. Seluruh baris disimpan bersama; akun/saldo tidak dibuat.`,
        );
        setImportComplete(true);
        setImportFile(null);
        importAttempt.current = null;
        await load();
      } else {
        setPreview(data.preview);
        setImportUnknown(false);
      }
    } catch {
      if (commit) setImportUnknown(true);
      setMessage(
        commit
          ? "Hasil konfirmasi belum diketahui. Jangan mengganti file atau mengulang sebagai impor baru. Tekan Coba konfirmasi lagi dengan file/kunci yang sama; server tidak menggandakan data."
          : "Pratinjau gagal dimuat. Periksa koneksi dan coba lagi.",
      );
    } finally {
      inFlight.current = false;
      setImportBusy(false);
    }
  }

  return (
    <section className="employee-page employee-directory" id="pegawai">
      <header className="employee-page-header">
        <div>
          <p className="eyebrow">MASTER PEGAWAI</p>
          <h1>Kelola Pegawai</h1>
          <p>
            Satu tempat untuk mengelola data kepegawaian dan akses aplikasi.
          </p>
        </div>
        <div className="employee-header-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={templateBusy}
            onClick={() => void downloadTemplate()}
          >
            {templateBusy ? "Menyiapkan template…" : "Unduh Template Pegawai"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => {
              if (busy || inFlight.current) return;
              panelEpoch.current++;
              setImportOpen(true);
              if (!importUnknown) {
                setImportFile(null);
                setImportComplete(false);
                importAttempt.current = null;
                setPreview(null);
                setMessage("");
              } else
                setMessage(
                  "Hasil impor sebelumnya belum diketahui. Gunakan Coba konfirmasi lagi dengan file dan kunci yang sama.",
                );
            }}
          >
            <AdminUiIcon name="upload" /> Impor Pegawai
          </button>
          <button
            disabled={busy}
            className="primary-button"
            type="button"
            onClick={openCreate}
          >
            <AdminUiIcon name="plus" /> Tambah Pegawai
          </button>
        </div>
      </header>
      {message && (
        <p
          className={`feedback${listError ? " directory-load-error" : ""}`}
          role={listError ? "alert" : "status"}
        >
          {message}
        </p>
      )}
      <div
        className="directory-summary"
        aria-label="Ringkasan data pegawai"
        aria-busy={loading}
      >
        {(
          [
            ["total", "Total pegawai", "people", "Data terdaftar"],
            ["active", "Pegawai aktif", "active", "Status kepegawaian aktif"],
            ["inactive", "Tidak aktif", "inactive", "Riwayat tetap tersimpan"],
            ["units", "Unit kerja", "unit", "Dari data pegawai terdaftar"],
          ] as const
        ).map(([key, label, icon, caption]) => (
          <article
            key={key}
            className={`directory-stat directory-stat--${key}`}
          >
            <div>
              <span>{label}</span>
              <strong>{loading || listError ? "—" : summary[key]}</strong>
              <small>{caption}</small>
            </div>
            <span className="directory-stat-icon">
              <AdminUiIcon name={icon} />
            </span>
          </article>
        ))}
      </div>
      <div className="employee-list-surface">
        <div className="list-heading">
          <div>
            <h2>Daftar Pegawai</h2>
            <p>
              {listError
                ? "Data belum tersedia"
                : loading
                  ? "Memuat data…"
                  : query || statusFilter !== "all"
                    ? `${visibleEmployees.length} dari ${employees.length} pegawai ditampilkan`
                    : `${employees.length} pegawai terdaftar`}
            </p>
          </div>
        </div>
        {!loading && !listError && employees.length > 0 && (
          <div
            className="employee-toolbar"
            aria-label="Pencarian dan filter pegawai"
          >
            <label className="employee-search">
              <span className="sr-only">Cari pegawai</span>
              <span className="search-icon" aria-hidden="true">
                <AdminUiIcon name="search" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama, NIP, jabatan, atau unit kerja"
              />
            </label>
            <label className="employee-filter">
              <span>Status pegawai</span>
              <select
                aria-label="Status pegawai"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as EmployeeStatusFilter)
                }
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif (Arsip)</option>
                <option value="all">Semua</option>
              </select>
            </label>
            <label className="employee-filter">
              <span>Unit kerja</span>
              <select
                aria-label="Unit kerja"
                value={unitFilter}
                onChange={(event) => setUnitFilter(event.target.value)}
              >
                <option value="">Semua unit</option>
                {[...new Set(employees.map((e) => e.workUnit))]
                  .sort((a, b) => a.localeCompare(b, "id"))
                  .map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        {loading ? (
          <div className="empty-state" aria-live="polite">
            Memuat data pegawai…
          </div>
        ) : listError ? (
          <div className="empty-state directory-error-state">
            <span className="directory-empty-icon">
              <AdminUiIcon name="inactive" />
            </span>
            <strong>Data pegawai belum dapat dimuat</strong>
            <span>Periksa sesi atau koneksi Anda, lalu coba kembali.</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void load(true)}
            >
              Coba lagi
            </button>
          </div>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            <span className="directory-empty-icon">
              <AdminUiIcon name="people" />
            </span>
            <strong>Belum ada data pegawai</strong>
            <span>
              Gunakan tombol Tambah Pegawai untuk membuat data pertama.
            </span>
          </div>
        ) : visibleEmployees.length === 0 ? (
          <div className="empty-state">
            <strong>Pegawai tidak ditemukan</strong>
            <span>Ubah kata kunci atau filter untuk melihat data lainnya.</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("active");
                setUnitFilter("");
              }}
            >
              Reset pencarian
            </button>
          </div>
        ) : (
          <>
            <div
              className="employee-table-wrap"
              role="region"
              aria-label="Daftar pegawai"
              tabIndex={0}
            >
              <table className="employee-table">
                <thead>
                  <tr>
                    <th scope="col">Pegawai</th>
                    <th scope="col">Jabatan</th>
                    <th scope="col">Unit kerja</th>
                    <th scope="col">Status Pegawai</th>
                    <th scope="col">Status Akun Login</th>
                    <th scope="col">
                      <span className="sr-only">Tindakan</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.items.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <div className="directory-person">
                          <span className="directory-avatar" aria-hidden="true">
                            {employeeInitials(employee.fullName)}
                          </span>
                          <div>
                            <strong>{employee.fullName}</strong>
                            <span className="directory-nip">
                              {employee.nip}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{employee.positionTitle}</td>
                      <td>{employee.workUnit}</td>
                      <td>
                        <StatusBadge active={employee.isActive} />
                      </td>
                      <td>
                        <AccountBadge
                          key={employee.id}
                          employeeId={employee.id}
                          refreshVersion={
                            accountRefreshVersions[employee.id] ?? 0
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="detail-button"
                          type="button"
                          aria-label={`Lihat detail ${employee.fullName}`}
                          onClick={() => openDetail(employee)}
                        >
                          Lihat Detail <AdminUiIcon name="arrow" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="employee-mobile-list">
              {pagination.items.map((employee) => (
                <article key={employee.id}>
                  <div className="mobile-employee-heading">
                    <span className="employee-card-avatar" aria-hidden="true">
                      {employeeInitials(employee.fullName)}
                    </span>
                    <div className="mobile-employee-title">
                      <strong>{employee.fullName}</strong>
                      <span>{employee.nip}</span>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Status Pegawai</dt>
                      <dd>
                        <StatusBadge active={employee.isActive} />
                      </dd>
                    </div>
                    <div>
                      <dt>Status Akun Login</dt>
                      <dd>
                        <AccountBadge
                          key={employee.id}
                          employeeId={employee.id}
                          refreshVersion={
                            accountRefreshVersions[employee.id] ?? 0
                          }
                        />
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {employee.positionTitle} <span>·</span> {employee.workUnit}
                  </p>
                  <button
                    className="detail-button"
                    type="button"
                    aria-label={`Lihat detail ${employee.fullName}`}
                    onClick={() => openDetail(employee)}
                  >
                    Lihat Detail <AdminUiIcon name="arrow" />
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      {!loading && !listError && (
        <>
          <AdminPagination {...pagination.controls} />
          <p className="panel-description">
            Pencarian, filter dan pagination lokal: 10 pegawai per halaman dari
            daftar yang telah dimuat. Arsip adalah pegawai nonaktif; histori
            tetap tersimpan.
          </p>
        </>
      )}
      {importOpen && (
        <AdminFloatingWindow
          title="Impor Pegawai"
          onClose={closeImport}
          busy={importBusy}
        >
          <div className="management-form">
            {message && (
              <p className="feedback" role="status">
                {message}
              </p>
            )}
            <p className="panel-description">
              Gunakan file .xlsx maksimal 2 MB dengan kolom persis: NIP, Nama
              Lengkap, Jabatan, Unit Kerja, Status Aktif. Status menerima
              TRUE/FALSE atau AKTIF/TIDAK AKTIF.
            </p>
            <p className="panel-description">
              Maksimal 500 baris pegawai. Semua lima kolom wajib. Gunakan
              template kosong tanpa contoh data; NIP harus teks agar awalan
              nol/digit panjang terjaga. Atasan tidak didukung dalam impor ini.
              Seluruh baris valid disimpan atomik: satu kesalahan membatalkan
              semuanya, tanpa melewati/menimpa data existing. Tidak membuat akun
              atau saldo.
            </p>
            <label>
              Pilih workbook
              <input
                type="file"
                disabled={importBusy || importUnknown}
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setImportComplete(false);
                  importAttempt.current = null;
                  setImportFile(event.target.files?.[0] ?? null);
                  setMessage("");
                  setPreview(null);
                }}
              />
            </label>
            <p className="panel-description">
              Pratinjau belum menyimpan data. Periksa hasil validasi sebelum
              mengimpor pegawai.
            </p>
            {preview && (
              <section className="import-preview" aria-live="polite">
                <div className="import-summary">
                  <span>
                    <strong>{preview.totalRows}</strong>Total baris
                  </span>
                  <span>
                    <strong>{preview.validRows}</strong>Valid
                  </span>
                  <span>
                    <strong>{preview.invalidRows}</strong>Tidak valid
                  </span>
                </div>
                <ImportRows preview={preview} imported={importComplete} />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={importBusy}
                  onClick={downloadImportResult}
                >
                  Unduh hasil (JSON)
                </button>
                {preview.errors.length ? (
                  <p role="alert">
                    Perbaiki kolom bermasalah pada baris di atas. Belum ada
                    baris yang disimpan; impor hanya dapat dikonfirmasi jika
                    semuanya valid.
                  </p>
                ) : (
                  <p className="feedback">
                    {importComplete
                      ? "Seluruh baris di atas berhasil diimpor."
                      : "Semua baris valid dan siap diimpor."}
                  </p>
                )}
              </section>
            )}
            <div className="panel-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={!importFile || importBusy || importUnknown}
                onClick={() => void sendImport(false)}
              >
                {importBusy ? "Memproses…" : "Preview & Validasi"}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={
                  !importFile ||
                  !preview ||
                  preview.invalidRows > 0 ||
                  preview.totalRows === 0 ||
                  importBusy
                }
                onClick={() => void sendImport(true)}
              >
                {importBusy
                  ? "Memproses…"
                  : importUnknown
                    ? "Coba konfirmasi lagi"
                    : "Konfirmasi Impor Pegawai"}
              </button>
            </div>
          </div>
        </AdminFloatingWindow>
      )}
      {(mode || selected) && (
        <AdminFloatingWindow
          title={
            mode === "create"
              ? "Tambah Pegawai"
              : mode === "edit"
                ? "Edit Pegawai"
                : (selected?.fullName ?? "Detail Pegawai")
          }
          onClose={closePanel}
          busy={busy}
        >
          {message && (
            <p className="feedback directory-panel-feedback" role="status">
              {message}
            </p>
          )}
          {mode ? (
            <EmployeeForm
              busy={busy}
              form={form}
              setForm={setForm}
              employees={employees}
              editingId={selected?.id}
              mode={mode}
              submit={submit}
              cancel={() =>
                mode === "edit" && selected ? setMode(null) : closePanel()
              }
            />
          ) : (
            selected && (
              <EmployeeDetail
                busy={busy}
                employee={selected}
                employees={employees}
                onEdit={() => openEdit(selected)}
                onStatus={() => void changeStatus(selected)}
                onAccountChanged={handleAccountChanged}
              />
            )
          )}
        </AdminFloatingWindow>
      )}
    </section>
  );
}

function EmployeeForm({
  busy,
  form,
  setForm,
  employees,
  editingId,
  mode,
  submit,
  cancel,
}: {
  busy: boolean;
  form: typeof empty;
  setForm: (value: typeof empty) => void;
  employees: Employee[];
  editingId?: string;
  mode: Exclude<FormMode, null>;
  submit: (event: FormEvent) => void;
  cancel: () => void;
}) {
  return (
    <form className="management-form" onSubmit={submit}>
      <fieldset disabled={busy} className="employee-fields">
        <p className="panel-description">
          Lengkapi data utama pegawai. Semua kolom bertanda wajib harus diisi.
        </p>
        <div className="form-field-grid">
          {(
            [
              ["nip", "NIP"],
              ["fullName", "Nama lengkap"],
              ["positionTitle", "Jabatan"],
              ["workUnit", "Unit kerja"],
            ] as const
          ).map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                required
                type="text"
                maxLength={name === "nip" ? 32 : 200}
                autoCapitalize={name === "nip" ? "off" : undefined}
                autoCorrect={name === "nip" ? "off" : undefined}
                spellCheck={name === "nip" ? false : undefined}
                value={form[name]}
                onChange={(event) =>
                  setForm({ ...form, [name]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        <label>
          Tanggal mulai bekerja <span className="optional">(opsional)</span>
          <input
            type="date"
            value={form.employmentStartDate}
            onChange={(event) =>
              setForm({ ...form, employmentStartDate: event.target.value })
            }
          />
        </label>
        <label>
          Atasan langsung <span className="optional">(opsional)</span>
          <select
            value={form.directSupervisorId}
            onChange={(event) =>
              setForm({ ...form, directSupervisorId: event.target.value })
            }
          >
            <option value="">Tidak ada</option>
            {employees
              .filter((employee) => employee.id !== editingId)
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName} — {employee.nip}
                </option>
              ))}
          </select>
        </label>
        <div className="panel-actions">
          <button className="secondary-button" type="button" onClick={cancel}>
            Batal
          </button>
          <button className="primary-button" type="submit">
            {mode === "edit" ? "Simpan Perubahan" : "Tambah Pegawai"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function EmployeeDetail({
  busy,
  employee,
  employees,
  onEdit,
  onStatus,
  onAccountChanged,
}: {
  busy: boolean;
  employee: Employee;
  employees: Employee[];
  onEdit: () => void;
  onStatus: () => void;
  onAccountChanged: (employeeId: string) => void;
}) {
  const [confirmStatus, setConfirmStatus] = useState(false);
  const supervisor = employees.find(
    (item) => item.id === employee.directSupervisorId,
  );
  return (
    <div className="employee-detail">
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">DATA PEGAWAI</p>
            <h3>Informasi kepegawaian</h3>
          </div>
          <StatusBadge active={employee.isActive} />
        </div>
        <dl className="detail-grid">
          <div>
            <dt>NIP</dt>
            <dd>{employee.nip}</dd>
          </div>
          <div>
            <dt>Nama</dt>
            <dd>{employee.fullName}</dd>
          </div>
          <div>
            <dt>Jabatan</dt>
            <dd>{employee.positionTitle}</dd>
          </div>
          <div>
            <dt>Unit kerja</dt>
            <dd>{employee.workUnit}</dd>
          </div>
          <div>
            <dt>Atasan langsung</dt>
            <dd>{supervisor?.fullName ?? "Tidak ada"}</dd>
          </div>
          <div>
            <dt>Status Pegawai</dt>
            <dd>{employee.isActive ? "Aktif" : "Tidak aktif"}</dd>
          </div>
        </dl>
        <div className="detail-actions">
          <button
            disabled={busy}
            className="secondary-button"
            type="button"
            onClick={onEdit}
          >
            Edit Pegawai
          </button>
          <button
            className={employee.isActive ? "danger-button" : "success-button"}
            type="button"
            disabled={busy}
            onClick={() => setConfirmStatus(true)}
          >
            {employee.isActive ? "Nonaktifkan Pegawai" : "Aktifkan Pegawai"}
          </button>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">AKUN LOGIN</p>
            <h3>Akses aplikasi</h3>
          </div>
        </div>
        <EmployeeAccountControls
          key={employee.id}
          employeeId={employee.id}
          onAccountChanged={() => onAccountChanged(employee.id)}
        />
      </section>
      {confirmStatus && (
        <AdminFloatingWindow
          title={
            employee.isActive
              ? "Nonaktifkan Pegawai?"
              : "Aktifkan kembali Pegawai?"
          }
          busy={busy}
          onClose={() => setConfirmStatus(false)}
        >
          <p>{employee.fullName}</p>
          <p>
            {employee.isActive
              ? "Pegawai masuk Arsip dan tidak dapat login. Seluruh sesi lama dicabut; histori saldo, pengajuan dan dokumen tetap tersimpan."
              : "Pegawai kembali aktif. Akun yang nonaktif tetap nonaktif; sesi lama tidak dipulihkan."}
          </p>
          <div className="panel-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmStatus(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => {
                setConfirmStatus(false);
                onStatus();
              }}
            >
              Ya, {employee.isActive ? "nonaktifkan" : "aktifkan kembali"}
            </button>
          </div>
        </AdminFloatingWindow>
      )}
    </div>
  );
}

function ImportRows({
  preview,
  imported,
}: {
  preview: EmployeeImportPreview;
  imported: boolean;
}) {
  const paging = useAdminPagination(
    preview.rows,
    JSON.stringify(preview.rows.map((row) => row.nip)),
  );
  return (
    <>
      <div className="employee-import-rows">
        <table className="employee-table">
          <thead>
            <tr>
              <th>Baris</th>
              <th>NIP / Nama</th>
              <th>Hasil</th>
            </tr>
          </thead>
          <tbody>
            {paging.items.map((row) => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td>
                  {row.nip}
                  <br />
                  {row.fullName}
                </td>
                <td>
                  {preview.errors.some(
                    (error) => error.rowNumber === row.rowNumber,
                  )
                    ? "Tidak valid"
                    : imported
                      ? "Berhasil"
                      : "Valid"}
                  {preview.errors
                    .filter((error) => error.rowNumber === row.rowNumber)
                    .map((error) => (
                      <p key={error.field}>
                        {error.field}: {error.message}
                      </p>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdminPagination {...paging.controls} />
    </>
  );
}

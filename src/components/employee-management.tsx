"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
  const [mode, setMode] = useState<FormMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<EmployeeImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatusFilter>("all");
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
      if (!matchesStatus) return false;
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
  }, [employees, query, statusFilter]);

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

  const panelOpen = importOpen || Boolean(mode || selected);

  const handleAccountChanged = useCallback((employeeId: string) => {
    setAccountRefreshVersions((versions) => ({
      ...versions,
      [employeeId]: (versions[employeeId] ?? 0) + 1,
    }));
  }, []);

  const requestEmployees = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      try {
        const response = await fetch("/api/admin/employees");
        const data = await response.json();
        if (!isCurrent()) return;
        if (response.ok) setEmployees(data.employees);
        else {
          setListError(true);
          setMessage(data.error ?? "Data pegawai gagal dimuat.");
        }
      } catch {
        if (isCurrent()) {
          setListError(true);
          setMessage(
            "Data pegawai gagal dimuat. Periksa koneksi lalu coba lagi.",
          );
        }
      } finally {
        if (isCurrent()) setLoading(false);
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

  useEffect(() => {
    if (!panelOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (importOpen) {
        setImportOpen(false);
        return;
      }
      closePanel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [panelOpen, importOpen]);

  function openCreate() {
    setMode("create");
    setSelectedId(null);
    setForm(empty);
    setMessage("");
  }
  function openDetail(employee: Employee) {
    setSelectedId(employee.id);
    setMode(null);
    setMessage("");
  }
  function openEdit(employee: Employee) {
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
    setMode(null);
    setSelectedId(null);
    setForm(empty);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const editing = mode === "edit" && selected;
    setMessage("");
    const response = await fetch(
      editing ? `/api/admin/employees/${selected.id}` : "/api/admin/employees",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Operasi gagal.");
    setMessage(
      editing
        ? "Data pegawai berhasil diperbarui."
        : "Pegawai berhasil ditambahkan.",
    );
    closePanel();
    await load();
  }
  async function changeStatus(employee: Employee) {
    const response = await fetch(`/api/admin/employees/${employee.id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !employee.isActive }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? `Pegawai berhasil ${employee.isActive ? "dinonaktifkan" : "diaktifkan"}.`
        : data.error,
    );
    if (response.ok) await load();
  }

  async function sendImport(commit: boolean) {
    if (!importFile) return;
    setImportBusy(true);
    setMessage("");
    const body = new FormData();
    body.append("file", importFile);
    try {
      const response = await fetch("/api/admin/employees/import", {
        method: commit ? "PUT" : "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) return setMessage(data.error ?? "Impor pegawai gagal.");
      if (commit) {
        setMessage(`${data.imported} pegawai berhasil diimpor.`);
        setImportOpen(false);
        setPreview(null);
        setImportFile(null);
        await load();
      } else setPreview(data.preview);
    } catch {
      setMessage("Impor pegawai gagal. Periksa koneksi lalu coba lagi.");
    } finally {
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
            onClick={() => {
              setImportOpen(true);
              setPreview(null);
              setMessage("");
            }}
          >
            <AdminUiIcon name="upload" /> Import Excel
          </button>
          <button className="primary-button" type="button" onClick={openCreate}>
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
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as EmployeeStatusFilter)
                }
              >
                <option value="all">Semua status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Tidak aktif</option>
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
                setStatusFilter("all");
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
                  {visibleEmployees.map((employee) => (
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
              {visibleEmployees.map((employee) => (
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
      {importOpen && (
        <>
          <button
            className="panel-scrim"
            type="button"
            aria-label="Tutup impor"
            onClick={() => setImportOpen(false)}
          />
          <aside
            className="management-panel import-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-import-title"
          >
            <header>
              <div>
                <p className="eyebrow">IMPORT PEGAWAI</p>
                <h2 id="employee-import-title">Import Excel</h2>
              </div>
              <button
                className="panel-close"
                type="button"
                onClick={() => setImportOpen(false)}
                aria-label="Tutup panel"
              >
                ×
              </button>
            </header>
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
              <label>
                Pilih workbook
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    setImportFile(event.target.files?.[0] ?? null);
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
                  {preview.errors.length ? (
                    <div className="import-errors">
                      <table className="employee-table">
                        <thead>
                          <tr>
                            <th scope="col">Baris</th>
                            <th scope="col">NIP</th>
                            <th scope="col">Kolom</th>
                            <th scope="col">Kesalahan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.errors.map((error, index) => (
                            <tr
                              key={`${error.rowNumber}-${error.field}-${index}`}
                            >
                              <td>{error.rowNumber}</td>
                              <td className="mono">{error.nip || "—"}</td>
                              <td>{error.field}</td>
                              <td>{error.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="feedback">
                      Semua baris valid dan siap diimpor.
                    </p>
                  )}
                </section>
              )}
              <div className="panel-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!importFile || importBusy}
                  onClick={() => void sendImport(false)}
                >
                  {importBusy ? "Memvalidasi…" : "Preview & Validasi"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={
                    !preview ||
                    preview.invalidRows > 0 ||
                    preview.totalRows === 0 ||
                    importBusy
                  }
                  onClick={() => void sendImport(true)}
                >
                  Impor Pegawai
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
      {(mode || selected) && (
        <>
          <button
            className="panel-scrim"
            type="button"
            aria-label="Tutup panel"
            onClick={closePanel}
          />
          <aside
            className="management-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-panel-title"
          >
            <header>
              <div>
                <p className="eyebrow">
                  {mode === "create" ? "DATA BARU" : "MASTER PEGAWAI"}
                </p>
                <h2 id="employee-panel-title">
                  {mode === "create"
                    ? "Tambah Pegawai"
                    : mode === "edit"
                      ? "Edit Pegawai"
                      : selected?.fullName}
                </h2>
              </div>
              <button
                className="panel-close"
                type="button"
                onClick={closePanel}
                aria-label="Tutup panel"
              >
                ×
              </button>
            </header>
            {message && (
              <p className="feedback directory-panel-feedback" role="status">
                {message}
              </p>
            )}
            {mode ? (
              <EmployeeForm
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
                  employee={selected}
                  employees={employees}
                  onEdit={() => openEdit(selected)}
                  onStatus={() => void changeStatus(selected)}
                  onAccountChanged={handleAccountChanged}
                />
              )
            )}
          </aside>
        </>
      )}
    </section>
  );
}

function EmployeeForm({
  form,
  setForm,
  employees,
  editingId,
  mode,
  submit,
  cancel,
}: {
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
    </form>
  );
}

function EmployeeDetail({
  employee,
  employees,
  onEdit,
  onStatus,
  onAccountChanged,
}: {
  employee: Employee;
  employees: Employee[];
  onEdit: () => void;
  onStatus: () => void;
  onAccountChanged: (employeeId: string) => void;
}) {
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
          <button className="secondary-button" type="button" onClick={onEdit}>
            Edit Pegawai
          </button>
          <button
            className={employee.isActive ? "danger-button" : "success-button"}
            type="button"
            onClick={onStatus}
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
          employeeId={employee.id}
          onAccountChanged={() => onAccountChanged(employee.id)}
        />
      </section>
    </div>
  );
}

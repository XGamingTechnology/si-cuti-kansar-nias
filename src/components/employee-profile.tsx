"use client";
import { useDashboardJSON } from "./use-dashboard-json";
export function EmployeeProfile({ employeeId }: { employeeId: string }) {
  const profile = useDashboardJSON<{
    employee: {
      fullName: string;
      nip: string;
      positionTitle: string;
      workUnit: string;
    };
  }>(`/api/employees/${employeeId}`);
  return (
    <section className="profile-surface" id="profil">
      <p className="eyebrow">PROFIL SAYA</p>
      <h1>Profil Pegawai</h1>
      {profile.loading && <p role="status">Memuat profil…</p>}
      {profile.error && (
        <div role="alert">
          <p>{profile.error}</p>
          <button type="button" onClick={profile.reload}>
            Coba lagi
          </button>
        </div>
      )}
      {profile.data && (
        <dl className="employee-profile-fields">
          {[
            ["Nama", profile.data.employee.fullName],
            ["NIP", profile.data.employee.nip],
            ["Jabatan", profile.data.employee.positionTitle],
            ["Unit kerja", profile.data.employee.workUnit],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <a className="secondary-button button-link" href="/dashboard">
        Kembali ke beranda
      </a>
    </section>
  );
}

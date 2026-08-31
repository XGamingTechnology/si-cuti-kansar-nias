import { employees } from "@/lib/prototype-data";
import { Badge, DataTable, PageHeader, Panel, SearchBar, StatCard } from "./ui";

const Placeholder = () => <span className="prototype-label">DATA CONTOH</span>;

export function AdminDashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Senin, 24 Agustus 2026"
        title="Selamat datang, Admin"
        description="Ringkasan tampilan administrasi SI CUTI hari ini."
        action={<Placeholder />}
      />
      <div className="stats">
        <StatCard
          label="Data pegawai"
          value="93"
          hint="Cakupan prototype"
          icon="people"
        />
        <StatCard
          label="Pengajuan ditampilkan"
          value="08"
          hint="Data visual, bukan status riil"
          icon="file"
          tone="orange"
        />
        <StatCard
          label="Agenda contoh"
          value="04"
          hint="Belum terhubung kalender"
          icon="calendar"
          tone="green"
        />
        <StatCard
          label="Arsip contoh"
          value="128"
          hint="Angka ilustrasi"
          icon="file"
          tone="purple"
        />
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Ikhtisar pengajuan"
          aside={<button className="text-action">Lihat halaman →</button>}
        >
          <DataTable
            columns={["Pegawai", "Jenis", "Periode", "Keterangan"]}
            rows={[
              [
                <Name key="1" initials="ML" name="Maya Larasati" />,
                "Cuti Tahunan",
                "26–27 Agu",
                <Badge key="b" tone="warning">
                  Contoh
                </Badge>,
              ],
              [
                <Name key="2" initials="DA" name="Dimas Angkasa" />,
                "Cuti Sakit",
                "22 Agu",
                <Badge key="b" tone="info">
                  Contoh
                </Badge>,
              ],
              [
                <Name key="3" initials="BC" name="Bima Cakrawala" />,
                "Izin",
                "28 Agu",
                <Badge key="b">Contoh</Badge>,
              ],
            ]}
          />
        </Panel>
        <Panel
          title="Kalender visual"
          aside={<span className="month">Agustus 2026</span>}
        >
          <MiniCalendar />
        </Panel>
      </div>
      <Panel title="Catatan prototype" className="info-panel">
        <p>
          Angka, agenda, dan baris pengajuan di halaman ini hanya untuk
          penilaian visual. Definisi indikator, workflow, status, dan aturan
          saldo belum diterapkan.
        </p>
      </Panel>
    </>
  );
}

export function EmployeeDashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Senin, 24 Agustus 2026"
        title="Halo, Raka"
        description="Lihat ringkasan layanan kepegawaian Anda dalam satu tempat."
        action={<Placeholder />}
      />
      <div className="employee-hero">
        <div>
          <p className="eyebrow light">PROFIL PEGAWAI CONTOH</p>
          <h2>Raka Mahesa</h2>
          <p>Penata Kelola SAR · Seksi Operasi</p>
          <span>NIP 1990XXXX 20XX01 1XXX</span>
        </div>
        <div className="hero-avatar">RM</div>
      </div>
      <div className="stats employee-stats">
        <StatCard
          label="Cuti N"
          value="—"
          hint="Menunggu aturan M3"
          icon="calendar"
        />
        <StatCard
          label="Cuti N-1"
          value="—"
          hint="Menunggu aturan M3"
          icon="calendar"
          tone="orange"
        />
        <StatCard
          label="Cuti N-2"
          value="—"
          hint="Menunggu aturan M3"
          icon="calendar"
          tone="green"
        />
        <StatCard
          label="Klaim Cuti Bersama"
          value="—"
          hint="Menunggu aturan M3"
          icon="file"
          tone="purple"
        />
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Aktivitas terkini"
          aside={<span className="prototype-label">CONTOH VISUAL</span>}
        >
          <div className="timeline">
            <div>
              <i />
              <span>
                <strong>Permukaan riwayat tersedia</strong>
                <small>Detail workflow belum diterapkan</small>
              </span>
              <time>Hari ini</time>
            </div>
            <div>
              <i />
              <span>
                <strong>Profil pegawai ditampilkan</strong>
                <small>Menggunakan identitas fiktif</small>
              </span>
              <time>Prototype</time>
            </div>
            <div>
              <i />
              <span>
                <strong>Layanan cuti & izin</strong>
                <small>Menu masih berupa placeholder visual</small>
              </span>
              <time>M3+</time>
            </div>
          </div>
        </Panel>
        <Panel
          title="Kalender visual"
          aside={<span className="month">Agustus 2026</span>}
        >
          <MiniCalendar />
        </Panel>
      </div>
    </>
  );
}

export function EmployeeDataPage() {
  const rows = employees.map((e) => [
    <Name
      key={e.nip}
      initials={e.name
        .split(" ")
        .map((n) => n[0])
        .join("")}
      name={e.name}
    />,
    <span key="nip" className="mono">
      {e.nip}
    </span>,
    e.position,
    e.unit,
    <Badge key="status" tone={e.status === "Aktif" ? "success" : "neutral"}>
      {e.status}
    </Badge>,
    <button key="action" className="dots" aria-label={`Opsi ${e.name}`}>
      •••
    </button>,
  ]);
  return (
    <>
      <PageHeader
        eyebrow="MASTER DATA · PROTOTYPE"
        title="Data Pegawai"
        description="Pratinjau daftar pegawai dan atribut master dasar."
        action={<button className="primary-button">＋ Tambah pegawai</button>}
      />
      <Panel>
        <div className="table-tools">
          <SearchBar placeholder="Cari nama atau NIP..." />
          <div>
            <button className="secondary-button">☷ Filter</button>
            <button className="secondary-button">⇧ Impor Excel</button>
          </div>
        </div>
        <DataTable
          columns={[
            "Nama pegawai",
            "NIP",
            "Jabatan",
            "Unit kerja",
            "Status",
            "",
          ]}
          rows={rows}
        />
        <div className="pagination">
          <p>
            Menampilkan <strong>5</strong> data fiktif
          </p>
          <div>
            <button disabled>‹</button>
            <button className="active">1</button>
            <button>2</button>
            <button>3</button>
            <button>›</button>
          </div>
        </div>
      </Panel>
      <Panel title="Batas prototype" className="info-panel">
        <p>
          Tombol tambah, impor, filter, dan menu baris bersifat visual. Tidak
          ada CRUD, validasi impor, akun, atau data pegawai nyata yang diproses.
        </p>
      </Panel>
    </>
  );
}

function Name({ initials, name }: { initials: string; name: string }) {
  return (
    <span className="person">
      <i>{initials}</i>
      <strong>{name}</strong>
    </span>
  );
}
function MiniCalendar() {
  const dates = Array.from({ length: 35 }, (_, i) => (i < 5 ? null : i - 4));
  return (
    <div className="mini-calendar">
      <div className="weekdays">
        {"SMTWTFS".split("").map((d, i) => (
          <span key={i}>
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][i]}
          </span>
        ))}
      </div>
      <div className="days">
        {dates.map((d, i) => (
          <span
            key={i}
            className={
              d === 24 ? "today" : d === 26 || d === 27 ? "marked" : ""
            }
          >
            {d && d <= 30 ? d : ""}
          </span>
        ))}
      </div>
      <div className="calendar-note">
        <i />
        Tanggal berwarna hanya elemen visual prototype
      </div>
    </div>
  );
}

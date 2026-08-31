export type PreviewRole = "login" | "admin" | "employee";

export const adminNavigation = [
  "Dashboard",
  "Data Pegawai",
  "Pengajuan Cuti",
  "Klaim Cuti Bersama",
  "Perizinan",
  "Arsip/Riwayat",
  "Laporan",
  "Pengaturan",
];

export const employeeNavigation = [
  "Dashboard",
  "Pengajuan Cuti",
  "Klaim Cuti Bersama",
  "Pengajuan Izin",
  "Riwayat",
  "Saldo Cuti",
  "Kalender Cuti",
  "Profil",
];

export const employees = [
  {
    nip: "19900101 20XX01 1XXX",
    name: "Raka Samudra",
    position: "Analis Kepegawaian",
    unit: "Subbagian Umum",
    status: "Aktif",
  },
  {
    nip: "19920314 20XX02 2XXX",
    name: "Maya Larasati",
    position: "Pranata Komputer",
    unit: "Subbagian Umum",
    status: "Aktif",
  },
  {
    nip: "19881120 20XX01 1XXX",
    name: "Dimas Angkasa",
    position: "Penata Kelola SAR",
    unit: "Seksi Operasi",
    status: "Aktif",
  },
  {
    nip: "19950708 20XX02 2XXX",
    name: "Nara Mentari",
    position: "Pengelola Barang Milik Negara",
    unit: "Subbagian Umum",
    status: "Nonaktif",
  },
  {
    nip: "19911002 20XX01 1XXX",
    name: "Bima Cakrawala",
    position: "Rescuer",
    unit: "Seksi Operasi",
    status: "Aktif",
  },
];

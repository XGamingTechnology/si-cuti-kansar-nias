import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "SI CUTI — Sistem Informasi Cuti dan Izin",
  description:
    "Sistem Informasi Cuti dan Izin Kantor SAR Nias",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

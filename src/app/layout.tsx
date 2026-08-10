import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "SI CUTI", description: "Fondasi teknis SI CUTI" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}

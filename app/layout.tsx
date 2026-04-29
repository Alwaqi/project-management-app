import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruang Kerja Proyek",
  description: "Frontend manajemen proyek ringan untuk Leader dan Anggota Tim.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}

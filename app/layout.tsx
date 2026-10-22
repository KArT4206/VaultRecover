import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "VaultRecover — Free File Password Recovery",
  description:
    "Recover forgotten passwords from your own ZIP and PDF files, free. Real, verified recovery — not a guess.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-graphite-950 font-sans antialiased">
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}

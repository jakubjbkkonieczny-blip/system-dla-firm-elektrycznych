import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { getMeData } from "@/lib/server/me/get-me";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elektra",
  description: "System ogarniania zleceń dla ekip technicznych",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialDisplayName: string | null = null;
  try {
    const me = await getMeData();
    initialDisplayName = me.displayName;
  } catch {}

  return (
    <html lang="pl">
      <head>
        {/* 🔥 PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>

      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <AppShell initialDisplayName={initialDisplayName}>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/bootstrap-script";
import { APP_BRANDING } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_BRANDING.name,
  description: APP_BRANDING.description,
  applicationName: APP_BRANDING.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_BRANDING.shortName,
  },
  openGraph: {
    title: APP_BRANDING.name,
    description: APP_BRANDING.description,
    type: "website",
    siteName: APP_BRANDING.name,
  },
  twitter: {
    card: "summary",
    title: APP_BRANDING.name,
    description: APP_BRANDING.description,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#070d18" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" data-theme="light-business" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <link rel="manifest" href="/manifest.json" />
      </head>

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden`}
      >
        <AuthProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
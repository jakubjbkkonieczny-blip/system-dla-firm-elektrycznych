import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ActiveCompanyProvider } from "@/components/ActiveCompanyProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { ServiceWorkerRegistrar } from "@/components/push/ServiceWorkerRegistrar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme/bootstrap-script";
import { APP_BRANDING, LOGO_BRANDING, appMetadataBase } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: appMetadataBase(),
  title: APP_BRANDING.name,
  description: APP_BRANDING.description,
  applicationName: APP_BRANDING.name,
  icons: {
    icon: [
      { url: LOGO_BRANDING.faviconPath, sizes: "32x32", type: "image/png" },
      { url: LOGO_BRANDING.icon192Path, sizes: "192x192", type: "image/png" },
      { url: LOGO_BRANDING.icon512Path, sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: LOGO_BRANDING.appleTouchIconPath, sizes: "180x180", type: "image/png" },
    ],
  },
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
    images: [
      {
        url: LOGO_BRANDING.ogImagePath,
        width: 1200,
        height: 630,
        alt: APP_BRANDING.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_BRANDING.name,
    description: APP_BRANDING.description,
    images: [LOGO_BRANDING.ogImagePath],
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
          <ActiveCompanyProvider>
            <ThemeProvider>
              <ServiceWorkerRegistrar />
              <AppShell>{children}</AppShell>
            </ThemeProvider>
          </ActiveCompanyProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
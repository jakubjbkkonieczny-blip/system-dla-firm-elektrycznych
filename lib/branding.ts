/**
 * Central product branding configuration.
 * Update logo asset paths here when custom logo assets replace defaults.
 * Keep public/manifest.json in sync with APP_BRANDING name, shortName and description.
 */
export const APP_BRANDING = {
  name: "VectorWork",
  shortName: "VectorWork",
  description:
    "Profesjonalny system zarządzania zleceniami, pracownikami i realizacją prac terenowych.",
  footerTagline: "system dla firm technicznych",
  exportDocumentCreator: "VectorWork Kosztorysy",
} as const;

export const LOGO_BRANDING = {
  icon192Path: "/icon-192.png",
  icon512Path: "/icon-512.png",
  faviconPath: "/favicon.png",
  appleTouchIconPath: "/apple-touch-icon.png",
  ogImagePath: "/og-image.png",
} as const;

export const PDF_BRANDING = {
  appName: APP_BRANDING.name,
  tagline: "Profesjonalne kosztorysy dla branży technicznej",
  documentTitle: "Kosztorys",
  colors: {
    primary: "#D97706",
    primaryDark: "#B45309",
    primaryLight: "#FEF3C7",
    slate900: "#0F172A",
    slate700: "#334155",
    slate500: "#64748B",
    slate200: "#E2E8F0",
    slate50: "#F8FAFC",
    white: "#FFFFFF",
  },
} as const;

export function appMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL;
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // fall through
    }
  }
  return new URL("http://localhost:3000");
}

import { THEME_META_COLORS, THEME_STORAGE_KEY } from "@/lib/theme/constants";
import type { UserTheme } from "@/lib/theme/types";
import { userThemeToDataTheme } from "@/lib/theme/types";

export function applyThemeToDocument(theme: UserTheme): void {
  if (typeof document === "undefined") return;

  const dataTheme = userThemeToDataTheme(theme);
  document.documentElement.setAttribute("data-theme", dataTheme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore storage errors (private mode, quota)
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_META_COLORS[theme]);
  }
}

export function readStoredTheme(): UserTheme | null {
  if (typeof localStorage === "undefined") return null;

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "LIGHT_BUSINESS" || stored === "DARK_ELECTRIC") {
      return stored;
    }
  } catch {
    // ignore
  }

  return null;
}

import type { UserTheme } from "@/lib/theme/types";

export const DEFAULT_USER_THEME: UserTheme = "LIGHT_BUSINESS";

export const THEME_STORAGE_KEY = "elektra-theme";

export const THEME_META_COLORS: Record<UserTheme, string> = {
  LIGHT_BUSINESS: "#f5f6f8",
  DARK_ELECTRIC: "#070d18",
};

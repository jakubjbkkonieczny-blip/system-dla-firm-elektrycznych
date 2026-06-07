export const USER_THEMES = ["LIGHT_BUSINESS", "DARK_ELECTRIC"] as const;

export type UserTheme = (typeof USER_THEMES)[number];

export type DataTheme = "light-business" | "dark-electric";

export function isUserTheme(value: unknown): value is UserTheme {
  return typeof value === "string" && USER_THEMES.includes(value as UserTheme);
}

export function userThemeToDataTheme(theme: UserTheme): DataTheme {
  return theme === "DARK_ELECTRIC" ? "dark-electric" : "light-business";
}

export function dataThemeToUserTheme(dataTheme: DataTheme): UserTheme {
  return dataTheme === "dark-electric" ? "DARK_ELECTRIC" : "LIGHT_BUSINESS";
}

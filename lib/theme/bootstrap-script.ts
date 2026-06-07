import { DEFAULT_USER_THEME, THEME_STORAGE_KEY } from "@/lib/theme/constants";
import { userThemeToDataTheme } from "@/lib/theme/types";

/** Inline script applied before paint to prevent theme flicker (PWA + SSR). */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var theme=t==="DARK_ELECTRIC"?"dark-electric":"light-business";if(t!=="LIGHT_BUSINESS"&&t!=="DARK_ELECTRIC"){theme=${JSON.stringify(userThemeToDataTheme(DEFAULT_USER_THEME))};}document.documentElement.setAttribute("data-theme",theme);}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(userThemeToDataTheme(DEFAULT_USER_THEME))});}})();`;

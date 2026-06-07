"use client";

import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { applyThemeToDocument } from "@/lib/theme/apply-theme";
import { DEFAULT_USER_THEME } from "@/lib/theme/constants";
import type { UserTheme } from "@/lib/theme/types";
import { isUserTheme } from "@/lib/theme/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ThemeCtx = {
  theme: UserTheme;
  setTheme: (theme: UserTheme) => Promise<void>;
  ready: boolean;
};

const Ctx = createContext<ThemeCtx | null>(null);

type AuthMeThemeResponse = {
  theme?: unknown;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [theme, setThemeState] = useState<UserTheme>(DEFAULT_USER_THEME);
  const [ready, setReady] = useState(false);
  const loadedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      loadedForUidRef.current = null;
      applyThemeToDocument(DEFAULT_USER_THEME);
      setThemeState(DEFAULT_USER_THEME);
      setReady(true);
      return;
    }

    if (loadedForUidRef.current === user.uid) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json().catch(() => null)) as AuthMeThemeResponse | null;
          const nextTheme = isUserTheme(data?.theme) ? data.theme : DEFAULT_USER_THEME;
          loadedForUidRef.current = user.uid;
          setThemeState(nextTheme);
          applyThemeToDocument(nextTheme);
        }
      } catch {
        if (!cancelled) {
          applyThemeToDocument(DEFAULT_USER_THEME);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const setTheme = useCallback(
    async (next: UserTheme) => {
      setThemeState(next);
      applyThemeToDocument(next);

      if (!user) return;

      await apiFetch("/api/me/theme", {
        method: "PATCH",
        body: JSON.stringify({ theme: next }),
      });
    },
    [user]
  );

  const value = useMemo<ThemeCtx>(
    () => ({ theme, setTheme, ready }),
    [theme, setTheme, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

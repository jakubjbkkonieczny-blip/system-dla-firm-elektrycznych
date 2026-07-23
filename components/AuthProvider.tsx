"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clearActiveCompanySessionState } from "@/lib/activeCompanyStorage";
import { shouldRefreshSessionOnFocus } from "@/lib/authSessionSync";

type User = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<User | null>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

type AuthMeResponse = {
  id?: unknown;
  email?: unknown;
  displayName?: unknown;
};

async function fetchSessionUser(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as AuthMeResponse | null;
    if (!data || typeof data.id !== "string" || data.id.length === 0) {
      return null;
    }

    return {
      uid: data.id,
      email: typeof data.email === "string" ? data.email : null,
      displayName:
        typeof data.displayName === "string" ? data.displayName : null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(false);

  const refresh = useCallback(async (): Promise<User | null> => {
    const next = await fetchSessionUser();
    if (isMountedRef.current) {
      setUser(next);
      setLoading(false);
    }
    return next;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();
    return () => {
      isMountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    const lastRefreshAtRef = { current: 0 };

    async function onFocusOrVisible() {
      if (
        !shouldRefreshSessionOnFocus({
          visibilityState: document.visibilityState,
          now: Date.now(),
          lastRefreshAt: lastRefreshAtRef.current,
        })
      ) {
        return;
      }

      lastRefreshAtRef.current = Date.now();
      await refresh();
    }

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
    } catch {
      // ignore network errors; we still clear client state below
    }

    if (typeof window !== "undefined") {
      clearActiveCompanySessionState(localStorage);
    }

    if (isMountedRef.current) {
      setUser(null);
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ user, loading, refresh, logout }),
    [user, loading, refresh, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

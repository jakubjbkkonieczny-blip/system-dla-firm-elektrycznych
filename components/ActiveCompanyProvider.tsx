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
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import {
  ACTIVE_COMPANY_ID_CHANGE_EVENT,
  LEGACY_ACTIVE_COMPANY_ID_KEY,
  readScopedActiveCompanyId,
  removeLegacyActiveCompanyId,
  resolveActiveCompanyId,
  scopedActiveCompanyKey,
  writeScopedActiveCompanyId,
  type ResolveActiveCompanyResult,
} from "@/lib/activeCompanyStorage";

type ActiveCompanyCtx = {
  activeCompanyId: string;
  ready: boolean;
  setActiveCompanyId: (id: string) => void;
  clearActiveCompanyId: () => void;
  revalidate: () => Promise<void>;
};

const Ctx = createContext<ActiveCompanyCtx | null>(null);

function dispatchActiveCompanyChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_COMPANY_ID_CHANGE_EVENT));
}

function applyResolvedCompanyState(
  userId: string,
  resolved: ResolveActiveCompanyResult,
  setActiveCompanyIdState: (id: string) => void,
  setReady: (ready: boolean) => void
): void {
  if (resolved.discardLegacy) {
    removeLegacyActiveCompanyId(localStorage);
  }
  if (resolved.persistCompanyId) {
    writeScopedActiveCompanyId(localStorage, userId, resolved.persistCompanyId);
    dispatchActiveCompanyChange();
  }
  setActiveCompanyIdState(resolved.activeCompanyId ?? "");
  setReady(true);
}

export function ActiveCompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [activeCompanyId, setActiveCompanyIdState] = useState("");
  const [ready, setReady] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const revalidateGenerationRef = useRef(0);

  const revalidate = useCallback(async () => {
    const userId = user?.uid;
    if (!userId) {
      setActiveCompanyIdState("");
      setReady(true);
      return;
    }

    const generation = ++revalidateGenerationRef.current;
    setReady(false);

    try {
      const data = await apiFetch("/api/me/companies");
      if (generation !== revalidateGenerationRef.current) {
        return;
      }

      const companies = Array.isArray(data?.companies) ? data.companies : [];
      const accessibleCompanyIds = companies
        .map((c: { id?: unknown }) => (typeof c?.id === "string" ? c.id : ""))
        .filter((id: string) => id.length > 0);

      const storedCompanyId = readScopedActiveCompanyId(localStorage, userId);
      const legacyGlobalCompanyId =
        localStorage.getItem(LEGACY_ACTIVE_COMPANY_ID_KEY) || "";

      const resolved = resolveActiveCompanyId({
        userId,
        storedCompanyId,
        legacyGlobalCompanyId,
        accessibleCompanyIds,
      });

      if (generation !== revalidateGenerationRef.current) {
        return;
      }

      applyResolvedCompanyState(userId, resolved, setActiveCompanyIdState, setReady);
    } catch {
      if (generation !== revalidateGenerationRef.current) {
        return;
      }
      setActiveCompanyIdState("");
      setReady(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (loading) return;

    const previousUserId = userIdRef.current;
    const nextUserId = user?.uid ?? null;

    if (previousUserId === nextUserId) return;

    userIdRef.current = nextUserId;

    if (!nextUserId) {
      revalidateGenerationRef.current += 1;
      setActiveCompanyIdState("");
      removeLegacyActiveCompanyId(localStorage);
      setReady(true);
      dispatchActiveCompanyChange();
      return;
    }

    revalidateGenerationRef.current += 1;
    setActiveCompanyIdState("");
    setReady(false);
    dispatchActiveCompanyChange();
    void revalidate();
  }, [user?.uid, loading, revalidate]);

  useEffect(() => {
    const userId = user?.uid;
    if (!userId) return;

    const storageKey = scopedActiveCompanyKey(userId);

    const syncFromStorage = () => {
      setActiveCompanyIdState(readScopedActiveCompanyId(localStorage, userId));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) syncFromStorage();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_COMPANY_ID_CHANGE_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_COMPANY_ID_CHANGE_EVENT, syncFromStorage);
    };
  }, [user?.uid]);

  const setActiveCompanyId = useCallback(
    (id: string) => {
      const userId = user?.uid;
      if (!userId) return;
      writeScopedActiveCompanyId(localStorage, userId, id);
      setActiveCompanyIdState(id);
      dispatchActiveCompanyChange();
    },
    [user?.uid]
  );

  const clearActiveCompanyId = useCallback(() => {
    const userId = user?.uid;
    if (!userId) return;
    writeScopedActiveCompanyId(localStorage, userId, "");
    setActiveCompanyIdState("");
    dispatchActiveCompanyChange();
  }, [user?.uid]);

  const value = useMemo<ActiveCompanyCtx>(
    () => ({
      activeCompanyId,
      ready,
      setActiveCompanyId,
      clearActiveCompanyId,
      revalidate,
    }),
    [activeCompanyId, ready, setActiveCompanyId, clearActiveCompanyId, revalidate]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveCompany() {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error("useActiveCompany must be used within ActiveCompanyProvider");
  }
  return value;
}

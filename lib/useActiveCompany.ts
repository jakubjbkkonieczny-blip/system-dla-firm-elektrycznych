"use client";

import { useEffect, useState } from "react";

export const ACTIVE_COMPANY_ID_KEY = "activeCompanyId";
export const ACTIVE_COMPANY_ID_CHANGE_EVENT = "activeCompanyIdChange";

export function readActiveCompanyId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACTIVE_COMPANY_ID_KEY) || "";
}

/** Persists active company and notifies listeners in the same tab (storage event is cross-tab only). */
export function setActiveCompanyIdInStorage(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_COMPANY_ID_KEY, id);
  window.dispatchEvent(
    new CustomEvent(ACTIVE_COMPANY_ID_CHANGE_EVENT, { detail: { id } })
  );
}

export function useActiveCompanyId() {
  const [activeCompanyId, setActiveCompanyId] = useState<string>("");

  useEffect(() => {
    const read = () => setActiveCompanyId(readActiveCompanyId());

    read();

    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVE_COMPANY_ID_KEY) read();
    };
    const onChange = () => read();

    window.addEventListener("storage", onStorage);
    window.addEventListener(ACTIVE_COMPANY_ID_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACTIVE_COMPANY_ID_CHANGE_EVENT, onChange);
    };
  }, []);

  return activeCompanyId;
}

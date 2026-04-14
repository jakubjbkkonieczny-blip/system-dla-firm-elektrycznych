"use client";

import { useEffect, useState } from "react";

export function useActiveCompanyId() {
  const [activeCompanyId, setActiveCompanyId] = useState<string>("");

  useEffect(() => {
    const read = () => setActiveCompanyId(localStorage.getItem("activeCompanyId") || "");
    read();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "activeCompanyId") read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return activeCompanyId;
}
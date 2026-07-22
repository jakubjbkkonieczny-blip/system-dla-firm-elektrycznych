"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push/client";

/**
 * Registers the existing /sw.js without blocking render or prompting for notifications.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return null;
}

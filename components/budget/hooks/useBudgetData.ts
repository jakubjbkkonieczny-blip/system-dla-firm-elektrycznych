"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type {
  JobBudgetHeaderPayload,
  JobBudgetItemDto,
  JobBudgetLaborItemDto,
  JobBudgetSummary,
  PaginatedMeta,
} from "@/lib/jobs/budget/types";

export function useBudgetData(companyId: string, jobId: string) {
  const [header, setHeader] = useState<JobBudgetHeaderPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseUrl = `/api/companies/${companyId}/jobs/${jobId}/budget`;

  const loadHeader = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const payload = (await apiFetch(baseUrl)) as JobBudgetHeaderPayload;
      setHeader(payload);
    } catch (e: unknown) {
      setHeader(null);
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    loadHeader();
  }, [loadHeader]);

  const runMutation = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "ERROR");
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshHeader = useCallback(async () => {
    try {
      const payload = (await apiFetch(baseUrl)) as JobBudgetHeaderPayload;
      setHeader(payload);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "LOAD_ERROR");
    }
  }, [baseUrl]);

  const updateSummary = useCallback((summary: JobBudgetSummary) => {
    setHeader((prev) => (prev ? { ...prev, summary } : prev));
  }, []);

  return {
    header,
    loading,
    err,
    busy,
    baseUrl,
    loadHeader,
    refreshHeader,
    updateSummary,
    runMutation,
    setErr,
  };
}

export function useBudgetItems(companyId: string, jobId: string, enabled: boolean) {
  const [items, setItems] = useState<JobBudgetItemDto[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (p = page) => {
      if (!enabled) return;
      setLoading(true);
      try {
        const data = await apiFetch(
          `/api/companies/${companyId}/jobs/${jobId}/budget/items?page=${p}&limit=25`
        );
        setItems(Array.isArray(data?.items) ? data.items : []);
        setMeta(data?.meta ?? null);
        setPage(p);
      } finally {
        setLoading(false);
      }
    },
    [companyId, jobId, enabled, page]
  );

  useEffect(() => {
    if (enabled) load(1);
  }, [enabled, companyId, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { items, meta, loading, page, setPage, load };
}

export function useBudgetLabor(companyId: string, jobId: string, enabled: boolean) {
  const [laborItems, setLaborItems] = useState<JobBudgetLaborItemDto[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (p = page) => {
      if (!enabled) return;
      setLoading(true);
      try {
        const data = await apiFetch(
          `/api/companies/${companyId}/jobs/${jobId}/budget/labor?page=${p}&limit=25`
        );
        setLaborItems(Array.isArray(data?.laborItems) ? data.laborItems : []);
        setMeta(data?.meta ?? null);
        setPage(p);
      } finally {
        setLoading(false);
      }
    },
    [companyId, jobId, enabled, page]
  );

  useEffect(() => {
    if (enabled) load(1);
  }, [enabled, companyId, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { laborItems, meta, loading, page, setPage, load };
}

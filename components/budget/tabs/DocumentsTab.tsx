"use client";

import { normalizeDocumentTypeLabel } from "@/lib/jobs/budget/config";
import { formatPlnFromCents } from "@/lib/jobs/budget/money";
import type { JobBudgetItemDto } from "@/lib/jobs/budget/types";
import { BUDGET_BTN_SECONDARY } from "@/components/budget/constants";

type Props = {
  items: JobBudgetItemDto[];
  loading: boolean;
  meta: { page: number; totalPages: number; hasMore: boolean } | null;
  onPageChange: (page: number) => void;
  busy: boolean;
};

export function DocumentsTab({ items, loading, meta, onPageChange, busy }: Props) {
  const withDocs = items.filter((i) => i.documentType);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">Rejestr dokumentów kosztowych powiązanych z projektem.</p>

      {loading && withDocs.length === 0 ? (
        <div className="text-sm text-text-muted py-8 text-center">Ładowanie dokumentów...</div>
      ) : withDocs.length === 0 ? (
        <div className="text-sm text-text-muted py-8 text-center border border-border rounded-xl bg-bg-secondary">
          Brak dokumentów. Dodaj koszty z typem dokumentu w zakładce Koszty materiałów.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {withDocs.map((item) => (
            <div key={item.id} className="border border-border rounded-xl theme-glass bg-card p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-text">{normalizeDocumentTypeLabel(item.documentType)}</span>
                <span className="font-semibold text-text shrink-0">{formatPlnFromCents(item.grossAmountCents)}</span>
              </div>
              {item.documentNumber ? (
                <div className="text-sm text-text-muted">Nr: {item.documentNumber}</div>
              ) : null}
              {item.supplier ? (
                <div className="text-sm text-text-muted">Dostawca: {item.supplier}</div>
              ) : null}
              <div className="text-xs text-text-muted">{item.name}</div>
              {item.plannedDate ? (
                <div className="text-xs text-text-muted">Data: {item.plannedDate.slice(0, 10)}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button type="button" className={BUDGET_BTN_SECONDARY} disabled={meta.page <= 1 || busy} onClick={() => onPageChange(meta.page - 1)}>← Poprzednia</button>
          <span className="text-sm text-text-muted">Strona {meta.page} / {meta.totalPages}</span>
          <button type="button" className={BUDGET_BTN_SECONDARY} disabled={!meta.hasMore || busy} onClick={() => onPageChange(meta.page + 1)}>Następna →</button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { BUDGET_BTN_SECONDARY } from "@/components/budget/constants";
import { BUDGET_EXPORT_FORMATS, triggerBudgetExport } from "@/lib/jobs/budget/exports";
import type { BudgetExportContext } from "@/lib/jobs/budget/exports";

export function ExportMenu({ context }: { context: BudgetExportContext | null }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport(format: (typeof BUDGET_EXPORT_FORMATS)[number]["id"]) {
    if (!context) return;
    setOpen(false);
    const result = await triggerBudgetExport(format, context);
    setMessage(result.message);
    setTimeout(() => setMessage(null), 4000);
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={BUDGET_BTN_SECONDARY}
        onClick={() => setOpen((v) => !v)}
        disabled={!context}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Eksport ▾
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-1 z-20 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {BUDGET_EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              className="w-full text-left px-4 py-2.5 min-h-[44px] text-sm hover:bg-gray-50"
              onClick={() => handleExport(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      {message ? (
        <div className="absolute right-0 mt-1 z-10 text-xs text-gray-600 bg-gray-50 border rounded-lg px-3 py-2 whitespace-nowrap">
          {message}
        </div>
      ) : null}
    </div>
  );
}

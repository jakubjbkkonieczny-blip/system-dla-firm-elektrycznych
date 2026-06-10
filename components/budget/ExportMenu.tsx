"use client";

import { useState } from "react";
import { BUDGET_BTN_SECONDARY } from "@/components/budget/constants";
import { downloadBudgetExport } from "@/lib/jobs/budget/export-download";
import { BUDGET_EXPORT_FORMATS, type BudgetExportMenuContext } from "@/lib/jobs/budget/exports";

export function ExportMenu({ context }: { context: BudgetExportMenuContext | null }) {
  const [open, setOpen] = useState(false);
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function handleExport(format: (typeof BUDGET_EXPORT_FORMATS)[number]["id"]) {
    if (!context || busyFormat) return;
    setOpen(false);
    setBusyFormat(format);
    setMessage(null);

    const result = await downloadBudgetExport({
      companyId: context.companyId,
      jobId: context.jobId,
      jobNumber: context.jobNumber,
      format,
    });

    setBusyFormat(null);
    if (result.ok) {
      setMessage({ text: `Pobrano: ${result.filename}`, error: false });
    } else {
      setMessage({ text: result.message, error: true });
    }
    setTimeout(() => setMessage(null), 5000);
  }

  const disabled = !context || busyFormat != null;

  return (
    <div className="relative">
      <button
        type="button"
        className={BUDGET_BTN_SECONDARY}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busyFormat != null}
      >
        {busyFormat ? "Eksportowanie…" : "Eksport ▾"}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-1 z-20 min-w-[180px] rounded-lg border border-border theme-glass bg-card shadow-lg py-1"
        >
          {BUDGET_EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              className="w-full text-left px-4 py-2.5 min-h-[44px] text-sm hover:bg-card-hover disabled:opacity-60"
              onClick={() => handleExport(f.id)}
              disabled={busyFormat != null}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      {message ? (
        <div
          className={[
            "absolute right-0 mt-1 z-10 text-xs border rounded-lg px-3 py-2 max-w-[260px]",
            message.error
              ? "text-danger bg-danger-bg border-danger-border"
              : "text-text bg-bg-secondary border-border",
          ].join(" ")}
        >
          {message.text}
        </div>
      ) : null}
    </div>
  );
}

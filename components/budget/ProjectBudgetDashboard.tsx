"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CompanyMemberOption } from "@/lib/company/member-options";
import { BudgetHealthCard } from "@/components/budget/BudgetHealthCard";
import { ExportMenu } from "@/components/budget/ExportMenu";
import {
  useBudgetData,
  useBudgetItems,
  useBudgetLabor,
} from "@/components/budget/hooks/useBudgetData";
import { KpiCards } from "@/components/budget/KpiCards";
import { DocumentsTab } from "@/components/budget/tabs/DocumentsTab";
import { LaborTab } from "@/components/budget/tabs/LaborTab";
import { MaterialCostsTab } from "@/components/budget/tabs/MaterialCostsTab";
import { NotesTab } from "@/components/budget/tabs/NotesTab";
import { SummaryTab } from "@/components/budget/tabs/SummaryTab";
import {
  BUDGET_BTN_PRIMARY,
  BUDGET_BTN_SECONDARY,
  BUDGET_INPUT_CLASS,
  BUDGET_TAB_CLASS,
} from "@/components/budget/constants";
import type { BudgetTabId } from "@/lib/jobs/budget/types";

const TABS: { id: BudgetTabId; label: string }[] = [
  { id: "materials", label: "Koszty materiałów" },
  { id: "labor", label: "Robocizna" },
  { id: "summary", label: "Podsumowanie" },
  { id: "documents", label: "Dokumenty" },
  { id: "notes", label: "Notatki" },
];

type Props = {
  companyId: string;
  jobId: string;
  jobNumber: number;
  jobLabel: string;
  members: CompanyMemberOption[];
};

export function ProjectBudgetDashboard({
  companyId,
  jobId,
  jobNumber,
  jobLabel,
  members,
}: Props) {
  const [activeTab, setActiveTab] = useState<BudgetTabId>("materials");
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetPln, setBudgetPln] = useState("");
  const [budgetNote, setBudgetNote] = useState("");

  const {
    header,
    loading,
    err,
    busy,
    baseUrl,
    refreshHeader,
    updateSummary,
    runMutation,
    setErr,
  } = useBudgetData(companyId, jobId);

  const materialsEnabled = activeTab === "materials" || activeTab === "documents";
  const laborEnabled = activeTab === "labor";

  const itemsHook = useBudgetItems(companyId, jobId, materialsEnabled);
  const laborHook = useBudgetLabor(companyId, jobId, laborEnabled);

  const exportContext = useMemo(() => {
    if (!header) return null;
    return { companyId, jobId, jobNumber };
  }, [companyId, jobId, jobNumber, header]);

  function openBudgetEdit() {
    if (!header) return;
    setBudgetPln((header.budget.totalBudgetCents / 100).toFixed(2).replace(".", ","));
    setBudgetNote(header.budget.note ?? "");
    setBudgetOpen(true);
  }

  async function saveBudget() {
    await runMutation(async () => {
      const payload = await apiFetch(baseUrl, {
        method: "PATCH",
        body: JSON.stringify({ totalBudgetPln: budgetPln, note: budgetNote }),
      });
      await refreshHeader();
      setBudgetOpen(false);
      setErr(null);
      void payload;
    });
  }

  if (loading) {
    return <div className="text-sm text-gray-600 p-4">Ładowanie kosztorysu...</div>;
  }

  if (!header) {
    return (
      <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-4 rounded-xl">
        {err ?? "Nie udało się wczytać kosztorysu."}
      </div>
    );
  }

  const { summary, budget } = header;

  return (
    <div className="w-full max-w-full min-w-0 flex flex-col gap-4 overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{jobLabel}</h2>
          <p className="text-xs text-gray-500">Dashboard kosztorysu</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" className={BUDGET_BTN_SECONDARY} onClick={openBudgetEdit} disabled={busy}>
            {budget.totalBudgetCents > 0 ? "Edytuj budżet" : "Ustaw budżet"}
          </button>
          <ExportMenu context={exportContext} />
        </div>
      </div>

      {err ? (
        <div className="text-sm text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg shrink-0">{err}</div>
      ) : null}

      {budgetOpen ? (
        <div className="border rounded-xl p-4 bg-gray-50 space-y-3 shrink-0">
          <h3 className="font-medium">Budżet projektu</h3>
          <label className="block space-y-1">
            <span className="text-sm text-gray-700">Kwota (PLN)</span>
            <input className={BUDGET_INPUT_CLASS} inputMode="decimal" value={budgetPln} onChange={(e) => setBudgetPln(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUDGET_BTN_PRIMARY} onClick={saveBudget} disabled={busy}>Zapisz</button>
            <button type="button" className={BUDGET_BTN_SECONDARY} onClick={() => setBudgetOpen(false)} disabled={busy}>Anuluj</button>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 space-y-3">
        <KpiCards summary={summary} />
        <BudgetHealthCard summary={summary} />
      </div>

      <div className="flex flex-col">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={BUDGET_TAB_CLASS(activeTab === tab.id)}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-[400px] border rounded-xl bg-white p-4">
          {activeTab === "materials" ? (
            <MaterialCostsTab
              companyId={companyId}
              jobId={jobId}
              baseUrl={baseUrl}
              members={members}
              items={itemsHook.items}
              meta={itemsHook.meta}
              loading={itemsHook.loading}
              busy={busy}
              onPageChange={(p) => itemsHook.load(p)}
              onRefresh={async () => {
                await itemsHook.load(itemsHook.page);
                await refreshHeader();
              }}
              onSummaryUpdate={updateSummary}
              runMutation={runMutation}
            />
          ) : null}

          {activeTab === "labor" ? (
            <LaborTab
              baseUrl={baseUrl}
              members={members}
              laborItems={laborHook.laborItems}
              meta={laborHook.meta}
              loading={laborHook.loading}
              busy={busy}
              onPageChange={(p) => laborHook.load(p)}
              onRefresh={async () => {
                await laborHook.load(laborHook.page);
                await refreshHeader();
              }}
              onSummaryUpdate={updateSummary}
              runMutation={runMutation}
            />
          ) : null}

          {activeTab === "summary" ? <SummaryTab summary={summary} /> : null}

          {activeTab === "documents" ? (
            <DocumentsTab
              items={itemsHook.items}
              loading={itemsHook.loading}
              meta={itemsHook.meta}
              onPageChange={(p) => itemsHook.load(p)}
              busy={busy}
            />
          ) : null}

          {activeTab === "notes" ? (
            <NotesTab
              baseUrl={baseUrl}
              budget={budget}
              busy={busy}
              runMutation={runMutation}
              onNoteSaved={(note) => {
                refreshHeader();
                void note;
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

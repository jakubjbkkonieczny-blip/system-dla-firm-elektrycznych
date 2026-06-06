"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CompanyMemberOption } from "@/lib/company/member-options";
import {
  BUDGET_CATEGORIES,
  BUDGET_DOCUMENT_TYPES,
  BUDGET_TAX_CATEGORIES,
  BUDGET_VAT_CUSTOM,
  BUDGET_VAT_RATES,
  isValidVatRate,
  normalizeDocumentTypeLabel,
} from "@/lib/jobs/budget/config";
import {
  amountsFromGrossCents,
  amountsFromNetCents,
  formatPlnFromCents,
  parsePlnToCents,
} from "@/lib/jobs/budget/money";
import type { JobBudgetItemDto, JobBudgetSummary } from "@/lib/jobs/budget/types";
import {
  BUDGET_BTN_PRIMARY,
  BUDGET_BTN_SECONDARY,
  BUDGET_INPUT_CLASS,
} from "@/components/budget/constants";

type ItemFormState = {
  name: string;
  category: string;
  taxCategory: string;
  amountSource: "gross" | "net";
  grossAmountPln: string;
  netAmountPln: string;
  vatSelect: string;
  vatCustom: string;
  deductible: boolean;
  documentType: string;
  documentNumber: string;
  supplier: string;
  plannedDate: string;
  assignedUserId: string;
  note: string;
};

const emptyForm: ItemFormState = {
  name: "",
  category: BUDGET_CATEGORIES[0],
  taxCategory: BUDGET_TAX_CATEGORIES[0],
  amountSource: "gross",
  grossAmountPln: "",
  netAmountPln: "",
  vatSelect: "23%",
  vatCustom: "",
  deductible: true,
  documentType: BUDGET_DOCUMENT_TYPES[0],
  documentNumber: "",
  supplier: "",
  plannedDate: "",
  assignedUserId: "",
  note: "",
};

function vatRateToForm(rate: string | null) {
  if (!rate) return { select: "nie dotyczy", custom: "" };
  if ((BUDGET_VAT_RATES as readonly string[]).includes(rate)) return { select: rate, custom: "" };
  return { select: BUDGET_VAT_CUSTOM, custom: rate.replace("%", "") };
}

function vatRateForSubmit(select: string, custom: string): string {
  if (select === BUDGET_VAT_CUSTOM) {
    const pct = custom.trim().replace(",", ".");
    if (!pct) return "nie dotyczy";
    return pct.endsWith("%") ? pct : `${pct}%`;
  }
  return select;
}

type Props = {
  companyId: string;
  jobId: string;
  baseUrl: string;
  members: CompanyMemberOption[];
  items: JobBudgetItemDto[];
  meta: { page: number; totalPages: number; hasMore: boolean } | null;
  loading: boolean;
  busy: boolean;
  onPageChange: (page: number) => void;
  onRefresh: () => Promise<void>;
  onSummaryUpdate: (summary: JobBudgetSummary) => void;
  runMutation: (fn: () => Promise<void>) => Promise<void>;
};

export function MaterialCostsTab({
  baseUrl,
  members,
  items,
  meta,
  loading,
  busy,
  onPageChange,
  onRefresh,
  onSummaryUpdate,
  runMutation,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ItemFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const preview = (() => {
    const rate = vatRateForSubmit(form.vatSelect, form.vatCustom);
    if (!isValidVatRate(rate)) return null;
    if (form.amountSource === "gross") {
      const gross = parsePlnToCents(form.grossAmountPln);
      if (gross == null) return null;
      return amountsFromGrossCents(gross, rate);
    }
    const net = parsePlnToCents(form.netAmountPln);
    if (net == null) return null;
    return amountsFromNetCents(net, rate);
  })();

  function openForm(item?: JobBudgetItemDto) {
    if (item) {
      const vat = vatRateToForm(item.vatRate);
      setEditingId(item.id);
      setForm({
        name: item.name,
        category: item.category,
        taxCategory: item.taxCategory,
        amountSource: "gross",
        grossAmountPln: (item.grossAmountCents / 100).toFixed(2).replace(".", ","),
        netAmountPln:
          item.netAmountCents != null
            ? (item.netAmountCents / 100).toFixed(2).replace(".", ",")
            : "",
        vatSelect: vat.select,
        vatCustom: vat.custom,
        deductible: item.deductible,
        documentType: item.documentType ?? BUDGET_DOCUMENT_TYPES[0],
        documentNumber: item.documentNumber ?? "",
        supplier: item.supplier ?? "",
        plannedDate: item.plannedDate?.slice(0, 10) ?? "",
        assignedUserId: item.assignedUserId ?? "",
        note: item.note ?? "",
      });
    } else {
      setEditingId(null);
      setForm(emptyForm);
    }
    setFormOpen(true);
  }

  async function save() {
    const body = {
      name: form.name,
      category: form.category,
      taxCategory: form.taxCategory,
      amountSource: form.amountSource,
      grossAmountPln: form.amountSource === "gross" ? form.grossAmountPln : undefined,
      netAmountPln: form.amountSource === "net" ? form.netAmountPln : undefined,
      vatRate: form.vatSelect === BUDGET_VAT_CUSTOM ? "custom" : form.vatSelect,
      vatCustomPercent: form.vatSelect === BUDGET_VAT_CUSTOM ? form.vatCustom : undefined,
      deductible: form.deductible,
      documentType: form.documentType,
      documentNumber: form.documentNumber || null,
      supplier: form.supplier || null,
      plannedDate: form.plannedDate || null,
      assignedUserId: form.assignedUserId || null,
      note: form.note || null,
    };

    await runMutation(async () => {
      const url = editingId ? `${baseUrl}/items/${editingId}` : `${baseUrl}/items`;
      const payload = await apiFetch(url, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      onSummaryUpdate(payload.summary);
      setFormOpen(false);
      setEditingId(null);
      await onRefresh();
    });
  }

  async function remove(itemId: string) {
    if (!confirm("Usunąć ten koszt?")) return;
    await runMutation(async () => {
      const payload = await apiFetch(`${baseUrl}/items/${itemId}`, { method: "DELETE" });
      onSummaryUpdate(payload.summary);
      await onRefresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Koszty materiałów i usług z pełnymi danymi księgowymi.</p>
        <button type="button" className={BUDGET_BTN_PRIMARY} onClick={() => openForm()} disabled={busy}>
          + Dodaj koszt
        </button>
      </div>

      {formOpen ? (
        <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
          <h4 className="font-medium">{editingId ? "Edytuj koszt" : "Nowy koszt"}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm text-gray-700">Nazwa *</span>
              <input className={BUDGET_INPUT_CLASS} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Kategoria</span>
              <select className={BUDGET_INPUT_CLASS} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Kategoria podatkowa</span>
              <select className={BUDGET_INPUT_CLASS} value={form.taxCategory} onChange={(e) => setForm((f) => ({ ...f, taxCategory: e.target.value }))}>
                {BUDGET_TAX_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Typ dokumentu</span>
              <select className={BUDGET_INPUT_CLASS} value={form.documentType} onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}>
                {BUDGET_DOCUMENT_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Nr dokumentu</span>
              <input className={BUDGET_INPUT_CLASS} value={form.documentNumber} onChange={(e) => setForm((f) => ({ ...f, documentNumber: e.target.value }))} />
            </label>
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm text-gray-700">Dostawca</span>
              <input className={BUDGET_INPUT_CLASS} value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
            </label>
            <div className="md:col-span-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 min-h-[44px]">
                <input type="radio" checked={form.amountSource === "gross"} onChange={() => setForm((f) => ({ ...f, amountSource: "gross" }))} />
                <span className="text-sm">Od brutto</span>
              </label>
              <label className="flex items-center gap-2 min-h-[44px]">
                <input type="radio" checked={form.amountSource === "net"} onChange={() => setForm((f) => ({ ...f, amountSource: "net" }))} />
                <span className="text-sm">Od netto</span>
              </label>
            </div>
            {form.amountSource === "gross" ? (
              <label className="block space-y-1">
                <span className="text-sm text-gray-700">Brutto (PLN) *</span>
                <input className={BUDGET_INPUT_CLASS} inputMode="decimal" value={form.grossAmountPln} onChange={(e) => setForm((f) => ({ ...f, grossAmountPln: e.target.value }))} />
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="text-sm text-gray-700">Netto (PLN) *</span>
                <input className={BUDGET_INPUT_CLASS} inputMode="decimal" value={form.netAmountPln} onChange={(e) => setForm((f) => ({ ...f, netAmountPln: e.target.value }))} />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Stawka VAT</span>
              <select className={BUDGET_INPUT_CLASS} value={form.vatSelect} onChange={(e) => setForm((f) => ({ ...f, vatSelect: e.target.value }))}>
                {BUDGET_VAT_RATES.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value={BUDGET_VAT_CUSTOM}>Własna %</option>
              </select>
            </label>
            {form.vatSelect === BUDGET_VAT_CUSTOM ? (
              <label className="block space-y-1">
                <span className="text-sm text-gray-700">Własna stawka (%)</span>
                <input className={BUDGET_INPUT_CLASS} inputMode="decimal" value={form.vatCustom} onChange={(e) => setForm((f) => ({ ...f, vatCustom: e.target.value }))} />
              </label>
            ) : null}
            {preview ? (
              <div className="md:col-span-2 text-sm bg-white border rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>Netto: <b>{formatPlnFromCents(preview.netCents)}</b></div>
                <div>VAT: <b>{formatPlnFromCents(preview.taxCents)}</b></div>
                <div>Brutto: <b>{formatPlnFromCents(preview.grossCents)}</b></div>
              </div>
            ) : null}
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Data</span>
              <input type="date" className={BUDGET_INPUT_CLASS} value={form.plannedDate} onChange={(e) => setForm((f) => ({ ...f, plannedDate: e.target.value }))} />
            </label>
            <label className="flex items-center gap-2 min-h-[44px]">
              <input type="checkbox" checked={form.deductible} onChange={(e) => setForm((f) => ({ ...f, deductible: e.target.checked }))} />
              <span className="text-sm">Koszt do odliczenia</span>
            </label>
            <label className="block space-y-1 md:col-span-2">
              <span className="text-sm text-gray-700">Notatka</span>
              <textarea className={`${BUDGET_INPUT_CLASS} min-h-[72px]`} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUDGET_BTN_PRIMARY} onClick={save} disabled={busy}>Zapisz</button>
            <button type="button" className={BUDGET_BTN_SECONDARY} onClick={() => setFormOpen(false)} disabled={busy}>Anuluj</button>
          </div>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">Ładowanie kosztów...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center border rounded-xl bg-gray-50">Brak pozycji kosztowych.</div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[640px] text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-medium">Nazwa</th>
                <th className="py-2 pr-3 font-medium">Dokument</th>
                <th className="py-2 pr-3 font-medium">Dostawca</th>
                <th className="py-2 pr-3 font-medium">Kategoria</th>
                <th className="py-2 pr-3 font-medium text-right">Netto</th>
                <th className="py-2 pr-3 font-medium text-right">VAT</th>
                <th className="py-2 pr-3 font-medium text-right">Brutto</th>
                <th className="py-2 pr-3 font-medium">Odlicz.</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-3 font-medium">{item.name}</td>
                  <td className="py-3 pr-3 text-gray-600">
                    <div>{normalizeDocumentTypeLabel(item.documentType)}</div>
                    {item.documentNumber ? <div className="text-xs">{item.documentNumber}</div> : null}
                  </td>
                  <td className="py-3 pr-3 text-gray-600">{item.supplier ?? "—"}</td>
                  <td className="py-3 pr-3 text-gray-600">{item.category}</td>
                  <td className="py-3 pr-3 text-right">{formatPlnFromCents(item.netAmountCents ?? item.grossAmountCents)}</td>
                  <td className="py-3 pr-3 text-right">{formatPlnFromCents(item.taxAmountCents)}</td>
                  <td className="py-3 pr-3 text-right font-medium">{formatPlnFromCents(item.grossAmountCents)}</td>
                  <td className="py-3 pr-3">{item.deductible ? "Tak" : "Nie"}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button type="button" className="text-xs px-2 py-1 rounded border hover:bg-gray-50 min-h-[36px]" onClick={() => openForm(item)} disabled={busy}>Edytuj</button>
                      <button type="button" className="text-xs px-2 py-1 rounded border hover:bg-gray-50 min-h-[36px] text-red-700" onClick={() => remove(item.id)} disabled={busy}>Usuń</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button type="button" className={BUDGET_BTN_SECONDARY} disabled={meta.page <= 1 || busy} onClick={() => onPageChange(meta.page - 1)}>← Poprzednia</button>
          <span className="text-sm text-gray-500">Strona {meta.page} / {meta.totalPages}</span>
          <button type="button" className={BUDGET_BTN_SECONDARY} disabled={!meta.hasMore || busy} onClick={() => onPageChange(meta.page + 1)}>Następna →</button>
        </div>
      ) : null}
    </div>
  );
}

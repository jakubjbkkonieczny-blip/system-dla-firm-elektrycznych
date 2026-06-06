"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CompanyMemberOption } from "@/lib/company/member-options";
import { EmploymentTypeBadge } from "@/components/budget/EmploymentTypeBadge";
import {
  BUDGET_BTN_PRIMARY,
  BUDGET_BTN_SECONDARY,
  BUDGET_INPUT_CLASS,
} from "@/components/budget/constants";
import { EMPLOYMENT_TYPE_DEFINITIONS } from "@/lib/jobs/budget/employment-type";
import { computeLaborCost } from "@/lib/jobs/budget/labor-cost-engine";
import {
  formatPlnFromCents,
  minutesToHoursLabel,
  parseHoursToMinutes,
  parsePlnToCents,
} from "@/lib/jobs/budget/money";
import type { JobBudgetLaborItemDto, JobBudgetSummary } from "@/lib/jobs/budget/types";

const emptyForm = {
  userId: "",
  employmentType: "b2b",
  plannedHours: "",
  hourlyRatePln: "",
  plannedDate: "",
  note: "",
};

type Props = {
  baseUrl: string;
  members: CompanyMemberOption[];
  laborItems: JobBudgetLaborItemDto[];
  meta: { page: number; totalPages: number; hasMore: boolean } | null;
  loading: boolean;
  busy: boolean;
  onPageChange: (page: number) => void;
  onRefresh: () => Promise<void>;
  onSummaryUpdate: (summary: JobBudgetSummary) => void;
  runMutation: (fn: () => Promise<void>) => Promise<void>;
};

export function LaborTab({
  baseUrl,
  members,
  laborItems,
  meta,
  loading,
  busy,
  onPageChange,
  onRefresh,
  onSummaryUpdate,
  runMutation,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const preview = useMemo(() => {
    const minutes = parseHoursToMinutes(form.plannedHours);
    const rate = parsePlnToCents(form.hourlyRatePln);
    if (minutes == null || rate == null) return null;
    return computeLaborCost({
      plannedMinutes: minutes,
      hourlyRateCents: rate,
      employmentType: form.employmentType as JobBudgetLaborItemDto["employmentType"],
    });
  }, [form]);

  function openForm(item?: JobBudgetLaborItemDto) {
    if (item) {
      setEditingId(item.id);
      setForm({
        userId: item.userId ?? "",
        employmentType: item.employmentType,
        plannedHours: minutesToHoursLabel(item.plannedMinutes),
        hourlyRatePln: (item.hourlyRateCents / 100).toFixed(2).replace(".", ","),
        plannedDate: item.plannedDate?.slice(0, 10) ?? "",
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
      userId: form.userId || null,
      employmentType: form.employmentType,
      plannedHours: form.plannedHours,
      hourlyRatePln: form.hourlyRatePln,
      plannedDate: form.plannedDate || null,
      note: form.note || null,
    };

    await runMutation(async () => {
      const url = editingId ? `${baseUrl}/labor/${editingId}` : `${baseUrl}/labor`;
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

  async function remove(laborId: string) {
    if (!confirm("Usunąć wpis robocizny?")) return;
    await runMutation(async () => {
      const payload = await apiFetch(`${baseUrl}/labor/${laborId}`, { method: "DELETE" });
      onSummaryUpdate(payload.summary);
      await onRefresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          Planowana robocizna z szacunkiem kosztów zatrudnienia. Nie stanowi porady prawnej ani księgowej.
        </p>
        <button type="button" className={BUDGET_BTN_PRIMARY} onClick={() => openForm()} disabled={busy}>
          + Dodaj robociznę
        </button>
      </div>

      {formOpen ? (
        <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
          <h4 className="font-medium">{editingId ? "Edytuj robociznę" : "Nowa robocizna"}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Pracownik</span>
              <select className={BUDGET_INPUT_CLASS} value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
                <option value="">— brak —</option>
                {members.map((m) => <option key={m.uid} value={m.uid}>{m.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Typ współpracy *</span>
              <select className={BUDGET_INPUT_CLASS} value={form.employmentType} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}>
                {EMPLOYMENT_TYPE_DEFINITIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Planowane godziny *</span>
              <input className={BUDGET_INPUT_CLASS} inputMode="decimal" value={form.plannedHours} onChange={(e) => setForm((f) => ({ ...f, plannedHours: e.target.value }))} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Stawka/h (PLN) *</span>
              <input className={BUDGET_INPUT_CLASS} inputMode="decimal" value={form.hourlyRatePln} onChange={(e) => setForm((f) => ({ ...f, hourlyRatePln: e.target.value }))} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-gray-700">Data</span>
              <input type="date" className={BUDGET_INPUT_CLASS} value={form.plannedDate} onChange={(e) => setForm((f) => ({ ...f, plannedDate: e.target.value }))} />
            </label>
            {preview ? (
              <div className="md:col-span-2 text-sm bg-white border rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>Koszt podstawowy: <b>{formatPlnFromCents(preview.baseLaborCostCents)}</b></div>
                <div>Szac. zatrudnienie: <b>{formatPlnFromCents(preview.employerLaborCostCents)}</b></div>
                <div>Mnożnik: <b>×{(preview.multiplierBasisPoints / 10000).toFixed(2)}</b></div>
              </div>
            ) : null}
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

      {loading && laborItems.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center">Ładowanie robocizny...</div>
      ) : laborItems.length === 0 ? (
        <div className="text-sm text-gray-500 py-8 text-center border rounded-xl bg-gray-50">Brak wpisów robocizny.</div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[720px] text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-medium">Pracownik</th>
                <th className="py-2 pr-3 font-medium">Typ współpracy</th>
                <th className="py-2 pr-3 font-medium text-right">Stawka</th>
                <th className="py-2 pr-3 font-medium text-right">Godziny</th>
                <th className="py-2 pr-3 font-medium text-right">Koszt podst.</th>
                <th className="py-2 pr-3 font-medium text-right">Szac. zatrudn.</th>
                <th className="py-2 pr-3 font-medium">Data</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {laborItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-3 font-medium">{item.userLabel ?? "—"}</td>
                  <td className="py-3 pr-3">
                    <EmploymentTypeBadge type={item.employmentType} label={item.employmentTypeLabel} />
                  </td>
                  <td className="py-3 pr-3 text-right">{formatPlnFromCents(item.hourlyRateCents)}/h</td>
                  <td className="py-3 pr-3 text-right">{minutesToHoursLabel(item.plannedMinutes)} h</td>
                  <td className="py-3 pr-3 text-right">{formatPlnFromCents(item.baseLaborCostCents)}</td>
                  <td className="py-3 pr-3 text-right font-medium">{formatPlnFromCents(item.employerLaborCostCents)}</td>
                  <td className="py-3 pr-3 text-gray-600">{item.plannedDate?.slice(0, 10) ?? "—"}</td>
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

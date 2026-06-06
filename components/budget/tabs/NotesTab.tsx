"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { BUDGET_BTN_PRIMARY, BUDGET_BTN_SECONDARY, BUDGET_INPUT_CLASS } from "@/components/budget/constants";
import type { JobBudgetDto } from "@/lib/jobs/budget/types";

type Props = {
  baseUrl: string;
  budget: JobBudgetDto;
  busy: boolean;
  runMutation: (fn: () => Promise<void>) => Promise<void>;
  onNoteSaved: (note: string | null) => void;
};

export function NotesTab({ baseUrl, budget, busy, runMutation, onNoteSaved }: Props) {
  const [note, setNote] = useState(budget.note ?? "");
  const [editing, setEditing] = useState(false);

  async function save() {
    await runMutation(async () => {
      const payload = await apiFetch(baseUrl, {
        method: "PATCH",
        body: JSON.stringify({ note }),
      });
      onNoteSaved(payload.budget.note);
      setEditing(false);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Notatki wewnętrzne do kosztorysu projektu.</p>

      {editing ? (
        <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm text-gray-700">Notatka projektu</span>
            <textarea
              className={`${BUDGET_INPUT_CLASS} min-h-[160px]`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Uwagi księgowe, ustalenia z klientem, informacje wewnętrzne..."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUDGET_BTN_PRIMARY} onClick={save} disabled={busy}>Zapisz</button>
            <button
              type="button"
              className={BUDGET_BTN_SECONDARY}
              onClick={() => {
                setNote(budget.note ?? "");
                setEditing(false);
              }}
              disabled={busy}
            >
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <div className="border rounded-xl p-4 bg-white min-h-[120px]">
          {budget.note ? (
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{budget.note}</p>
          ) : (
            <p className="text-sm text-gray-500">Brak notatki. Kliknij „Edytuj”, aby dodać.</p>
          )}
          <button type="button" className={`${BUDGET_BTN_SECONDARY} mt-4`} onClick={() => setEditing(true)} disabled={busy}>
            Edytuj notatkę
          </button>
        </div>
      )}
    </div>
  );
}

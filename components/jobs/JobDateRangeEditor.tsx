"use client";

import { DateField } from "@/components/jobs/fields/DateField";
import { TimeField } from "@/components/jobs/fields/TimeField";
import {
  isoFromScheduleFieldsGroup,
  scheduleFieldsFromIso,
  validatePreferredRange,
  type PreferredScheduleFields,
} from "@/lib/jobs/preferred-schedule";
import { useCallback, useId, useMemo } from "react";

export function JobDateRangeEditor({
  preferredFrom,
  preferredTo,
  onChange,
  disabled,
  error,
}: {
  preferredFrom: string;
  preferredTo: string;
  onChange: (next: { preferredFrom: string; preferredTo: string }) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const errorId = useId();
  const fields = useMemo(
    () => scheduleFieldsFromIso(preferredFrom, preferredTo),
    [preferredFrom, preferredTo]
  );

  const patch = useCallback(
    (patchFields: Partial<PreferredScheduleFields>) => {
      const next = { ...fields, ...patchFields };
      onChange(isoFromScheduleFieldsGroup(next));
    },
    [fields, onChange]
  );

  const clientError = useMemo(
    () => error ?? validatePreferredRange(preferredFrom, preferredTo),
    [error, preferredFrom, preferredTo]
  );

  const endDateMin = fields.startDate || undefined;

  return (
    <fieldset
      className="rounded-xl border border-border bg-bg-secondary p-3 sm:p-4 space-y-4"
      disabled={disabled}
      aria-describedby={clientError ? errorId : undefined}
    >
      <legend className="text-sm font-semibold text-text px-1">Preferowany termin</legend>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-text-muted mb-2">Początek</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DateField
              label="Data rozpoczęcia"
              value={fields.startDate}
              onChange={(startDate) => patch({ startDate })}
              disabled={disabled}
              describedBy={clientError ? errorId : undefined}
            />
            <TimeField
              label="Godzina rozpoczęcia"
              value={fields.startTime}
              onChange={(startTime) => patch({ startTime })}
              disabled={disabled}
              describedBy={clientError ? errorId : undefined}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-text-muted mb-2">
            Koniec <span className="font-normal text-text-muted">(opcjonalnie)</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DateField
              label="Data zakończenia"
              value={fields.endDate}
              onChange={(endDate) => patch({ endDate })}
              disabled={disabled}
              min={endDateMin}
              describedBy={clientError ? errorId : undefined}
            />
            <TimeField
              label="Godzina zakończenia"
              value={fields.endTime}
              onChange={(endTime) => patch({ endTime })}
              disabled={disabled}
              describedBy={clientError ? errorId : undefined}
            />
          </div>
        </div>
      </div>

      {clientError ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-danger border border-danger-border bg-danger-bg rounded-lg px-3 py-2"
        >
          {clientError}
        </p>
      ) : null}
    </fieldset>
  );
}

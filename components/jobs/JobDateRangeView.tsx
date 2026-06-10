import {
  formatPreferredDatePl,
  formatPreferredTimePl,
  parsePreferredDateTime,
} from "@/lib/jobs/preferred-schedule";

function SchedulePoint({
  title,
  dateIso,
}: {
  title: string;
  dateIso: unknown;
}) {
  const hasDate = Boolean(parsePreferredDateTime(dateIso));
  const dateLabel = formatPreferredDatePl(dateIso);
  const timeLabel = formatPreferredTimePl(dateIso);

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </div>
      {hasDate ? (
        <dl className="mt-2 space-y-1">
          <div>
            <dt className="sr-only">Data</dt>
            <dd className="text-base font-semibold text-text">{dateLabel}</dd>
          </div>
          <div>
            <dt className="sr-only">Godzina</dt>
            <dd className="text-sm text-text-muted">{timeLabel || "—"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Nie ustawiono</p>
      )}
    </div>
  );
}

export function JobDateRangeView({
  preferredFrom,
  preferredTo,
}: {
  preferredFrom?: unknown;
  preferredTo?: unknown;
}) {
  const hasStart = Boolean(parsePreferredDateTime(preferredFrom));
  const hasEnd = Boolean(parsePreferredDateTime(preferredTo));

  if (!hasStart && !hasEnd) return null;

  return (
    <section
      className="rounded-xl border border-border bg-bg-secondary p-3 sm:p-4"
      aria-labelledby="preferred-schedule-heading"
    >
      <h3 id="preferred-schedule-heading" className="text-sm font-semibold text-text">
        Preferowany termin
      </h3>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <SchedulePoint title="Start" dateIso={preferredFrom} />
        <SchedulePoint title="Koniec" dateIso={preferredTo} />
      </div>
    </section>
  );
}

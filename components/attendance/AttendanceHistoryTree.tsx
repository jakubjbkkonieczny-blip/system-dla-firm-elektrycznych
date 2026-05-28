"use client";

import { AttendanceStatusBadge } from "@/components/attendance/AttendanceStatusBadge";
import {
  getDefaultExpandedKeys,
  groupHistoryByYearMonth,
  type HistoryYearGroup,
} from "@/lib/attendance/history-grouping";
import { formatHistoryMonthYearLabel } from "@/lib/attendance/history-labels";
import {
  buildMonthSummaryMap,
  formatBreakHoursSummary,
  formatWorkedDaysSummary,
  formatWorkedHoursSummary,
  monthSummaryToTotals,
  rollupYearTotals,
  sumHistoryDays,
} from "@/lib/attendance/history-summaries";
import { formatDateShort, formatTimeHm } from "@/lib/attendance/dates";
import { formatMinutes } from "@/lib/attendance/duration";
import type {
  AttendanceHistoryDay,
  AttendanceHistoryMonthSummary,
  AttendanceHistoryPeriodTotals,
} from "@/lib/attendance/types";
import { useEffect, useMemo, useRef, useState } from "react";

function PeriodSummaryStats({ totals }: { totals: AttendanceHistoryPeriodTotals }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600 mt-1">
      <span>{formatWorkedHoursSummary(totals.totalWorkedMinutes)}</span>
      <span>{formatBreakHoursSummary(totals.totalBreakMinutes)}</span>
      <span>{formatWorkedDaysSummary(totals.workedDays)}</span>
    </div>
  );
}

function HistoryDayTable({
  days,
  comfortable,
}: {
  days: AttendanceHistoryDay[];
  comfortable: boolean;
}) {
  if (days.length === 0) {
    return (
      <p className={`text-sm text-gray-500 ${comfortable ? "px-4 py-3" : "px-3 py-2"}`}>
        Brak wpisów.
      </p>
    );
  }

  const cellPad = comfortable ? "px-4 py-3" : "px-3 py-2.5";
  const headPad = comfortable ? "px-4 py-2.5" : "px-3 py-2";

  return (
    <table className="w-full text-sm table-auto">
      <thead>
        <tr className="text-xs text-gray-500 border-b bg-gray-50/80">
          <th className={`text-left font-medium ${headPad}`}>Data</th>
          <th className={`text-left font-medium ${headPad} tabular-nums`}>Start</th>
          <th className={`text-left font-medium ${headPad} tabular-nums`}>Koniec</th>
          <th className={`text-left font-medium ${headPad} tabular-nums`}>Czas pracy</th>
          <th className={`text-left font-medium ${headPad} tabular-nums`}>Przerwy</th>
          <th className={`text-left font-medium ${headPad} min-w-[7.5rem]`}>Status</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr
            key={day.id}
            className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50"
          >
            <td className={`${cellPad} font-medium text-gray-900 whitespace-nowrap`}>
              {formatDateShort(day.date)}
            </td>
            <td className={`${cellPad} text-gray-700 tabular-nums whitespace-nowrap`}>
              {formatTimeHm(day.startedAt)}
            </td>
            <td className={`${cellPad} text-gray-700 tabular-nums whitespace-nowrap`}>
              {formatTimeHm(day.endedAt)}
            </td>
            <td className={`${cellPad} text-gray-700 tabular-nums whitespace-nowrap`}>
              {formatMinutes(day.totalWorkedMinutes)}
            </td>
            <td className={`${cellPad} text-gray-700 tabular-nums whitespace-nowrap`}>
              {formatMinutes(day.totalBreakMinutes)}
            </td>
            <td className={cellPad}>
              <AttendanceStatusBadge status={day.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function YearSection({
  group,
  monthSummaryMap,
  monthSummaries,
  expanded,
  expandedMonths,
  comfortable,
  onToggleYear,
  onToggleMonth,
}: {
  group: HistoryYearGroup;
  monthSummaryMap: Map<string, AttendanceHistoryMonthSummary>;
  monthSummaries: AttendanceHistoryMonthSummary[];
  expanded: boolean;
  expandedMonths: Set<string>;
  comfortable: boolean;
  onToggleYear: () => void;
  onToggleMonth: (monthKey: string) => void;
}) {
  const yearPad = comfortable ? "px-5 py-4" : "px-4 py-3";
  const monthPad = comfortable ? "px-4 py-3" : "px-3 py-2.5";
  const monthGap = comfortable ? "space-y-3" : "space-y-2";
  const monthInnerPad = comfortable ? "px-3 pb-3 pt-3" : "px-2 pb-2 pt-2";
  const yearTotals = useMemo(() => {
    const fromServer = rollupYearTotals(monthSummaries, group.year);
    if (fromServer.workedDays > 0) return fromServer;
    const allDays = group.months.flatMap((m) => m.days);
    return sumHistoryDays(allDays);
  }, [group, monthSummaries]);

  return (
    <section className="border rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        className={`w-full ${yearPad} text-left hover:bg-gray-50 transition-colors`}
        onClick={onToggleYear}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{group.year}</h3>
            <PeriodSummaryStats totals={yearTotals} />
          </div>
          <span className="text-gray-400 text-sm shrink-0 mt-0.5" aria-hidden>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className={`border-t bg-gray-50/40 ${monthInnerPad} ${monthGap}`}>
          {group.months.length === 0 ? (
            <p className="text-sm text-gray-500 px-2 py-2">Brak wpisów.</p>
          ) : (
            group.months.map((monthGroup) => {
              const monthExpanded = expandedMonths.has(monthGroup.key);
              const serverMonth = monthSummaryMap.get(monthGroup.key);
              const monthTotals = serverMonth
                ? monthSummaryToTotals(serverMonth)
                : sumHistoryDays(monthGroup.days);

              return (
                <div
                  key={monthGroup.key}
                  className="border rounded-lg bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    className={`w-full ${monthPad} text-left hover:bg-gray-50 transition-colors`}
                    onClick={() => onToggleMonth(monthGroup.key)}
                    aria-expanded={monthExpanded}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">
                          {formatHistoryMonthYearLabel(monthGroup.year, monthGroup.month)}
                        </h4>
                        <PeriodSummaryStats totals={monthTotals} />
                      </div>
                      <span className="text-gray-400 text-xs shrink-0 mt-0.5" aria-hidden>
                        {monthExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {monthExpanded && (
                    <div className="border-t">
                      <HistoryDayTable days={monthGroup.days} comfortable={comfortable} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

export function AttendanceHistoryTree({
  items,
  monthSummaries,
  layout = "default",
}: {
  items: AttendanceHistoryDay[];
  monthSummaries?: AttendanceHistoryMonthSummary[];
  layout?: "default" | "comfortable";
}) {
  const comfortable = layout === "comfortable";
  const grouped = useMemo(() => groupHistoryByYearMonth(items), [items]);
  const monthSummaryMap = useMemo(
    () => buildMonthSummaryMap(monthSummaries),
    [monthSummaries]
  );
  const summaries = monthSummaries ?? [];

  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());
  const expandInitialized = useRef(false);

  useEffect(() => {
    if (expandInitialized.current || grouped.length === 0) return;
    expandInitialized.current = true;
    const { years, months } = getDefaultExpandedKeys(grouped);
    setExpandedYears(new Set(years));
    setExpandedMonths(new Set(months));
  }, [grouped]);

  function toggleYear(year: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  function toggleMonth(monthKey: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  if (grouped.length === 0) {
    return null;
  }

  return (
    <div className={comfortable ? "space-y-4" : "space-y-3"}>
      {grouped.map((yearGroup) => (
        <YearSection
          key={yearGroup.year}
          group={yearGroup}
          monthSummaryMap={monthSummaryMap}
          monthSummaries={summaries}
          comfortable={comfortable}
          expanded={expandedYears.has(yearGroup.year)}
          expandedMonths={expandedMonths}
          onToggleYear={() => toggleYear(yearGroup.year)}
          onToggleMonth={toggleMonth}
        />
      ))}
    </div>
  );
}

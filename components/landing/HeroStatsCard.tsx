type StatIcon = "jobs" | "users" | "satisfaction";

function StatIconGraphic({ type }: { type: StatIcon }) {
  if (type === "jobs") {
    return (
      <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    );
  }
  if (type === "users") {
    return (
      <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    );
  }
  return (
    <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
      />
    </svg>
  );
}

export function HeroStatsCard({
  value,
  label,
  icon,
  showOnlineDot = false,
  className = "",
}: {
  value: string;
  label: string;
  icon: StatIcon;
  showOnlineDot?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex items-center gap-4 w-full max-w-[22.5rem] min-h-[7rem] rounded-2xl",
        "border border-white/20 bg-slate-950/55 px-5 py-4",
        "shadow-[0_16px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl",
        "transition-transform duration-200 hover:-translate-y-0.5 hover:border-amber-400/30",
        className,
      ].join(" ")}
    >
      <div className="relative flex shrink-0 items-center justify-center w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <StatIconGraphic type={icon} />
        {showOnlineDot && (
          <span
            className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            aria-hidden
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-3xl sm:text-4xl font-bold text-white tabular-nums leading-none tracking-tight">
          {value}
        </div>
        <div className="text-sm text-slate-300 mt-1.5 leading-snug">{label}</div>
      </div>
    </div>
  );
}

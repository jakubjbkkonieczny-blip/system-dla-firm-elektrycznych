export function SuspendedStatusIcon() {
  return (
    <div
      className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 shadow-[0_0_48px_rgba(245,158,11,0.35)]"
      aria-hidden
    >
      <svg className="h-9 w-9 text-amber-300" fill="currentColor" viewBox="0 0 24 24">
        <rect x="7" y="5" width="3.5" height="14" rx="1" />
        <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
      </svg>
    </div>
  );
}

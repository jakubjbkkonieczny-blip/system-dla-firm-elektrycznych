export function WaitingStatusIcon() {
  return (
    <div
      className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-400/35 bg-blue-500/10 shadow-[0_0_40px_rgba(59,130,246,0.2)]"
      aria-hidden
    >
      <svg
        className="h-10 w-10 text-blue-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.75}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
  );
}

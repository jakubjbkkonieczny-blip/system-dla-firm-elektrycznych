export function AuthMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-sm rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-slate-200"
      role="alert"
    >
      {children}
    </div>
  );
}

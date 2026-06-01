import { AuthBenefitsStrip } from "@/components/auth/AuthBenefitsStrip";
import type { AuthAccountType } from "@/components/auth/auth-accent";
import { getAuthAccent } from "@/components/auth/auth-accent";

export function AuthShell({
  accountType,
  children,
}: {
  accountType: AuthAccountType;
  children: React.ReactNode;
}) {
  const accent = getAuthAccent(accountType);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#070d18] text-slate-100 overflow-x-hidden flex flex-col">
      <div className="pointer-events-none fixed inset-0 bg-[#070d18]" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-br from-[#0f1c33] via-[#0a1220] to-[#04070f]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 landing-hero-glow opacity-70" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 landing-lightning-accent opacity-50"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.2] bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:56px_56px]"
        aria-hidden
      />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-10">
        <div className={`w-full max-w-[460px] ${accent.card} rounded-2xl border bg-slate-950/50 backdrop-blur-xl`}>
          {children}
        </div>
      </div>

      <AuthBenefitsStrip />
    </div>
  );
}

import { AuthBackground } from "@/components/auth/AuthBackground";
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
      <AuthBackground />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-10">
        <div className={`w-full max-w-[460px] ${accent.card} rounded-2xl border bg-slate-950/50 backdrop-blur-xl`}>
          {children}
        </div>
      </div>

      <AuthBenefitsStrip />
    </div>
  );
}

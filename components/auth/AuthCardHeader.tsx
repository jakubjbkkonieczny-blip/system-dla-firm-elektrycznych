import type { AuthAccountType } from "@/components/auth/auth-accent";
import { getAuthAccent } from "@/components/auth/auth-accent";
import { ElektraLogo } from "@/components/auth/ElektraLogo";
import Link from "next/link";

export function AuthCardHeader({
  accountType,
  title,
  typeLabel,
  onChangeType,
}: {
  accountType: AuthAccountType;
  title: string;
  typeLabel: string;
  onChangeType?: () => void;
}) {
  const accent = getAuthAccent(accountType);

  return (
    <div className="px-6 pt-6 pb-2 sm:px-8 sm:pt-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <ElektraLogo size="sm" />
        <Link
          href="/"
          className="text-xs sm:text-sm text-slate-400 hover:text-white transition-colors min-h-[44px] inline-flex items-center"
        >
          ← Strona główna
        </Link>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Typ: <span className={`font-semibold ${accent.typeBadge}`}>{typeLabel}</span>
          </p>
        </div>
        {onChangeType ? (
          <button
            type="button"
            onClick={onChangeType}
            className="shrink-0 min-h-[44px] px-3 py-2 rounded-lg border border-white/15 bg-white/[0.06] text-xs sm:text-sm text-slate-300 hover:bg-white/10 transition-colors"
          >
            Zmień typ
          </button>
        ) : null}
      </div>
    </div>
  );
}

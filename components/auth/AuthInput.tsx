import type { AuthAccountType } from "@/components/auth/auth-accent";
import { getAuthAccent } from "@/components/auth/auth-accent";

export function AuthInput({
  accountType,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { accountType: AuthAccountType }) {
  const accent = getAuthAccent(accountType);

  return (
    <input
      {...props}
      className={[
        "w-full min-h-[44px] rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5",
        "text-sm text-white placeholder:text-slate-500",
        "transition-colors focus:outline-none focus:ring-2",
        accent.inputFocus,
        className,
      ].join(" ")}
    />
  );
}

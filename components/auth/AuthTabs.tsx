import type { AuthAccountType } from "@/components/auth/auth-accent";
import { getAuthAccent } from "@/components/auth/auth-accent";

export function AuthTabs({
  accountType,
  tab,
  onLogin,
  onRegister,
}: {
  accountType: AuthAccountType;
  tab: "login" | "register";
  onLogin: () => void;
  onRegister: () => void;
}) {
  const accent = getAuthAccent(accountType);

  return (
    <div className="px-6 sm:px-8">
      <div className="flex gap-1 p-1 rounded-xl border border-white/10 bg-white/[0.04]">
        <button
          type="button"
          onClick={onLogin}
          className={[
            "flex-1 min-h-[44px] rounded-lg text-sm font-medium border transition-colors",
            tab === "login" ? accent.tabActive : ["border-transparent", accent.tabIdle].join(" "),
          ].join(" ")}
        >
          Zaloguj się
        </button>
        <button
          type="button"
          onClick={onRegister}
          className={[
            "flex-1 min-h-[44px] rounded-lg text-sm font-medium border transition-colors",
            tab === "register"
              ? accent.tabActive
              : ["border-transparent", accent.tabIdle].join(" "),
          ].join(" ")}
        >
          Zarejestruj się
        </button>
      </div>
    </div>
  );
}

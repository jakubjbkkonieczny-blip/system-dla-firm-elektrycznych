"use client";
import { Suspense } from "react";
import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoginTypeSelect from "@/components/LoginTypeSelect";
import { AuthCardHeader } from "@/components/auth/AuthCardHeader";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthTabs } from "@/components/auth/AuthTabs";
import { getAuthAccent } from "@/components/auth/auth-accent";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";
import { RECOVERY_LOGIN_SUCCESS_MESSAGE } from "@/lib/deactivation/recovery-ui-copy";

type AccountType = "worker" | "employer";
type Tab = "login" | "register";
type Screen = "auth" | "reset" | "reset-sent";

function normalizeType(v: string | null): AccountType | null {
  if (v === "worker") return "worker";
  if (v === "employer") return "employer";
  return null;
}

async function postAuthJson(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const raw =
      typeof json.message === "string"
        ? json.message
        : typeof json.error === "string"
          ? json.error
          : `HTTP_${res.status}`;
    throw new Error(raw);
  }
  return json;
}

async function clearServerSession() {
  await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
}

function mapAuthErrorMessage(raw: string): string {
  switch (raw) {
    case "INVALID_CREDENTIALS":
      return "Niewłaściwy email lub hasło.";
    case "ACCOUNT_DISABLED":
      return "To konto jest wyłączone.";
    case "MISSING_CREDENTIALS":
      return "Uzupełnij email i hasło.";
    case "USER_EXISTS":
      return "Ten adres email jest już zarejestrowany. Zaloguj się.";
    case "INVALID_REQUEST":
      return "Nieprawidłowe żądanie. Spróbuj ponownie.";
    case "INTERNAL_ERROR":
      return "Błąd serwera. Spróbuj ponownie później.";
    default:
      return raw;
  }
}

function LoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { refresh: refreshAuth } = useAuth();

  const accountType = useMemo(() => normalizeType(sp.get("type")), [sp]);
  const hasType = accountType !== null;
  const selected: AccountType = accountType ?? "worker";
  const typeLabel = selected === "employer" ? "Pracodawca" : "Pracownik";
  const recoveredNotice = useMemo(() => sp.get("recovered") === "1", [sp]);

  const [tab, setTab] = useState<Tab>("login");
  const [screen, setScreen] = useState<Screen>("auth");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!recoveredNotice || !hasType) return;
    setMsg(RECOVERY_LOGIN_SUCCESS_MESSAGE);
    router.replace(`/login?type=${selected}`, { scroll: false });
  }, [hasType, recoveredNotice, router, selected]);

  async function afterWorkerAuth() {
    try {
      const data = await apiFetch("/api/me/companies");
      const companies = Array.isArray(data?.companies) ? data.companies : [];
      router.replace(companies.length > 0 ? "/dashboard" : "/oczekiwanie");
    } catch {
      router.replace("/oczekiwanie");
    }
  }

  async function afterEmployerAuth() {
    try {
      const me = await apiFetch("/api/me");
      if (!me?.billingAllowsAccess) {
        router.replace("/subskrypcja");
        return;
      }
      router.replace("/dashboard");
    } catch {
      router.replace("/subskrypcja");
    }
  }

  async function ensureRoleOrBlock(roleWanted: AccountType, name?: string): Promise<AccountType> {
    const res = await apiFetch("/api/auth/post-register", {
      method: "POST",
      body: JSON.stringify({ role: roleWanted, displayName: name || "" }),
    });
    return (res?.role as AccountType | undefined) ?? roleWanted;
  }

  function goBackToTypeSelect() {
    router.push("/login");
  }

  async function onLogin() {
    setBusy(true);
    setMsg(null);

    try {
      if (!hasType) {
        router.replace("/login");
        return;
      }

      if (!email.trim() || !pass) {
        throw new Error("Uzupełnij email i hasło.");
      }

      const normalizedEmail = email.trim().toLowerCase();
      const loginResult = await postAuthJson("/api/auth/session", {
        email: normalizedEmail,
        password: pass,
      });

      if (loginResult.deactivated === true) {
        router.replace("/account-deactivated");
        return;
      }

      const role = await ensureRoleOrBlock(selected, "");

      if (role !== selected) {
        await clearServerSession();
        await refreshAuth();
        throw new Error("To konto jest innego typu. Wybierz właściwy typ na ekranie startowym.");
      }

      await refreshAuth();

      if (role === "worker") {
        await afterWorkerAuth();
        return;
      }

      await afterEmployerAuth();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Błąd logowania.";
      setMsg(
        raw === "ROLE_MISMATCH"
          ? "To konto już istnieje jako inny typ. Wybierz prawidłowy typ na ekranie startowym."
          : mapAuthErrorMessage(raw)
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRegister() {
    setBusy(true);
    setMsg(null);

    try {
      if (!hasType) {
        router.replace("/login");
        return;
      }

      if (!email.trim() || !pass || !pass2) {
        throw new Error("Uzupełnij wszystkie pola.");
      }

      if (tab === "register" && !displayName.trim()) {
        throw new Error("Podaj nazwę użytkownika.");
      }

      if (pass !== pass2) {
        throw new Error("Hasła nie są takie same.");
      }

      const normalizedEmail = email.trim().toLowerCase();
      const nameTrimmed = displayName.trim();
      await postAuthJson("/api/auth/register", {
        email: normalizedEmail,
        password: pass,
        displayName: nameTrimmed,
      });
      await postAuthJson("/api/auth/session", { email: normalizedEmail, password: pass });

      const role = await ensureRoleOrBlock(selected, nameTrimmed);

      if (role !== selected) {
        await clearServerSession();
        await refreshAuth();
        throw new Error("To konto już istnieje jako inny typ. Wybierz prawidłowy typ.");
      }

      await refreshAuth();

      if (role === "employer") {
        router.replace("/subskrypcja");
        return;
      }

      router.replace("/oczekiwanie");
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Błąd rejestracji.";
      setMsg(
        raw === "ROLE_MISMATCH"
          ? "To konto już istnieje jako inny typ. Zaloguj się w prawidłowym trybie."
          : mapAuthErrorMessage(raw)
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSendReset() {
    setBusy(true);
    setMsg(null);

    try {
      if (!resetEmail.trim()) throw new Error("Podaj email.");
      console.log("RESET TODO");
      setScreen("reset-sent");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Nie udało się wysłać resetu hasła.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasType) {
    return <LoginTypeSelect />;
  }

  const accent = getAuthAccent(selected);

  return (
    <AuthShell accountType={selected}>
      {screen === "auth" && (
        <>
          <AuthCardHeader
            accountType={selected}
            title={tab === "login" ? "Logowanie" : "Rejestracja"}
            typeLabel={typeLabel}
            onChangeType={goBackToTypeSelect}
          />
          <AuthTabs
            accountType={selected}
            tab={tab}
            onLogin={() => {
              setTab("login");
              setMsg(null);
            }}
            onRegister={() => {
              setTab("register");
              setMsg(null);
            }}
          />

          <div className="px-6 sm:px-8 pb-8 pt-4 space-y-4">
            {msg ? <AuthMessage>{msg}</AuthMessage> : null}

            {tab === "register" ? (
              <AuthInput
                accountType={selected}
                placeholder="Nazwa użytkownika"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            ) : null}

            <AuthInput
              accountType={selected}
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              type="email"
            />

            <AuthInput
              accountType={selected}
              placeholder="Hasło"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />

            {tab === "register" ? (
              <AuthInput
                accountType={selected}
                placeholder="Powtórz hasło"
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                autoComplete="new-password"
              />
            ) : null}

            {tab === "login" ? (
              <button
                type="button"
                className={`text-sm ${accent.link} transition-colors min-h-[44px]`}
                onClick={() => {
                  setScreen("reset");
                  setResetEmail(email);
                  setMsg(null);
                }}
              >
                Nie pamiętasz hasła?
              </button>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={tab === "login" ? onLogin : onRegister}
              className={`w-full min-h-[48px] rounded-xl text-base font-semibold disabled:opacity-60 transition-colors ${accent.button}`}
            >
              {busy ? "Proszę czekać…" : tab === "login" ? "Zaloguj się" : "Utwórz konto"}
            </button>

            {tab === "register" && selected === "employer" ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                Po rejestracji pracodawca przechodzi do płatności i bez aktywnej subskrypcji nie
                wejdzie dalej.
              </p>
            ) : null}

            {tab === "register" && selected === "worker" ? (
              <p className="text-xs text-slate-400 leading-relaxed">
                Po rejestracji pracownik przechodzi na ekran oczekiwania.
              </p>
            ) : null}

            <p className="text-center text-sm text-slate-400 pt-1">
              {tab === "login" ? (
                <>
                  Nie masz konta?{" "}
                  <button
                    type="button"
                    className={`font-medium ${accent.link}`}
                    onClick={() => {
                      setTab("register");
                      setMsg(null);
                    }}
                  >
                    Zarejestruj się
                  </button>
                </>
              ) : (
                <>
                  Masz już konto?{" "}
                  <button
                    type="button"
                    className={`font-medium ${accent.link}`}
                    onClick={() => {
                      setTab("login");
                      setMsg(null);
                    }}
                  >
                    Zaloguj się
                  </button>
                </>
              )}
            </p>
          </div>
        </>
      )}

      {screen === "reset" && (
        <>
          <AuthCardHeader
            accountType={selected}
            title="Reset hasła"
            typeLabel={typeLabel}
            onChangeType={goBackToTypeSelect}
          />
          <div className="px-6 sm:px-8 pb-8 pt-2 space-y-4">
            <p className="text-sm text-slate-400 leading-relaxed">
              Podaj adres email, a wyślemy Ci link do zresetowania hasła.
            </p>

            {msg ? <AuthMessage>{msg}</AuthMessage> : null}

            <AuthInput
              accountType={selected}
              placeholder="Email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              autoComplete="email"
              type="email"
            />

            <button
              type="button"
              disabled={busy}
              onClick={onSendReset}
              className={`w-full min-h-[48px] rounded-xl text-base font-semibold disabled:opacity-60 transition-colors ${accent.button}`}
            >
              {busy ? "Proszę czekać…" : "Wyślij link resetujący"}
            </button>

            <p className="text-center text-sm text-slate-400">
              Pamiętasz hasło?{" "}
              <button
                type="button"
                className={`font-medium ${accent.link}`}
                onClick={() => {
                  setScreen("auth");
                  setTab("login");
                  setMsg(null);
                }}
              >
                Zaloguj się
              </button>
            </p>
          </div>
        </>
      )}

      {screen === "reset-sent" && (
        <>
          <AuthCardHeader
            accountType={selected}
            title="Sprawdź swoją skrzynkę"
            typeLabel={typeLabel}
            onChangeType={goBackToTypeSelect}
          />
          <div className="px-6 sm:px-8 pb-8 pt-2 space-y-5 text-center">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]"
              aria-hidden
            >
              <svg
                className={`w-7 h-7 ${accent.emailHighlight}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </div>

            <p className="text-sm text-slate-400 leading-relaxed">
              Wysłaliśmy link do zresetowania hasła na adres:
            </p>
            <p className={`text-base font-semibold break-all ${accent.emailHighlight}`}>
              {resetEmail.trim() || email.trim()}
            </p>

            <button
              type="button"
              className={`w-full min-h-[48px] rounded-xl text-base font-semibold transition-colors ${accent.button}`}
              onClick={() => {
                setScreen("auth");
                setTab("login");
                setMsg(null);
              }}
            >
              Wróć do logowania
            </button>
          </div>
        </>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

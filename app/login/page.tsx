"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoginTypeSelect from "@/components/LoginTypeSelect";
import { apiFetch } from "@/lib/api";

type AccountType = "worker" | "employer";
type Tab = "login" | "register";
type Screen = "auth" | "reset";

function normalizeType(v: string | null): AccountType | null {
  if (v === "worker") return "worker";
  if (v === "employer") return "employer";
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const accountType = useMemo(() => normalizeType(sp.get("type")), [sp]);
  const hasType = accountType !== null;
  const selected: AccountType = accountType ?? "worker";
  const typeLabel = selected === "employer" ? "Pracodawca" : "Pracownik";

  const [tab, setTab] = useState<Tab>("login");
  const [screen, setScreen] = useState<Screen>("auth");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
      if (me?.billingStatus !== "active") {
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

  useEffect(() => {
    if (!hasType) return;
    console.log("TODO AUTH");
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasType, selected]);

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

      console.log("LOGIN TODO");

      const role = await ensureRoleOrBlock(selected);

      if (role !== selected) {
        console.log("LOGOUT TODO");
        throw new Error("To konto jest innego typu. Wybierz właściwy typ na ekranie startowym.");
      }

      if (role === "worker") {
        await afterWorkerAuth();
        return;
      }

      await afterEmployerAuth();
    } catch (e: any) {
      const m = e?.message ?? "Błąd logowania.";
      setMsg(
        m === "ROLE_MISMATCH"
          ? "To konto już istnieje jako inny typ. Wybierz prawidłowy typ na ekranie startowym."
          : m
      );
      try {
        console.log("LOGOUT TODO");
      } catch {}
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

      console.log("REGISTER TODO");

      const role = await ensureRoleOrBlock(selected, displayName.trim());

      if (role !== selected) {
        console.log("LOGOUT TODO");
        throw new Error("To konto już istnieje jako inny typ. Wybierz prawidłowy typ.");
      }

      if (role === "employer") {
        router.replace("/subskrypcja");
        return;
      }

      router.replace("/oczekiwanie");
    } catch (e: any) {
      const m = e?.message ?? "Błąd rejestracji.";
      setMsg(
        m === "ROLE_MISMATCH"
          ? "To konto już istnieje jako inny typ. Zaloguj się w prawidłowym trybie."
          : m
      );
      try {
        console.log("LOGOUT TODO");
      } catch {}
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
      setMsg("Wysłano email do resetu hasła.");
    } catch (e: any) {
      setMsg(e?.message ?? "Nie udało się wysłać resetu hasła.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasType) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <LoginTypeSelect />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Logowanie</h1>
            <div className="text-sm text-gray-600 mt-1">
              Tryb: <b>{typeLabel}</b>
            </div>
          </div>

          <button
            type="button"
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
            onClick={goBackToTypeSelect}
          >
            Zmień typ
          </button>
        </div>

        {screen === "auth" ? (
          <div className="border rounded-2xl bg-white overflow-hidden shadow-sm">
            <div className="flex border-b">
              <button
                type="button"
                onClick={() => setTab("login")}
                className={[
                  "flex-1 px-4 py-3 text-sm font-medium",
                  tab === "login" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50",
                ].join(" ")}
              >
                Zaloguj się
              </button>

              <button
                type="button"
                onClick={() => setTab("register")}
                className={[
                  "flex-1 px-4 py-3 text-sm font-medium",
                  tab === "register" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50",
                ].join(" ")}
              >
                Zarejestruj się
              </button>
            </div>

            <div className="p-4 space-y-3">
              {msg ? (
                <div className="text-sm border rounded p-2 bg-gray-50">{msg}</div>
              ) : null}

              {tab === "register" ? (
                <input
                  className="w-full border rounded px-3 py-2 bg-white"
                  placeholder="Nazwa użytkownika"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              ) : null}

              <input
                className="w-full border rounded px-3 py-2 bg-white"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />

              <input
                className="w-full border rounded px-3 py-2 bg-white"
                placeholder="Hasło"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete={tab === "login" ? "current-password" : "new-password"}
              />

              {tab === "register" ? (
                <input
                  className="w-full border rounded px-3 py-2 bg-white"
                  placeholder="Powtórz hasło"
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  autoComplete="new-password"
                />
              ) : null}

              <div className="flex items-center justify-between gap-3">
                {tab === "login" ? (
                  <button
                    type="button"
                    className="text-sm underline"
                    onClick={() => {
                      setScreen("reset");
                      setResetEmail(email);
                      setMsg(null);
                    }}
                  >
                    Nie pamiętasz hasła?
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={tab === "login" ? onLogin : onRegister}
                  className="px-4 py-2 rounded bg-gray-900 text-white disabled:opacity-60"
                >
                  {busy ? "..." : tab === "login" ? "Zaloguj" : "Utwórz konto"}
                </button>
              </div>

              {tab === "register" && selected === "employer" ? (
                <div className="text-xs text-gray-600">
                  Po rejestracji pracodawca przechodzi do płatności i bez aktywnej subskrypcji nie wejdzie dalej.
                </div>
              ) : null}

              {tab === "register" && selected === "worker" ? (
                <div className="text-xs text-gray-600">
                  Po rejestracji pracownik przechodzi na ekran oczekiwania.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="border rounded-2xl bg-white p-4 space-y-3 shadow-sm">
            <div className="text-lg font-semibold">Reset hasła</div>

            {msg ? <div className="text-sm border rounded p-2 bg-gray-50">{msg}</div> : null}

            <input
              className="w-full border rounded px-3 py-2 bg-white"
              placeholder="Email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              autoComplete="email"
            />

            <div className="flex items-center justify-between">
              <button
                type="button"
                className="px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
                onClick={() => {
                  setScreen("auth");
                  setMsg(null);
                }}
              >
                Wróć
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={onSendReset}
                className="px-4 py-2 rounded bg-gray-900 text-white disabled:opacity-60"
              >
                {busy ? "..." : "Wyślij link"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthCardHeader } from "@/components/auth/AuthCardHeader";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthMessage } from "@/components/auth/AuthMessage";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setMsg(null);
    try {
      if (!password || password.length < 8) {
        throw new Error("Hasło musi mieć co najmniej 8 znaków.");
      }
      if (password !== password2) {
        throw new Error("Hasła nie są takie same.");
      }

      const res = await fetch("/api/auth/recovery/complete", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        if (json.error === "AUTH_PASSWORD_RECOVERY_INVALID") {
          throw new Error("Link do resetu hasła jest nieprawidłowy lub wygasł.");
        }
        if (json.error === "AUTH_PASSWORD_REAUTH_REQUIRED") {
          throw new Error(
            typeof json.message === "string"
              ? json.message
              : "Aby zmienić hasło, potwierdź tożsamość ponownie."
          );
        }
        if (json.error === "AUTH_MODE_MISMATCH") {
          throw new Error("Reset hasła jest niedostępny.");
        }
        throw new Error("Nie udało się ustawić nowego hasła.");
      }

      setPassword("");
      setPassword2("");
      router.replace("/login?recovered=1");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Nie udało się ustawić nowego hasła.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell accountType="worker">
      <AuthCardHeader
        accountType="worker"
        title="Nowe hasło"
        typeLabel="Konto"
      />
      <div className="px-6 sm:px-8 pb-8 pt-2 space-y-4">
        <p className="text-sm text-slate-400 leading-relaxed">
          Ustaw nowe hasło dla swojego konta.
        </p>
        {msg ? <AuthMessage>{msg}</AuthMessage> : null}
        <AuthInput
          accountType="worker"
          placeholder="Nowe hasło"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <AuthInput
          accountType="worker"
          placeholder="Powtórz hasło"
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          autoComplete="new-password"
        />
        <button
          type="button"
          disabled={busy}
          onClick={onSubmit}
          className="w-full min-h-[48px] rounded-xl text-base font-semibold disabled:opacity-60 transition-colors bg-sky-500 text-white hover:bg-sky-400"
        >
          {busy ? "Proszę czekać…" : "Zapisz hasło"}
        </button>
      </div>
    </AuthShell>
  );
}

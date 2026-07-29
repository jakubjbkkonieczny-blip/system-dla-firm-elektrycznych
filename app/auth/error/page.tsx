"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthCardHeader } from "@/components/auth/AuthCardHeader";
import { AuthMessage } from "@/components/auth/AuthMessage";
import { publicMessageForAuthError, type AuthErrorCategory } from "@/lib/supabase/errors";

const KNOWN: ReadonlySet<string> = new Set([
  "AUTH_CONFIGURATION_ERROR",
  "AUTH_UNAUTHENTICATED",
  "AUTH_CALLBACK_INVALID",
  "AUTH_CALLBACK_EXPIRED",
  "AUTH_USER_UNLINKED",
  "AUTH_USER_CONFLICT",
  "AUTH_USER_INACTIVE",
  "AUTH_EMAIL_CONFLICT",
  "AUTH_PROVIDER_UNAVAILABLE",
  "AUTH_PROVISIONING_FAILED",
  "AUTH_PASSWORD_RECOVERY_INVALID",
  "AUTH_PASSWORD_REAUTH_REQUIRED",
  "AUTH_MODE_MISMATCH",
]);

function AuthErrorInner() {
  const sp = useSearchParams();
  const reason = sp.get("reason") ?? "AUTH_CALLBACK_INVALID";
  const category = (KNOWN.has(reason) ? reason : "AUTH_CALLBACK_INVALID") as AuthErrorCategory;
  const message = useMemo(() => publicMessageForAuthError(category), [category]);

  return (
    <AuthShell accountType="worker">
      <AuthCardHeader
        accountType="worker"
        title="Problem z uwierzytelnianiem"
        typeLabel="Konto"
      />
      <div className="px-6 sm:px-8 pb-8 pt-2 space-y-4">
        <AuthMessage>{message}</AuthMessage>
        <p className="text-sm text-slate-400 leading-relaxed">
          Link mógł wygasnąć albo został już użyty. Poproś o nowy link albo zaloguj się ponownie.
        </p>
        <Link
          href="/login"
          className="inline-flex w-full min-h-[48px] items-center justify-center rounded-xl text-base font-semibold bg-sky-500 text-white hover:bg-sky-400 transition-colors"
        >
          Wróć do logowania
        </Link>
      </div>
    </AuthShell>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorInner />
    </Suspense>
  );
}

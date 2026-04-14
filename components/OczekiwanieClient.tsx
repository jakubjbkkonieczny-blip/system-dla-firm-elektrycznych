"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function OczekiwanieClient() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const isMountedRef = useRef(false);
  const isCheckingRef = useRef(false);

  const checkCompanies = useCallback(
    async (showError: boolean) => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;

      try {
        const data = await apiFetch("/api/me/companies");
        const companies = Array.isArray(data?.companies) ? data.companies : [];

        if (!isMountedRef.current) return;

        if (companies.length > 0) {
          router.replace("/dashboard");
        }
      } catch {
        if (showError && isMountedRef.current) {
          setMsg("Nie udało się sprawdzić. Spróbuj ponownie.");
        }
      } finally {
        isCheckingRef.current = false;
      }
    },
    [router]
  );

  useEffect(() => {
    isMountedRef.current = true;
    void checkCompanies(false);
    const t = setInterval(() => {
      void checkCompanies(false);
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(t);
    };
  }, [checkCompanies]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl border rounded-2xl bg-white p-8 space-y-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Oczekiwanie na przypisanie do firmy</h1>
          <p className="text-gray-600 leading-7">
            Twoje konto zostało utworzone. Poczekaj, aż pracodawca doda Cię do swojej firmy.
          </p>
        </div>

        <div className="border rounded-xl p-4 bg-gray-50 text-sm text-gray-700">
          Gdy tylko zostaniesz przypisany do firmy, system automatycznie przeniesie Cię do środka.
        </div>

        {msg ? <div className="text-sm border rounded p-3 bg-gray-50">{msg}</div> : null}

        <button
          type="button"
          className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-sm"
          onClick={async () => {
            setMsg(null);
            await checkCompanies(true);
            if (isMountedRef.current) {
              setMsg((prev) => prev ?? "Nadal nie masz przypisanej firmy.");
            }
          }}
        >
          Sprawdź teraz
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch } from "@/lib/api";

export default function SubskrypcjaPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<"active" | "inactive" | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const me = await apiFetch("/api/me");
        setBillingStatus(me?.billingStatus ?? null);

        if (me?.role === "worker") {
          router.replace("/dashboard");
          return;
        }

        if (me?.billingStatus === "active") {
          router.replace("/dashboard");
        }
      } catch {}
    })();
  }, [user, router]);

  if (loading) return <div className="p-6">Ładowanie...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl border rounded-2xl bg-white p-8 space-y-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Aktywacja konta pracodawcy</h1>
          <p className="text-gray-600">
            Aby korzystać z systemu, aktywuj subskrypcję. Bez aktywnej płatności
            nie możesz przejść dalej.
          </p>
        </div>

        <div className="border rounded-xl p-4 bg-gray-50 text-sm text-gray-700 space-y-2">
          <div>
            Status subskrypcji: <b>{billingStatus ?? "..."}</b>
          </div>
          <div>
            Pierwsza firma: <b>400 zł / miesiąc</b>
          </div>
          <div>
            Każda kolejna firma: <b>+250 zł / miesiąc</b>
          </div>
        </div>

        {msg ? <div className="text-sm border rounded p-3 bg-red-50 text-red-700">{msg}</div> : null}

        <button
          className="px-5 py-3 rounded-xl bg-gray-900 text-white disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const data = await apiFetch("/api/stripe/checkout", { method: "POST" });
              if (!data?.url) throw new Error("Brak URL do płatności.");
              window.location.href = data.url;
            } catch (e: any) {
              setMsg(e?.message ?? "Błąd płatności.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Przekierowuję..." : "Przejdź do płatności"}
        </button>
      </div>
    </div>
  );
}
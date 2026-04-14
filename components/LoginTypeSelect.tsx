"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginTypeSelect() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col p-6">

      {/* 🔙 BACK BUTTON */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm"
        >
          ← Strona główna
        </Link>
      </div>

      {/* RESZTA */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-4xl space-y-8">

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-semibold">
              Wybierz typ konta
            </h1>
            <p className="text-gray-600">
              Zaloguj się lub zarejestruj jako pracodawca albo pracownik.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => router.push("/login?type=worker")}
              className="border rounded-2xl p-8 bg-white hover:bg-gray-50 text-left space-y-3"
            >
              <div className="text-2xl font-semibold">PRACOWNIK</div>
              <p className="text-sm text-gray-600">
                Odbieraj zadania od pracodawcy, dodawaj notatki i oznaczaj wykonane etapy.
              </p>
            </button>

            <button
              onClick={() => router.push("/login?type=employer")}
              className="border rounded-2xl p-8 bg-white hover:bg-gray-50 text-left space-y-3"
            >
              <div className="text-2xl font-semibold">PRACODAWCA</div>
              <p className="text-sm text-gray-600">
                Zarządzaj zleceniami i pracownikami. Porządek w robocie bez chaosu w wiadomościach.
              </p>
              <div className="text-sm font-medium text-green-700">
                Subskrypcja: 400 zł / miesiąc
              </div>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
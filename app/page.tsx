import Link from "next/link";
import InstallApp from "@/components/InstallApp";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="border-b bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-3xl space-y-6">

            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm">
              ⚡ Elektra
            </div>

            <h1 className="text-4xl md:text-6xl font-semibold leading-tight">
              System do zarządzania zleceniami, pracownikami i postępem prac
            </h1>

            <p className="text-lg text-gray-600 leading-8">
              Prosty system dla firm technicznych. Zlecenia, zdjęcia, notatki, statusy
              i porządek w jednym miejscu. Bez chaosu w wiadomościach i bez kombinowania.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/login"
                className="px-6 py-3 rounded-xl bg-gray-900 text-white hover:opacity-90"
              >
                Rozpocznij
              </Link>

              <a
                href="#o-produkcie"
                className="px-6 py-3 rounded-xl border bg-white hover:bg-gray-50"
              >
                Dowiedz się więcej
              </a>
            </div>

            {/* 🔥 PWA INSTALL BOX */}
            <InstallApp />

          </div>
        </div>
      </section>

      <section id="o-produkcie" className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="border rounded-2xl p-6 bg-white">
            <div className="text-2xl mb-3">🧾</div>
            <h2 className="font-semibold text-xl mb-2">
              Zlecenia w jednym miejscu
            </h2>
            <p className="text-gray-600 text-sm leading-6">
              Dodawaj zlecenia, przypisuj ludzi, kontroluj status i miej porządek w pracy.
            </p>
          </div>

          <div className="border rounded-2xl p-6 bg-white">
            <div className="text-2xl mb-3">👷</div>
            <h2 className="font-semibold text-xl mb-2">
              Proste dla pracownika
            </h2>
            <p className="text-gray-600 text-sm leading-6">
              Pracownik widzi tylko to, czego potrzebuje. Bez zbędnych opcji i chaosu.
            </p>
          </div>

          <div className="border rounded-2xl p-6 bg-white">
            <div className="text-2xl mb-3">📷</div>
            <h2 className="font-semibold text-xl mb-2">
              Zdjęcia, notatki, postęp
            </h2>
            <p className="text-gray-600 text-sm leading-6">
              Dokumentuj robotę na bieżąco i miej wszystko pod ręką w jednym panelu.
            </p>
          </div>

        </div>
      </section>
    </main>
  );
}
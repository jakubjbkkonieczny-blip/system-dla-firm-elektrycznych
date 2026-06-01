import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#070d18] text-slate-100 overflow-x-hidden">
      <LandingHeader />
      <LandingHero />

      <section id="funkcje" className="relative bg-slate-50 text-gray-900 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">
              Wszystko, czego potrzebuje firma techniczna
            </h2>
            <p className="mt-3 text-gray-600">
              Porządek w zleceniach, jasny podział ról i dokumentacja pracy w jednym systemie.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border rounded-2xl p-6 bg-white shadow-sm">
              <div className="text-2xl mb-3" aria-hidden>
                🧾
              </div>
              <h3 className="font-semibold text-xl mb-2">Zlecenia w jednym miejscu</h3>
              <p className="text-gray-600 text-sm leading-6">
                Dodawaj zlecenia, przypisuj ludzi, kontroluj status i miej porządek w pracy.
              </p>
            </div>

            <div className="border rounded-2xl p-6 bg-white shadow-sm">
              <div className="text-2xl mb-3" aria-hidden>
                👷
              </div>
              <h3 className="font-semibold text-xl mb-2">Proste dla pracownika</h3>
              <p className="text-gray-600 text-sm leading-6">
                Pracownik widzi tylko to, czego potrzebuje. Bez zbędnych opcji i chaosu.
              </p>
            </div>

            <div className="border rounded-2xl p-6 bg-white shadow-sm">
              <div className="text-2xl mb-3" aria-hidden>
                📷
              </div>
              <h3 className="font-semibold text-xl mb-2">Zdjęcia, notatki, postęp</h3>
              <p className="text-gray-600 text-sm leading-6">
                Dokumentuj robotę na bieżąco i miej wszystko pod ręką w jednym panelu.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="dla-kogo"
        className="border-t border-gray-200 bg-white text-gray-900"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold text-center mb-8">Dla kogo?</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-700">
            <li className="rounded-xl border p-4 bg-gray-50">Firmy elektryczne</li>
            <li className="rounded-xl border p-4 bg-gray-50">Serwisy techniczne</li>
            <li className="rounded-xl border p-4 bg-gray-50">Ekipy montażowe</li>
            <li className="rounded-xl border p-4 bg-gray-50">Właściciele i koordynatorzy</li>
          </ul>
        </div>
      </section>

      <section
        id="jak-to-dziala"
        className="border-t border-gray-200 bg-slate-50 text-gray-900"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold text-center mb-8">Jak to działa</h2>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-600">
            <li className="rounded-2xl border bg-white p-5">
              <span className="text-amber-600 font-bold">1.</span> Załóż konto i dodaj firmę
            </li>
            <li className="rounded-2xl border bg-white p-5">
              <span className="text-amber-600 font-bold">2.</span> Twórz zlecenia i przypisuj pracowników
            </li>
            <li className="rounded-2xl border bg-white p-5">
              <span className="text-amber-600 font-bold">3.</span> Śledź postęp i dokumentację w terenie
            </li>
          </ol>
        </div>
      </section>

      <footer
        id="kontakt"
        className="border-t border-gray-200 bg-white text-gray-900"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
          <p>© {new Date().getFullYear()} Elektra — system dla firm technicznych</p>
          <Link
            href="/login"
            className="font-medium text-amber-700 hover:text-amber-600"
          >
            Zaloguj się do panelu
          </Link>
        </div>
      </footer>
    </main>
  );
}

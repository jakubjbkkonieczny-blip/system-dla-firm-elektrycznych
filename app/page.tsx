import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHero } from "@/components/landing/LandingHero";
import { APP_BRANDING } from "@/lib/branding";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#070d18] text-slate-100 overflow-x-hidden">
      <LandingHeader />
      <LandingHero />

      <section id="funkcje" className="relative scroll-mt-32 border-t border-white/10 bg-[#070d18]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,0.16),transparent_55%)]" aria-hidden />
        <div className="relative max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
              Wszystko czego potrzebuje firma techniczna
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed">
              Porządek w zleceniach, pracownikach i dokumentacji pracy w jednym miejscu.
            </p>
          </div>

          <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
            {[
              {
                icon: "🧾",
                title: "Zarządzanie zleceniami",
                description: "Twórz i porządkuj zlecenia, przypisuj odpowiedzialnych i trzymaj terminy pod kontrolą.",
              },
              {
                icon: "👥",
                title: "Zarządzanie pracownikami",
                description: "Widzisz kto pracuje, kto jest dostępny i jak rozdzielać zadania bez zbędnych telefonów.",
              },
              {
                icon: "📷",
                title: "Zdjęcia z realizacji",
                description: "Dokumentuj postępy prac zdjęciami i przechowuj je zawsze przy konkretnym zleceniu.",
              },
              {
                icon: "📝",
                title: "Notatki terenowe",
                description: "Zapisuj ustalenia, pomiary i uwagi bezpośrednio z telefonu, od razu dla całego zespołu.",
              },
              {
                icon: "📊",
                title: "Statusy prac",
                description: "Śledź etapy realizacji w czasie rzeczywistym i szybko reaguj na opóźnienia.",
              },
              {
                icon: "📱",
                title: "Dostęp z każdego urządzenia",
                description: "Biuro i teren mają ten sam widok danych na komputerze, tablecie i smartfonie.",
              },
            ].map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-white/15 bg-white/[0.04] p-6 sm:p-7 backdrop-blur-sm shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/12 text-xl" aria-hidden>
                  {feature.icon}
                </div>
                <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm sm:text-base leading-relaxed text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="korzysci" className="relative scroll-mt-32 border-t border-white/10 bg-[#070d18]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_10%,rgba(245,158,11,0.14),transparent_55%)]" aria-hidden />
        <div className="relative max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
              Dlaczego firmy wybierają {APP_BRANDING.name}?
            </h2>
            <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed">
              Oszczędzaj czas, eliminuj chaos i trzymaj wszystkie informacje w jednym miejscu.
            </p>
          </div>

          <div className="mt-10 sm:mt-12 grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {[
              {
                icon: "📞",
                title: "Mniej telefonów",
                description: "Zespół widzi aktualny status pracy w systemie, więc nie trzeba dopytywać o każdy etap.",
              },
              {
                icon: "🗂️",
                title: "Wszystko w jednym miejscu",
                description: "Zlecenia, zdjęcia, notatki i postępy realizacji są zebrane w jednym spójnym panelu.",
              },
              {
                icon: "⚡",
                title: "Szybsza organizacja pracy",
                description: "Planowanie i delegowanie zadań zajmuje mniej czasu, a każdy wie co ma zrobić.",
              },
              {
                icon: "🎯",
                title: "Lepsza kontrola firmy",
                description: "Masz pełny obraz działań terenowych i łatwiej podejmujesz decyzje operacyjne.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-white/15 bg-white/[0.04] p-6 sm:p-8 backdrop-blur-sm shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-400/35 bg-blue-500/12 text-xl" aria-hidden>
                  {item.icon}
                </div>
                <h3 className="mt-5 text-2xl font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-300">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="dla-kogo" className="relative scroll-mt-32 border-t border-white/10 bg-[#070d18]">
        <div className="relative max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">
              Dla kogo jest {APP_BRANDING.name}?
            </h2>
          </div>

          <div className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {[
              {
                icon: "⚡",
                title: "Firmy elektryczne",
                description: "Dla zespołów realizujących instalacje, naprawy i przeglądy w różnych lokalizacjach.",
              },
              {
                icon: "🛠️",
                title: "Firmy serwisowe",
                description: "Dla ekip serwisowych, które potrzebują szybkiej dokumentacji i jasnego podziału zadań.",
              },
              {
                icon: "🏗️",
                title: "Ekipy montażowe",
                description: "Dla brygad montażowych pracujących równolegle na wielu obiektach i etapach.",
              },
              {
                icon: "📋",
                title: "Właściciele i koordynatorzy",
                description: "Dla osób zarządzających firmą i harmonogramem, które potrzebują pełnej kontroli.",
              },
            ].map((audience) => (
              <article
                key={audience.title}
                className="rounded-2xl border border-white/15 bg-white/[0.04] p-6 backdrop-blur-sm shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-xl" aria-hidden>
                  {audience.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{audience.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{audience.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="jak-to-dziala" className="relative scroll-mt-32 border-t border-white/10 bg-[#070d18]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(59,130,246,0.12),transparent_55%)]" aria-hidden />
        <div className="relative max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white">Jak zacząć?</h2>
          </div>

          <ol className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-5">
            {[
              "Załóż konto pracodawcy",
              "Dodaj pracowników",
              "Twórz zlecenia",
              "Monitoruj postęp",
            ].map((step, index) => (
              <li
                key={step}
                className="relative rounded-2xl border border-white/15 bg-white/[0.04] p-5 sm:p-6 backdrop-blur-sm shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
              >
                {index < 3 && (
                  <span
                    className="hidden lg:block pointer-events-none absolute top-1/2 left-[calc(100%-0.2rem)] h-[2px] w-6 bg-gradient-to-r from-amber-400/70 to-blue-400/70"
                    aria-hidden
                  />
                )}
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/35 bg-amber-500/15 text-sm font-bold text-amber-300">
                  {index + 1}
                </span>
                <p className="mt-4 text-base sm:text-lg font-medium leading-snug text-white">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="kontakt" className="relative scroll-mt-32 border-t border-white/10 bg-[#070d18]">
        <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="mx-auto max-w-3xl text-center rounded-2xl border border-white/15 bg-white/[0.04] p-8 sm:p-10 backdrop-blur-sm shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">Kontakt</h2>
            <p className="mt-3 text-slate-300 text-base sm:text-lg">
              Masz pytania lub chcesz wdrożyć {APP_BRANDING.name} w swojej firmie?
            </p>
            <a
              href="mailto:jkvector.stystem@gmail.com"
              className="mt-6 inline-flex items-center justify-center min-h-[44px] rounded-xl border border-amber-500/35 bg-amber-500/10 px-5 py-3 text-base font-medium text-amber-200 hover:bg-amber-500/15 transition-colors"
            >
              📧 jkvector.stystem@gmail.com
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#050a14]">
        <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <p>
            © {new Date().getFullYear()} {APP_BRANDING.name} — {APP_BRANDING.footerTagline}
          </p>
          <Link href="/login" className="font-medium text-amber-300 hover:text-amber-200 transition-colors">
            Zaloguj się do panelu
          </Link>
        </div>
      </footer>
    </main>
  );
}

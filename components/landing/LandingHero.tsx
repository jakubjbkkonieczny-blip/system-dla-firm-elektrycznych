import Image from "next/image";
import Link from "next/link";
import InstallApp from "@/components/InstallApp";
import { HeroStatsCard } from "@/components/landing/HeroStatsCard";
import { LandingBenefits } from "@/components/landing/LandingBenefits";

const HERO_IMAGE_SRC = "/landing/hero-electrician.png";

function CtaArrow() {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

export function LandingHero() {
  return (
    <div className="relative bg-[#070d18]">
      <section
        className="relative min-h-[min(100svh,920px)] lg:min-h-[720px] flex flex-col overflow-hidden"
        aria-labelledby="landing-hero-heading"
      >
        {/* Base + atmosphere */}
        <div className="pointer-events-none absolute inset-0 bg-[#070d18]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 landing-hero-glow opacity-80"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 landing-lightning-accent opacity-70"
          aria-hidden
        />

        {/* Desktop: cinematic hero photo — right half */}
        <div className="hidden lg:block absolute right-0 top-16 xl:top-[4.25rem] bottom-0 w-[62vw] max-w-[1180px] z-0">
          <Image
            src={HERO_IMAGE_SRC}
            alt="Elektryk pracujący przy rozdzielni elektrycznej — widok z prawej strony hero"
            fill
            className="object-cover object-[72%_center]"
            sizes="62vw"
            priority
          />
        </div>

        {/* Readability gradients — light touch so photo stays visible */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[48%] z-[1] bg-gradient-to-r from-[#070d18] via-[#070d18]/85 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-44 z-[1] bg-gradient-to-t from-[#0a101c] via-[#0a101c]/60 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-[1] hidden lg:block bg-[radial-gradient(ellipse_at_72%_42%,rgba(59,130,246,0.14),transparent_55%)]"
          aria-hidden
        />

        {/* Main hero content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center pt-20 sm:pt-24 lg:pt-[4.25rem]">
          <div className="max-w-[88rem] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
            <div className="max-w-[600px] mx-auto lg:mx-0 text-center lg:text-left landing-fade-up">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-4 py-1.5 text-sm text-slate-100 backdrop-blur-sm">
                <span
                  className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]"
                  aria-hidden
                />
                System dla firm technicznych
              </div>

              <h1
                id="landing-hero-heading"
                className="mt-5 sm:mt-6 text-[2.125rem] leading-[1.08] sm:text-5xl md:text-6xl lg:text-[3.5rem] xl:text-7xl font-black tracking-tight text-white"
              >
                <span className="block">Zarządzaj zleceniami,</span>
                <span className="block">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
                    pracownikami
                  </span>
                </span>
                <span className="block">i postępem prac.</span>
              </h1>

              <p className="mt-5 sm:mt-6 text-base sm:text-lg lg:text-xl text-slate-300 leading-relaxed max-w-[34rem] mx-auto lg:mx-0">
                Prosty system, który porządkuje Twoją firmę. Zlecenia, zdjęcia, notatki,
                statusy i wszystko w jednym miejscu.
              </p>

              <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start">
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-8 py-4 rounded-xl text-base sm:text-lg font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 transition-colors shadow-lg shadow-amber-500/30"
                >
                  Rozpocznij teraz
                  <CtaArrow />
                </Link>
                <a
                  href="#funkcje"
                  className="w-full sm:w-auto inline-flex justify-center items-center px-8 py-4 rounded-xl text-base sm:text-lg font-medium text-white border border-white/25 bg-white/[0.06] hover:bg-white/12 transition-colors backdrop-blur-sm"
                >
                  Dowiedz się więcej
                </a>
              </div>

              <div className="mt-6 lg:hidden [&_.border]:border-white/15 [&_.bg-gray-100]:bg-white/10 [&_.text-gray-900]:text-white [&_.text-gray-600]:text-slate-400 [&_button]:bg-amber-500 [&_button]:text-slate-950">
                <InstallApp />
              </div>
            </div>

            {/* Mobile / tablet: photo below copy */}
            <div className="lg:hidden relative mt-10 w-full aspect-[4/5] max-h-[min(52vh,440px)] rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
              <Image
                src={HERO_IMAGE_SRC}
                alt="Elektryk pracujący przy rozdzielni elektrycznej"
                fill
                className="object-cover object-[70%_center]"
                sizes="100vw"
                priority
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070d18]/80 via-transparent to-transparent"
                aria-hidden
              />
            </div>

            {/* Mobile stat cards */}
            <div className="lg:hidden mt-6 flex flex-col gap-3 max-w-md mx-auto w-full">
              <HeroStatsCard value="24" label="Aktywne zlecenia" icon="jobs" />
              <HeroStatsCard value="8" label="Pracowników online" icon="users" showOnlineDot />
              <HeroStatsCard value="98%" label="Zadowolonych klientów" icon="satisfaction" />
            </div>
          </div>
        </div>

        {/* Desktop floating stat cards — over image */}
        <div className="hidden lg:block pointer-events-none absolute inset-0 z-20">
          <HeroStatsCard
            value="24"
            label="Aktywne zlecenia"
            icon="jobs"
            className="pointer-events-auto absolute right-16 xl:right-24 top-[25%] landing-float-slow"
          />
          <HeroStatsCard
            value="8"
            label="Pracowników online"
            icon="users"
            showOnlineDot
            className="pointer-events-auto absolute right-16 xl:right-24 top-[43%] landing-float-delay"
          />
          <HeroStatsCard
            value="98%"
            label="Zadowolonych klientów"
            icon="satisfaction"
            className="pointer-events-auto absolute right-16 xl:right-24 top-[61%] landing-float-slow"
          />
        </div>
      </section>

      {/* Dark benefits strip — connected to hero */}
      <div
        id="korzysci"
        className="relative z-10 border-t border-white/10 bg-[#0a101c] py-8 sm:py-10"
      >
        <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8">
          <LandingBenefits variant="strip" />
        </div>
      </div>
    </div>
  );
}

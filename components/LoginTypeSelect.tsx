"use client";

import { LandingHeader } from "@/components/landing/LandingHeader";
import Link from "next/link";
import { useRouter } from "next/navigation";

const BENEFITS = [
  { icon: "✓", text: "Działa w przeglądarce" },
  { icon: "⚡", text: "Bez chaosu" },
  { icon: "☁", text: "Bez kombinowania" },
  { icon: "📱", text: "Zawsze pod ręką" },
] as const;

function CardArrow() {
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white"
      aria-hidden
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </span>
  );
}

function WorkerIcon() {
  return (
    <svg className="w-8 h-8 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function EmployerIcon() {
  return (
    <svg className="w-8 h-8 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  );
}

function AccountTypeCard({
  variant,
  title,
  description,
  subscription,
  onClick,
}: {
  variant: "worker" | "employer";
  title: string;
  description: string;
  subscription?: string;
  onClick: () => void;
}) {
  const isWorker = variant === "worker";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative flex w-full max-w-[520px] min-h-[min(380px,70vw)] sm:min-h-[400px] mx-auto flex-col",
        "rounded-2xl border px-8 py-8 sm:px-10 sm:py-10 text-left",
        "bg-slate-950/40 backdrop-blur-xl transition-all duration-300",
        "hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070d18]",
        isWorker
          ? [
              "border-blue-400/35 shadow-[0_0_48px_rgba(59,130,246,0.22)]",
              "hover:border-blue-300/55 hover:shadow-[0_0_56px_rgba(59,130,246,0.35)]",
              "focus-visible:ring-blue-400",
            ].join(" ")
          : [
              "border-amber-400/35 shadow-[0_0_48px_rgba(245,158,11,0.2)]",
              "hover:border-amber-300/55 hover:shadow-[0_0_56px_rgba(245,158,11,0.32)]",
              "focus-visible:ring-amber-400",
            ].join(" "),
      ].join(" ")}
    >
      <div
        className={[
          "flex h-16 w-16 items-center justify-center rounded-full border",
          isWorker
            ? "border-blue-400/40 bg-blue-500/10"
            : "border-amber-400/40 bg-amber-500/10",
        ].join(" ")}
      >
        {isWorker ? <WorkerIcon /> : <EmployerIcon />}
      </div>

      <h2 className="mt-8 text-2xl sm:text-3xl font-bold tracking-wide text-white">{title}</h2>

      <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed flex-1 max-w-[22rem]">
        {description}
      </p>

      {subscription ? (
        <p className="mt-4 text-sm font-semibold text-emerald-400">{subscription}</p>
      ) : (
        <span className="mt-4 block h-5" aria-hidden />
      )}

      <div className="mt-6 flex justify-end">
        <CardArrow />
      </div>
    </button>
  );
}

export default function LoginTypeSelect() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#070d18] text-slate-100 overflow-x-hidden">
      <LandingHeader anchorPrefix="/" />

      <div className="relative min-h-screen flex flex-col pt-16 lg:pt-[4.25rem]">
        {/* Background — matches landing hero */}
        <div className="pointer-events-none absolute inset-0 bg-[#070d18]" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f1c33] via-[#0a1220] to-[#04070f]"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 landing-hero-glow opacity-80" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 landing-lightning-accent opacity-60"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute top-0 right-0 w-[min(80vw,640px)] h-[min(80vw,640px)] bg-[radial-gradient(circle,rgba(37,99,235,0.2)_0%,transparent_65%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.22] bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
          aria-hidden
        />

        <div className="relative z-10 flex-1 flex flex-col">
          <div className="max-w-[75rem] w-full mx-auto px-4 sm:px-6 lg:px-8 flex-1 flex flex-col pb-8">
            <div className="pt-4 sm:pt-6 mb-8 sm:mb-10">
              <Link
                href="/"
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg border border-white/20 bg-white/[0.06] text-sm text-slate-200 hover:bg-white/10 transition-colors backdrop-blur-sm"
              >
                ← Strona główna
              </Link>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-full max-w-3xl text-center space-y-4 sm:space-y-5 mb-10 sm:mb-12 landing-fade-up">
                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-sm text-slate-200 backdrop-blur-sm">
                  Wybór typu konta
                </div>

                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-black tracking-tight text-white leading-[1.1]">
                  Wybierz{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
                    typ konta
                  </span>
                </h1>

                <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
                  Zaloguj się lub zarejestruj jako pracodawca albo pracownik.
                </p>
              </div>

              <div className="w-full max-w-[75rem] grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 justify-items-center landing-fade-up">
                <AccountTypeCard
                  variant="worker"
                  title="PRACOWNIK"
                  description="Odbieraj zadania od pracodawcy, dodawaj notatki i oznaczaj wykonane etapy."
                  onClick={() => router.push("/login?type=worker")}
                />
                <AccountTypeCard
                  variant="employer"
                  title="PRACODAWCA"
                  description="Zarządzaj zleceniami i pracownikami. Porządek w robocie bez chaosu w wiadomościach."
                  subscription="Subskrypcja: 400 zł / miesiąc"
                  onClick={() => router.push("/login?type=employer")}
                />
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/10 bg-[#0a101c]/95 py-8 sm:py-10 mt-auto">
            <ul className="max-w-[75rem] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {BENEFITS.map((item) => (
                <li
                  key={item.text}
                  className="flex items-center justify-center sm:justify-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 min-h-[44px]"
                >
                  <span className="text-lg shrink-0" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="text-sm sm:text-base font-medium text-slate-200">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

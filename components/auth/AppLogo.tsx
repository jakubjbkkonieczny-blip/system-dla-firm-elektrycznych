import Link from "next/link";
import { APP_BRANDING, LOGO_BRANDING } from "@/lib/branding";

export function AppLogoMark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const markClass =
    size === "sm"
      ? "h-9 w-9 rounded-lg text-sm"
      : "h-10 w-10 rounded-xl text-base";

  return (
    <span
      className={[
        "flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/25",
        markClass,
        className,
      ].join(" ")}
      aria-hidden
    >
      {LOGO_BRANDING.placeholderMark}
    </span>
  );
}

export function AppLogo({
  href = "/",
  size = "md",
}: {
  href?: string;
  size?: "sm" | "md";
}) {
  const labelClass = size === "sm" ? "text-lg" : "text-xl";

  return (
    <Link href={href} className="inline-flex items-center gap-2.5 shrink-0">
      <AppLogoMark size={size} />
      <span className={`${labelClass} font-semibold text-white tracking-tight`}>
        {APP_BRANDING.name}
      </span>
    </Link>
  );
}

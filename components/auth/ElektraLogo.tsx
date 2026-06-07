import Link from "next/link";

export function ElektraLogo({
  href = "/",
  size = "md",
}: {
  href?: string;
  size?: "sm" | "md";
}) {
  const markClass =
    size === "sm"
      ? "h-9 w-9 rounded-lg text-sm"
      : "h-10 w-10 rounded-xl text-base";
  const labelClass = size === "sm" ? "text-lg" : "text-xl";

  return (
    <Link href={href} className="inline-flex items-center gap-2.5 shrink-0">
      <span
        className={[
          "flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/25",
          markClass,
        ].join(" ")}
        aria-hidden
      >
        ⚡
      </span>
      <span className={`${labelClass} font-semibold text-white tracking-tight`}>Elektra</span>
    </Link>
  );
}

const BENEFITS = [
  { text: "Bez instalacji" },
  { text: "Bez chaosu" },
  { text: "Bez kombinowania" },
  { text: "Zawsze pod ręką" },
] as const;

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function LandingBenefits({
  id,
  variant = "inline",
}: {
  id?: string;
  variant?: "inline" | "strip";
}) {
  if (variant === "strip") {
    return (
      <ul
        id={id}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
      >
        {BENEFITS.map((item) => (
          <li
            key={item.text}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 sm:py-5"
          >
            <span className="flex shrink-0 items-center justify-center w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30">
              <CheckIcon />
            </span>
            <span className="text-sm sm:text-base font-medium text-slate-200">{item.text}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul
      id={id}
      className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-5 pt-2"
    >
      {BENEFITS.map((item) => (
        <li key={item.text} className="flex items-center gap-2 text-sm text-slate-300">
          <span className="flex shrink-0 items-center justify-center w-7 h-7 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
            <CheckIcon />
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

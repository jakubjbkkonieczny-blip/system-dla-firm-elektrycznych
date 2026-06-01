const BENEFITS = [
  { icon: "✓", text: "Bez instalacji" },
  { icon: "⚡", text: "Bez chaosu" },
  { icon: "☁", text: "Bez kombinowania" },
  { icon: "📱", text: "Zawsze pod ręką" },
] as const;

export function AuthBenefitsStrip() {
  return (
    <div className="relative z-10 border-t border-white/10 bg-[#0a101c]/95 py-6 sm:py-8 mt-auto shrink-0">
      <ul className="max-w-[75rem] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {BENEFITS.map((item) => (
          <li
            key={item.text}
            className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 sm:px-4 py-3 min-h-[44px]"
          >
            <span className="text-base shrink-0" aria-hidden>
              {item.icon}
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-200">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

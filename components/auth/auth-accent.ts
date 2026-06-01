export type AuthAccountType = "worker" | "employer";

export function getAuthAccent(type: AuthAccountType) {
  if (type === "worker") {
    return {
      card: "border-blue-400/30 shadow-[0_0_48px_rgba(59,130,246,0.18)]",
      tabActive: "bg-blue-500/25 text-white border-blue-400/50",
      tabIdle: "text-slate-400 hover:text-slate-200 hover:bg-white/5",
      button:
        "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white shadow-lg shadow-blue-500/25",
      inputFocus: "focus:border-blue-400/60 focus:ring-blue-400/25",
      link: "text-blue-300 hover:text-blue-200",
      typeBadge: "text-blue-300",
      emailHighlight: "text-blue-300",
    };
  }
  return {
    card: "border-amber-400/30 shadow-[0_0_48px_rgba(245,158,11,0.15)]",
    tabActive: "bg-amber-500/25 text-white border-amber-400/50",
    tabIdle: "text-slate-400 hover:text-slate-200 hover:bg-white/5",
    button:
      "bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-lg shadow-amber-500/25",
    inputFocus: "focus:border-amber-400/60 focus:ring-amber-400/25",
    link: "text-amber-300 hover:text-amber-200",
    typeBadge: "text-amber-300",
    emailHighlight: "text-amber-300",
  };
}

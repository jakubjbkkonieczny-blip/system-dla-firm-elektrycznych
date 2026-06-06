export const BUDGET_INPUT_CLASS =
  "w-full min-h-[44px] text-base border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300";

export const BUDGET_BTN_PRIMARY =
  "min-h-[44px] px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-60";

export const BUDGET_BTN_SECONDARY =
  "min-h-[44px] px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium disabled:opacity-60";

export const BUDGET_TAB_CLASS = (active: boolean) =>
  [
    "min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition",
    active
      ? "bg-gray-900 text-white"
      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
  ].join(" ");

export const KPI_CARD_STYLES = {
  budget: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "bg-emerald-500",
    text: "text-emerald-900",
    muted: "text-emerald-700",
  },
  net: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "bg-blue-500",
    text: "text-blue-900",
    muted: "text-blue-700",
  },
  vat: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: "bg-orange-500",
    text: "text-orange-900",
    muted: "text-orange-700",
  },
  gross: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    icon: "bg-purple-500",
    text: "text-purple-900",
    muted: "text-purple-700",
  },
  labor: {
    bg: "bg-teal-50",
    border: "border-teal-200",
    icon: "bg-teal-500",
    text: "text-teal-900",
    muted: "text-teal-700",
  },
  remaining: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: "bg-emerald-500",
    text: "text-emerald-900",
    muted: "text-emerald-700",
  },
  remainingNegative: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "bg-red-500",
    text: "text-red-900",
    muted: "text-red-700",
  },
} as const;

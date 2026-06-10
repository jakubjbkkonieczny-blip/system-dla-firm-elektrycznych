export const BUDGET_INPUT_CLASS =
  "w-full min-h-[44px] text-base border border-border rounded-lg px-3 py-2 bg-input text-text focus:outline-none focus:ring-2 focus:ring-accent";

export const BUDGET_BTN_PRIMARY =
  "min-h-[44px] px-4 py-2 rounded-lg bg-primary text-primary-fg text-sm font-medium hover:opacity-90 disabled:opacity-60";

export const BUDGET_BTN_SECONDARY =
  "min-h-[44px] px-4 py-2 rounded-lg border border-border bg-card text-text hover:bg-card-hover text-sm font-medium disabled:opacity-60";

export const BUDGET_TAB_CLASS = (active: boolean) =>
  [
    "min-h-[44px] px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition",
    active
      ? "bg-primary text-primary-fg"
      : "bg-card text-text border border-border hover:bg-card-hover",
  ].join(" ");

export const KPI_CARD_STYLES = {
  budget: {
    bg: "bg-success-bg",
    border: "border-success-border",
    icon: "bg-success",
    text: "text-success",
    muted: "text-text-muted",
  },
  net: {
    bg: "bg-card",
    border: "border-border",
    icon: "bg-accent",
    text: "text-text",
    muted: "text-text-muted",
  },
  vat: {
    bg: "bg-warning-bg",
    border: "border-warning-border",
    icon: "bg-warning",
    text: "text-warning",
    muted: "text-text-muted",
  },
  gross: {
    bg: "bg-card",
    border: "border-border",
    icon: "bg-primary",
    text: "text-text",
    muted: "text-text-muted",
  },
  labor: {
    bg: "bg-card",
    border: "border-border",
    icon: "bg-accent",
    text: "text-text",
    muted: "text-text-muted",
  },
  remaining: {
    bg: "bg-success-bg",
    border: "border-success-border",
    icon: "bg-success",
    text: "text-success",
    muted: "text-text-muted",
  },
  remainingNegative: {
    bg: "bg-danger-bg",
    border: "border-danger-border",
    icon: "bg-danger",
    text: "text-danger",
    muted: "text-text-muted",
  },
} as const;

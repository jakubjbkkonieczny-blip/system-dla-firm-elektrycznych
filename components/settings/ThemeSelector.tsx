"use client";

import { useTheme } from "@/components/ThemeProvider";
import type { UserTheme } from "@/lib/theme/types";
import { APP_BRANDING } from "@/lib/branding";
import { useState } from "react";

type ThemeOption = {
  id: UserTheme;
  label: string;
  description: string;
  preview: {
    bg: string;
    card: string;
    accent: string;
    primary: string;
  };
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "LIGHT_BUSINESS",
    label: "Light Business",
    description: "Klasyczny jasny interfejs biznesowy",
    preview: {
      bg: "#f5f6f8",
      card: "#ffffff",
      accent: "#e5e7eb",
      primary: "#111827",
    },
  },
  {
    id: "DARK_ELECTRIC",
    label: "Dark Electric",
    description: `Nowoczesny ciemny motyw ${APP_BRANDING.name}`,
    preview: {
      bg: "#070d18",
      card: "rgba(15, 23, 42, 0.7)",
      accent: "rgba(56, 189, 248, 0.35)",
      primary: "#fbbf24",
    },
  },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState<UserTheme | null>(null);

  async function onSelect(next: UserTheme) {
    if (next === theme || busy) return;
    setBusy(next);
    try {
      await setTheme(next);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {THEME_OPTIONS.map((option) => {
        const selected = theme === option.id;
        const isSaving = busy === option.id;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => void onSelect(option.id)}
            disabled={!!busy}
            className={[
              "relative text-left rounded-2xl border-2 p-4 transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              selected
                ? "border-accent bg-card-hover shadow-md"
                : "border-border bg-card hover:bg-card-hover hover:border-accent/50",
            ].join(" ")}
            aria-pressed={selected}
          >
            {selected ? (
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent text-xs font-medium px-2 py-0.5">
                <span aria-hidden="true">✓</span>
                Aktywny
              </span>
            ) : null}

            <div
              className="rounded-xl border overflow-hidden mb-3 h-24"
              style={{
                background: option.preview.bg,
                borderColor: option.preview.accent,
              }}
              aria-hidden="true"
            >
              <div className="p-2 flex gap-2 h-full">
                <div
                  className="w-1/3 rounded-md border h-full"
                  style={{
                    background: option.preview.card,
                    borderColor: option.preview.accent,
                  }}
                />
                <div className="flex-1 flex flex-col gap-1.5 pt-1">
                  <div
                    className="h-2 w-3/4 rounded-full opacity-60"
                    style={{ background: option.preview.accent }}
                  />
                  <div
                    className="h-2 w-1/2 rounded-full opacity-40"
                    style={{ background: option.preview.accent }}
                  />
                  <div
                    className="mt-auto h-5 w-16 rounded-md"
                    style={{ background: option.preview.primary }}
                  />
                </div>
              </div>
            </div>

            <div className="font-semibold text-text">{option.label}</div>
            <p className="text-sm text-text-muted mt-1">{option.description}</p>

            {isSaving ? (
              <p className="text-xs text-accent mt-2">Zapisywanie…</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

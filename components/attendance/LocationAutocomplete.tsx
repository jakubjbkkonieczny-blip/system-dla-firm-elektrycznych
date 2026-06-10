"use client";

import { apiFetch } from "@/lib/api";
import type { LocationSearchResponse } from "@/lib/location/types";
import { useCallback, useEffect, useId, useRef, useState } from "react";

const DEBOUNCE_MS = 450;
const MIN_QUERY_LEN = 3;

function LocationPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function LocationAutocomplete({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hint, setHint] = useState<string | null>(null);

  const closeList = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    try {
      const qs = new URLSearchParams({ q: query });
      const res = (await fetch(`/api/location-search?${qs.toString()}`, {
        credentials: "same-origin",
        signal: controller.signal,
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json?.error || `HTTP_${r.status}`);
        return json;
      })) as LocationSearchResponse;

      if (requestId !== requestIdRef.current) return;
      const labels = (res.suggestions ?? []).map((s) => s.label).slice(0, 5);
      setSuggestions(labels);
      setOpen(labels.length > 0);
      setActiveIndex(-1);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (requestId !== requestIdRef.current) return;
      setSuggestions([]);
      setOpen(false);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      abortRef.current?.abort();
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) closeList();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [closeList]);

  function selectSuggestion(label: string) {
    onChange(label);
    closeList();
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Escape") closeList();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeList();
    }
  }

  async function useMyLocation() {
    if (disabled || locating) return;
    setHint(null);

    if (!navigator.geolocation) {
      setHint("Twoja przeglądarka nie obsługuje lokalizacji.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const qs = new URLSearchParams({
            lat: String(pos.coords.latitude),
            lon: String(pos.coords.longitude),
          });
          const res = (await apiFetch(`/api/location-search?${qs.toString()}`)) as LocationSearchResponse;
          const label = res.suggestions?.[0]?.label;
          if (label) {
            onChange(label);
            setHint(null);
          } else {
            setHint("Nie udało się ustalić adresu dla tej lokalizacji.");
          }
        } catch {
          setHint("Nie udało się pobrać adresu. Spróbuj wpisać ręcznie.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setHint("Brak dostępu do lokalizacji. Wpisz adres ręcznie lub zezwól w przeglądarce.");
        } else {
          setHint("Nie udało się odczytać lokalizacji. Spróbuj ponownie lub wpisz adres ręcznie.");
        }
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 }
    );
  }

  const activeOptionId =
    activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div ref={rootRef} className="space-y-2">
      <label className="block text-sm">
        <span className="text-text-muted">Lokalizacja (opcjonalnie)</span>
        <div className="relative mt-1">
          <LocationPinIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            disabled={disabled}
            className="w-full min-h-[44px] border border-border rounded-lg pl-9 pr-3 py-2 bg-input text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
            placeholder="np. Warszawa, ul. Kopernika 6"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
          {loading && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
              …
            </span>
          )}
        </div>
      </label>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="border border-border rounded-lg bg-card shadow-sm overflow-hidden divide-y divide-border"
        >
          {suggestions.map((label, index) => (
            <li key={`${label}-${index}`} role="option" id={`${listId}-option-${index}`}>
              <button
                type="button"
                aria-selected={index === activeIndex}
                className={[
                  "w-full text-left px-3 py-2.5 text-sm text-text hover:bg-card-hover",
                  index === activeIndex ? "bg-card-hover" : "",
                ].join(" ")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(label)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={disabled || locating}
        onClick={() => void useMyLocation()}
        className="min-h-[44px] text-sm text-text border border-border rounded-lg px-3 py-2 w-full bg-card hover:bg-card-hover disabled:opacity-60"
      >
        {locating ? "Ustalanie lokalizacji…" : "Użyj mojej lokalizacji"}
      </button>

      {hint && <p className="text-xs text-warning bg-warning-bg border border-warning-border rounded-lg px-3 py-2">{hint}</p>}
      {!hint && value.trim().length > 0 && value.trim().length < MIN_QUERY_LEN && (
        <p className="text-xs text-text-muted">Wpisz co najmniej 3 znaki, aby zobaczyć podpowiedzi.</p>
      )}
    </div>
  );
}

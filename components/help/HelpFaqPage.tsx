"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqCategoryId, type FaqItem, type FaqRole } from "@/lib/help/faq-data";

const CONTACT_EMAIL = "jkvector.stystem@gmail.com";

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getVisibleRole(role: FaqRole | undefined, currentRole: "employer" | "employee" | null) {
  if (role === "all") return true;
  if (!currentRole) return false;
  return role === currentRole;
}

function rankFaqItem(item: FaqItem, search: string, currentRole: "employer" | "employee" | null) {
  const query = normalizeText(search);
  if (!query) return 0;

  const haystacks = [
    item.question,
    item.answer,
    item.categoryLabel,
    item.keywords.join(" "),
    item.synonyms.join(" "),
  ];

  const normalizedQuestion = normalizeText(item.question);
  const normalizedAnswer = normalizeText(item.answer);
  const normalizedCategory = normalizeText(item.categoryLabel);
  const normalizedKeywords = normalizeText(item.keywords.join(" "));
  const normalizedSynonyms = normalizeText(item.synonyms.join(" "));

  const score = haystacks.reduce((acc, value) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) return acc;
    if (normalizedValue === query) return acc + 100;
    if (normalizedValue.includes(query)) return acc + 45;
    if (normalizedQuestion.startsWith(query)) return acc + 35;
    if (normalizedKeywords.includes(query) || normalizedSynonyms.includes(query)) return acc + 25;
    if (normalizedCategory.includes(query)) return acc + 15;
    if (normalizedAnswer.includes(query)) return acc + 8;
    return acc;
  }, 0);

  if (!score) return -1;

  return score + item.popularity / 1000 + (item.question.toLowerCase().includes(query) ? 0.001 : 0);
}

export function HelpFaqPage({ currentRole }: { currentRole?: "employer" | "employee" | null }) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<FaqCategoryId | "all">("all");
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const effectiveRole = useMemo(() => {
    const paramRole = searchParams.get("role");
    if (paramRole === "employer" || paramRole === "employee") {
      return paramRole;
    }
    return currentRole ?? null;
  }, [currentRole, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");
    if (category) {
      const found = FAQ_CATEGORIES.find((entry) => entry.id === category);
      if (found) {
        setActiveCategory(found.id);
      }
    }
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim();
    const visibleItems = FAQ_ITEMS.filter((item) => item.roles.some((role) => getVisibleRole(role, effectiveRole)));

    if (!query && activeCategory === "all") {
      return visibleItems.sort((a, b) => b.popularity - a.popularity);
    }

    const scored = visibleItems
      .filter((item) => (activeCategory === "all" ? true : item.category === activeCategory))
      .map((item) => ({ item, score: rankFaqItem(item, query, effectiveRole) }))
      .filter((entry) => entry.score >= 0 && (query ? entry.score > 0 : true))
      .sort((a, b) => b.score - a.score || b.item.popularity - a.item.popularity);

    return scored.map((entry) => entry.item);
  }, [activeCategory, effectiveRole, search]);

  const popularItems = useMemo(() => {
    return FAQ_ITEMS.filter((item) => item.roles.some((role) => getVisibleRole(role, effectiveRole)))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 7);
  }, [effectiveRole]);

  const noResults = search.trim().length > 0 && filteredItems.length === 0;

  return (
    <div className="min-h-full bg-bg text-text">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-accent">Pomoc i FAQ</p>
            <h1 className="text-3xl font-semibold sm:text-4xl">Potrzebujesz odpowiedzi? Znajdź ją szybko.</h1>
            <p className="text-base leading-7 text-text-muted">
              Wspólna baza odpowiedzi dla pracodawców i pracowników. Szukaj po pytaniu, odpowiedzi, kategorii lub słowach kluczowych i przechodź bezpośrednio do konkretnych instrukcji.
            </p>
          </div>
        </header>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <label htmlFor="faq-search" className="mb-3 block text-sm font-medium text-text">
            Wyszukaj temat
          </label>
          <div className="relative">
            <input
              id="faq-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="np. czemu nie mogę się zalogować, jak dodać pracownika, płatności, PDF..."
              className="w-full rounded-2xl border border-border bg-input px-4 py-3 pr-12 text-base text-text outline-none ring-0 focus:border-accent"
            />
            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-text-muted">
              🔎
            </div>
          </div>

          {search.trim().length > 0 ? (
            <div className="mt-4 rounded-2xl border border-border bg-bg-secondary px-4 py-3 text-sm text-text-muted">
              {filteredItems.length > 0 ? (
                <span>Wyniki dla zapytania „{search}”</span>
              ) : (
                <span>Brak wyników. Spróbuj użyć prostszych słów lub przejdź do sekcji kontaktu.</span>
              )}
            </div>
          ) : null}

          {noResults ? (
            <div className="mt-4 rounded-2xl border border-danger-border bg-danger-bg p-4 text-sm text-danger">
              Nie znaleziono odpowiedzi. Jeśli nie możesz znaleźć rozwiązania, napisz do nas pod adres{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">
                {CONTACT_EMAIL}
              </a>
              .
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Najczęściej zadawane pytania</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {popularItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveCategory("all");
                  setSearch(item.question);
                }}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-accent hover:bg-card-hover"
              >
                <div className="text-sm font-medium text-text">{item.question}</div>
                <div className="mt-2 text-sm text-text-muted">{item.categoryLabel}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kategorie FAQ">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              aria-current={activeCategory === "all" ? "page" : undefined}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                activeCategory === "all"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-card text-text hover:border-accent"
              }`}
            >
              Wszystkie
            </button>
            {FAQ_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                aria-current={activeCategory === category.id ? "page" : undefined}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  activeCategory === category.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card text-text hover:border-accent"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredItems.map((item) => {
              const isOpen = Boolean(openItems[item.id]);
              return (
                <article key={item.id} className="rounded-2xl border border-border bg-card shadow-sm">
                  <h3>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${item.id}`}
                      onClick={() => setOpenItems((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                    >
                      <span className="text-base font-medium text-text">{item.question}</span>
                      <span className="text-xl text-text-muted">{isOpen ? "−" : "+"}</span>
                    </button>
                  </h3>
                  {isOpen ? (
                    <div id={`faq-panel-${item.id}`} className="border-t border-border px-4 py-4 text-sm leading-7 text-text-muted">
                      <p>{item.answer}</p>
                      {item.relatedLinks && item.relatedLinks.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.relatedLinks.map((link) => (
                            <Link key={link.href} href={link.href} className="rounded-full border border-border px-3 py-1 text-sm text-accent hover:bg-accent/10">
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl font-semibold">Nie znalazłeś odpowiedzi?</h2>
            <p className="text-base leading-7 text-text-muted">
              Napisz do nas i opisz swój problem. Wspieramy zarówno pracodawców, jak i pracowników, niezależnie od tego, czy korzystasz z desktopa, telefonu czy aplikacji PWA.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-accent/30 bg-accent/10 px-5 py-3 font-medium text-accent transition hover:bg-accent/15"
            >
              Skontaktuj się z nami
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

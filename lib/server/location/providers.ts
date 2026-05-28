import "server-only";
import type { LocationSuggestion } from "@/lib/location/types";

const MAX_SUGGESTIONS = 5;
const FETCH_TIMEOUT_MS = 6_000;

function withTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function uniqueLabels(items: LocationSuggestion[]): LocationSuggestion[] {
  const seen = new Set<string>();
  const out: LocationSuggestion[] = [];
  for (const item of items) {
    const key = item.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

function formatPhotonAddress(props: Record<string, unknown>): string | null {
  const street = [props.housenumber, props.street].filter(Boolean).join(" ").trim();
  const city = [props.postcode, props.city || props.town || props.village]
    .filter(Boolean)
    .join(" ")
    .trim();
  const parts = [street, city].filter((p) => typeof p === "string" && p.length > 0);
  if (parts.length === 0) {
    const name = typeof props.name === "string" ? props.name : "";
    return name.trim() || null;
  }
  return parts.join(", ");
}

async function searchPhoton(query: string): Promise<LocationSuggestion[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_SUGGESTIONS));
  url.searchParams.set("lang", "pl");

  const res = await withTimeout(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];

  const data = (await res.json().catch(() => null)) as {
    features?: { properties?: Record<string, unknown> }[];
  } | null;

  const items =
    data?.features?.map((f) => {
      const label = f.properties ? formatPhotonAddress(f.properties) : null;
      return label ? { label } : null;
    }) ?? [];

  return uniqueLabels(items.filter((x): x is LocationSuggestion => x != null));
}

async function reversePhoton(lat: number, lon: number): Promise<LocationSuggestion | null> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("lang", "pl");

  const res = await withTimeout(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as {
    features?: { properties?: Record<string, unknown> }[];
  } | null;

  const props = data?.features?.[0]?.properties;
  if (!props) return null;
  const label = formatPhotonAddress(props);
  return label ? { label } : null;
}

async function searchGeoapify(query: string, apiKey: string): Promise<LocationSuggestion[]> {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("limit", String(MAX_SUGGESTIONS));
  url.searchParams.set("lang", "pl");
  url.searchParams.set("format", "json");

  const res = await withTimeout(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) return [];

  const data = (await res.json().catch(() => null)) as {
    results?: { formatted?: string; address_line1?: string; address_line2?: string }[];
  } | null;

  const items =
    data?.results?.map((r) => {
      const label =
        (typeof r.formatted === "string" && r.formatted.trim()) ||
        [r.address_line1, r.address_line2].filter(Boolean).join(", ").trim() ||
        null;
      return label ? { label } : null;
    }) ?? [];

  return uniqueLabels(items.filter((x): x is LocationSuggestion => x != null));
}

async function reverseGeoapify(
  lat: number,
  lon: number,
  apiKey: string
): Promise<LocationSuggestion | null> {
  const url = new URL("https://api.geoapify.com/v1/geocode/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("lang", "pl");
  url.searchParams.set("format", "json");

  const res = await withTimeout(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as {
    results?: { formatted?: string; address_line1?: string; address_line2?: string }[];
  } | null;

  const r = data?.results?.[0];
  if (!r) return null;
  const label =
    (typeof r.formatted === "string" && r.formatted.trim()) ||
    [r.address_line1, r.address_line2].filter(Boolean).join(", ").trim() ||
    null;
  return label ? { label } : null;
}

export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();

  if (apiKey) {
    const primary = await searchGeoapify(query, apiKey);
    if (primary.length > 0) return primary;
  }

  return searchPhoton(query);
}

export async function reverseLocation(
  lat: number,
  lon: number
): Promise<LocationSuggestion | null> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();

  if (apiKey) {
    const primary = await reverseGeoapify(lat, lon, apiKey);
    if (primary) return primary;
  }

  return reversePhoton(lat, lon);
}

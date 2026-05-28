import "server-only";
import { getLocationCache, setLocationCache } from "@/lib/server/location/cache";
import { reverseLocation, searchLocations } from "@/lib/server/location/providers";
import type { LocationSuggestion } from "@/lib/location/types";

const MIN_QUERY_LEN = 3;
const MAX_QUERY_LEN = 120;

export function normalizeLocationQuery(raw: string): string | null {
  const q = raw.trim().replace(/\s+/g, " ");
  if (q.length < MIN_QUERY_LEN || q.length > MAX_QUERY_LEN) return null;
  return q;
}

export async function locationSearchByQuery(query: string): Promise<LocationSuggestion[]> {
  const normalized = normalizeLocationQuery(query);
  if (!normalized) return [];

  const cacheKey = `q:${normalized.toLowerCase()}`;
  const cached = getLocationCache<LocationSuggestion[]>(cacheKey);
  if (cached !== undefined) return cached;

  const suggestions = await searchLocations(normalized);
  setLocationCache(cacheKey, suggestions);
  return suggestions;
}

export async function locationReverseGeocode(
  lat: number,
  lon: number
): Promise<LocationSuggestion | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const roundedLat = Math.round(lat * 1e4) / 1e4;
  const roundedLon = Math.round(lon * 1e4) / 1e4;
  const cacheKey = `r:${roundedLat},${roundedLon}`;

  const cached = getLocationCache<LocationSuggestion | null>(cacheKey);
  if (cached !== undefined) return cached;

  const suggestion = await reverseLocation(roundedLat, roundedLon);
  setLocationCache(cacheKey, suggestion);
  return suggestion;
}

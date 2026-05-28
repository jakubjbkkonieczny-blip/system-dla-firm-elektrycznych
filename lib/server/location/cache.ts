import "server-only";

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 300;

type CacheEntry<T> = { at: number; value: T };

const store = new Map<string, CacheEntry<unknown>>();

export function getLocationCache<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setLocationCache<T>(key: string, value: T): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { at: Date.now(), value });
}

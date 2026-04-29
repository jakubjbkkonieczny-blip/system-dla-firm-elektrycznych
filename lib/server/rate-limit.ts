type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const LIMIT = 100;

const globalStore = globalThis as typeof globalThis & {
  __rateLimitStore?: Map<string, Bucket>;
};

const store = globalStore.__rateLimitStore ?? new Map<string, Bucket>();
globalStore.__rateLimitStore = store;

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = store.get(ip);

  if (current && now > current.resetAt) {
    store.delete(ip);
  }

  if (!current || now >= current.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  current.count += 1;
  store.set(ip, current);
  return { allowed: true, retryAfterSeconds: 0 };
}

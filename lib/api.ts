function isAuthSensitiveGet(path: string, method?: string): boolean {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  if (normalizedMethod !== "GET") return false;

  const pathname = path.split("?")[0] ?? path;
  if (pathname === "/api/auth/me") return true;
  if (pathname === "/api/me") return true;
  if (pathname === "/api/me/companies") return true;
  if (/^\/api\/companies\/[^/]+\/me$/.test(pathname)) return true;
  return false;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const cache = isAuthSensitiveGet(path, init?.method) ? "no-store" : init?.cache;

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache,
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error || `HTTP_${res.status}`;
    throw new Error(err);
  }
  return json;
}
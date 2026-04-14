export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error || `HTTP_${res.status}`;
    throw new Error(err);
  }
  return json;
}
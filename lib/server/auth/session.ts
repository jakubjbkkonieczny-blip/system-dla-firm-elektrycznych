import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "__session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }
  return "dev-only-insecure-session-secret-min-32-chars";
}

/**
 * payload JSON → HMAC-SHA256 → opaque base64url token (not a raw user id).
 */
export function createSignedSessionToken(userId: string): string {
  const payload = JSON.stringify({ userId });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", getSessionSecret()).update(payload, "utf8").digest("base64url");
  const inner = `${payloadB64}.${sig}`;
  return Buffer.from(inner, "utf8").toString("base64url");
}

export function verifySignedSessionToken(token: string): { userId: string } | null {
  try {
    const inner = Buffer.from(token, "base64url").toString("utf8");
    const dot = inner.indexOf(".");
    if (dot === -1) return null;
    const payloadB64 = inner.slice(0, dot);
    const sig = inner.slice(dot + 1);
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expectedSig = createHmac("sha256", getSessionSecret()).update(payload, "utf8").digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(payload) as { userId?: unknown };
    if (typeof data.userId !== "string" || data.userId.length === 0) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, sessionToken: string): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}

export async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

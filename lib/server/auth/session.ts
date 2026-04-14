import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "__session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 days

export async function createSessionCookie(idToken: string): Promise<string> {
  const { auth } = await import("@/lib/firebase/admin");
  return auth.createSessionCookie(idToken, {
    expiresIn: SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
  });
}

export function setSessionCookie(
  res: NextResponse,
  sessionCookie: string
): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionCookie,
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

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const DEACTIVATED_ACCESS_COOKIE_NAME = "deactivated_access";
export const DEACTIVATED_ACCESS_MAX_AGE_SECONDS = 60 * 60; // 1 hour
export const DEACTIVATED_ACCESS_PURPOSE = "DEACTIVATED_ACCOUNT_ACCESS" as const;

export type DeactivatedAccessClaims = {
  userId: string;
  companyId: string;
  sessionVersion: number;
  exp: number;
};

type DeactivatedAccessPayload = {
  purpose: typeof DEACTIVATED_ACCESS_PURPOSE;
  userId: string;
  companyId: string;
  /** Bound to User.sessionVersion at mint time — invalid after recover/deactivate bumps. */
  sessionVersion: number;
  exp: number;
};

export type CreateDeactivatedAccessTokenInput = {
  userId: string;
  companyId: string;
  sessionVersion: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return secret;
}

/**
 * Short-lived HMAC recovery capability — not a general session.
 * Bound to User.id + companyId + sessionVersion; route handlers still enforce deactivated state.
 */
export function createDeactivatedAccessToken(
  input: CreateDeactivatedAccessTokenInput
): string {
  const userId = input.userId?.trim() ?? "";
  const companyId = input.companyId?.trim() ?? "";
  if (!userId || !companyId) {
    throw new Error("INVALID_DEACTIVATED_ACCESS_CLAIMS");
  }
  if (!Number.isInteger(input.sessionVersion) || input.sessionVersion < 0) {
    throw new Error("INVALID_DEACTIVATED_ACCESS_CLAIMS");
  }

  const exp = Math.floor(Date.now() / 1000) + DEACTIVATED_ACCESS_MAX_AGE_SECONDS;
  const payload: DeactivatedAccessPayload = {
    purpose: DEACTIVATED_ACCESS_PURPOSE,
    userId,
    companyId,
    sessionVersion: input.sessionVersion,
    exp,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  const sig = createHmac("sha256", getSessionSecret()).update(payloadJson, "utf8").digest("base64url");
  const inner = `${payloadB64}.${sig}`;
  return Buffer.from(inner, "utf8").toString("base64url");
}

export function verifyDeactivatedAccessToken(
  token: string
): DeactivatedAccessClaims | null {
  try {
    const inner = Buffer.from(token, "base64url").toString("utf8");
    const dot = inner.indexOf(".");
    if (dot === -1) return null;

    const payloadB64 = inner.slice(0, dot);
    const sig = inner.slice(dot + 1);
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expectedSig = createHmac("sha256", getSessionSecret())
      .update(payloadJson, "utf8")
      .digest("base64url");

    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const data = JSON.parse(payloadJson) as Partial<DeactivatedAccessPayload>;
    if (data.purpose !== DEACTIVATED_ACCESS_PURPOSE) return null;
    if (typeof data.userId !== "string" || data.userId.length === 0) return null;
    if (typeof data.companyId !== "string" || data.companyId.length === 0) return null;
    if (
      typeof data.sessionVersion !== "number" ||
      !Number.isInteger(data.sessionVersion) ||
      data.sessionVersion < 0
    ) {
      return null;
    }
    if (typeof data.exp !== "number" || !Number.isFinite(data.exp)) return null;
    if (Math.floor(Date.now() / 1000) >= data.exp) return null;

    return {
      userId: data.userId,
      companyId: data.companyId,
      sessionVersion: data.sessionVersion,
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

export function setDeactivatedAccessCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set({
    name: DEACTIVATED_ACCESS_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEACTIVATED_ACCESS_MAX_AGE_SECONDS,
  });
  return res;
}

export function clearDeactivatedAccessCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: DEACTIVATED_ACCESS_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function getDeactivatedAccessCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(DEACTIVATED_ACCESS_COOKIE_NAME)?.value ?? null;
}

export async function getVerifiedDeactivatedAccess(): Promise<DeactivatedAccessClaims | null> {
  const cookie = await getDeactivatedAccessCookie();
  if (!cookie) return null;
  return verifyDeactivatedAccessToken(cookie);
}

/** @deprecated Prefer getVerifiedDeactivatedAccess for company/session binding. */
export async function getDeactivatedAccessUserId(): Promise<string | null> {
  const claims = await getVerifiedDeactivatedAccess();
  return claims?.userId ?? null;
}

/** Narrow proxy allowlist — recovery surface only, not a general session bypass. */
export function isDeactivatedRecoveryApiPath(pathname: string): boolean {
  return (
    pathname === "/api/deactivation/account-status" ||
    pathname === "/api/deactivation/recover" ||
    pathname === "/api/deactivation/access/logout"
  );
}

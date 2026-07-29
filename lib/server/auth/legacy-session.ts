/**
 * Legacy HMAC cookie session resolution (pre-Supabase Auth cutover).
 * Used only when SUPABASE_AUTH_ENABLED is not exactly "true".
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  getSessionCookie,
  verifySignedSessionToken,
} from "@/lib/server/auth/session";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  accountRole: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Reads the legacy session cookie, verifies HMAC signature, loads the user from Prisma.
 */
export async function getUserFromLegacySession(): Promise<SessionUser | null> {
  const cookie = await getSessionCookie();
  if (!cookie) return null;

  const verified = verifySignedSessionToken(cookie);
  if (!verified) return null;

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      accountRole: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      sessionVersion: true,
    },
  });

  if (!user || !user.isActive) return null;
  if (user.sessionVersion !== verified.sessionVersion) return null;
  return user;
}

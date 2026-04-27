import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getSessionCookie, verifySignedSessionToken } from "@/lib/server/auth/session";

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
 * Reads the session cookie, verifies HMAC signature, loads the user from Prisma.
 */
export async function getUserFromSession(): Promise<SessionUser | null> {
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
    },
  });

  if (!user || !user.isActive) return null;
  return user;
}

/** Throws `MISSING_AUTH` when the session cookie is missing or invalid. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getUserFromSession();
  if (!user) throw new Error("MISSING_AUTH");
  return user;
}

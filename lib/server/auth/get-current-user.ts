import "server-only";
import { auth } from "@/lib/firebase/admin";
import { getSessionCookie } from "@/lib/server/auth/session";
import type { DecodedIdToken } from "@/lib/firebase/admin";

export async function getCurrentUser(): Promise<DecodedIdToken | null> {
  const sessionCookie = await getSessionCookie();
  if (!sessionCookie) {
    return null;
  }

  try {
    return await auth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

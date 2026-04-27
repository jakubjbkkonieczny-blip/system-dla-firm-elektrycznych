import "server-only";
import { getUserFromSession } from "@/lib/server/auth/getUserFromSession";
import type { AuthContextUser } from "@/lib/server/auth/types";

export async function getCurrentUser(): Promise<AuthContextUser | null> {
  const user = await getUserFromSession();
  if (!user) return null;

  return {
    id: user.id,
    uid: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

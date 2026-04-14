import "server-only";
import { getCurrentUser } from "@/lib/server/auth/get-current-user";

export async function requireAuthUid(_req?: unknown): Promise<string> {
  const user = await getCurrentUser();
  if (!user?.uid) {
    throw new Error("MISSING_AUTH");
  }
  return user.uid;
}
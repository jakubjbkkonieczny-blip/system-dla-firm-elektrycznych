/**
 * Mint a narrowly scoped deactivated-access capability for recoverable employers.
 * Does not reactivate the account. Does not create a general session.
 */

import { prisma } from "@/lib/db/prisma";
import {
  createDeactivatedAccessToken,
  type CreateDeactivatedAccessTokenInput,
} from "./deactivated-account-access";
import { resolveDeactivatedEmployerAccountState } from "./get-deactivated-account-state";

export type MintDeactivatedAccessResult =
  | { ok: true; token: string; claims: CreateDeactivatedAccessTokenInput }
  | { ok: false; reason: "NOT_RECOVERABLE" | "USER_NOT_FOUND" };

export async function mintDeactivatedAccessForUser(
  userId: string
): Promise<MintDeactivatedAccessResult> {
  const state = await resolveDeactivatedEmployerAccountState(userId);
  if (!state || !state.isRecoverable) {
    return { ok: false, reason: "NOT_RECOVERABLE" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, sessionVersion: true, isActive: true },
  });
  if (!user || user.isActive) {
    return { ok: false, reason: "NOT_RECOVERABLE" };
  }

  const claims: CreateDeactivatedAccessTokenInput = {
    userId: user.id,
    companyId: state.companyId,
    sessionVersion: user.sessionVersion,
  };

  return {
    ok: true,
    token: createDeactivatedAccessToken(claims),
    claims,
  };
}

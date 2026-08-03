/**
 * Production Auth rollback inventory + conditional unlink/delete semantics.
 *
 * Rollback itself requires explicit confirmation and must NOT run in Stage 4G-B.
 *
 * Safe sequence for migration-created mappings only:
 * 1. If User.supabaseAuthUserId still equals the Auth UUID created by that entry → set NULL
 * 2. Delete ONLY the corresponding migration-created Auth user
 *
 * Never delete business User.
 * Never delete unrelated / pre-existing Auth identities.
 */

import { createHash, randomBytes } from "node:crypto";

import type { AuthAdminPort, BusinessDbPort } from "@/lib/supabase/auth-migration/types";
import { assertSafeReportPayload } from "@/lib/supabase/auth-migration/report";

export type ProductionRollbackEntry = {
  businessUserId: string;
  emailMasked: string;
  emailFingerprint: string | null;
  classification: string;
  previousSupabaseAuthUserId: string | null;
  createdAuthUserId: string;
  result: string;
  rollbackState: "pending" | "unlinked" | "auth_deleted" | "skipped_mismatch" | "failed";
};

export type ProductionRollbackInventory = {
  stage: "4G-B-auth-rollback";
  batchId: string;
  createdAt: string;
  entries: ProductionRollbackEntry[];
  guidance: string[];
};

export function newProductionAuthBatchId(): string {
  return `4h-auth-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
}

export function emailFingerprint(normalizedEmail: string | null): string | null {
  if (!normalizedEmail) return null;
  return createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 16);
}

export function emptyProductionRollbackInventory(
  batchId: string
): ProductionRollbackInventory {
  return {
    stage: "4G-B-auth-rollback",
    batchId,
    createdAt: new Date().toISOString(),
    entries: [],
    guidance: [
      "Never delete business User rows as part of Auth rollback.",
      "Conditionally unlink User.supabaseAuthUserId only when it still equals the migration-created Auth UUID.",
      "Then Admin-delete ONLY Auth users listed as created by this batch.",
      "Do not delete Auth identities that existed before the batch.",
      "Rollback requires --confirm-rollback and --confirm-production-project-ref; do not run during Stage 4G-B.",
    ],
  };
}

export function appendRollbackEntry(
  inventory: ProductionRollbackInventory,
  entry: Omit<ProductionRollbackEntry, "rollbackState"> & {
    rollbackState?: ProductionRollbackEntry["rollbackState"];
  }
): void {
  inventory.entries.push({
    ...entry,
    rollbackState: entry.rollbackState ?? "pending",
  });
}

/**
 * Execute rollback for a previously written inventory.
 * Requires explicit confirmRollback=true from the caller/CLI.
 */
export async function executeProductionAuthRollback(input: {
  inventory: ProductionRollbackInventory;
  confirmRollback: boolean;
  authAdmin: AuthAdminPort;
  businessDb: BusinessDbPort;
}): Promise<ProductionRollbackInventory> {
  if (!input.confirmRollback) {
    throw new Error(
      "Refusing Auth rollback without explicit --confirm-rollback"
    );
  }

  const out: ProductionRollbackInventory = {
    ...input.inventory,
    entries: input.inventory.entries.map((e) => ({ ...e })),
  };

  for (const entry of out.entries) {
    try {
      const user = await input.businessDb.findUserById(entry.businessUserId);
      if (!user) {
        entry.rollbackState = "failed";
        entry.result = "BUSINESS_USER_MISSING";
        continue;
      }

      if (user.supabaseAuthUserId === entry.createdAuthUserId) {
        await input.businessDb.unlinkUser(entry.businessUserId);
        entry.rollbackState = "unlinked";
      } else if (user.supabaseAuthUserId == null) {
        entry.rollbackState = "unlinked";
        entry.result = `${entry.result}|already_unlinked`;
      } else {
        entry.rollbackState = "skipped_mismatch";
        entry.result = `${entry.result}|mapping_mismatch_not_unlinked`;
        // Do not delete Auth user if mapping no longer matches migration entry.
        continue;
      }

      await input.authAdmin.deleteUser(entry.createdAuthUserId);
      entry.rollbackState = "auth_deleted";
    } catch (error) {
      entry.rollbackState = "failed";
      entry.result = `${entry.result}|${
        error instanceof Error ? error.message : "rollback_failed"
      }`;
    }
  }

  assertSafeReportPayload(out);
  return out;
}

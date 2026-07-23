import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  resolveManualSelfDelete,
  WORKER_SELF_DELETE_NOT_ALLOWED,
  USE_DEACTIVATION_FINAL_ENDPOINT,
} from "../server/me/self-delete-guard";
import {
  deriveWorkerMembershipState,
  resolvePendingDeletionAt,
} from "../server/workers/worker-membership-state";

describe("manual self-delete guard", () => {
  it("blocks worker DELETE /api/me with controlled 403", () => {
    const decision = resolveManualSelfDelete("worker");

    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 403);
    assert.equal(decision.error, WORKER_SELF_DELETE_NOT_ALLOWED);
  });

  it("blocks employer legacy DELETE /api/me with dedicated deactivation response", () => {
    const decision = resolveManualSelfDelete("employer");

    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 403);
    assert.equal(decision.error, USE_DEACTIVATION_FINAL_ENDPOINT);
  });

  it("blocks unknown account roles from manual self-delete", () => {
    const decision = resolveManualSelfDelete(null);

    assert.equal(decision.error, WORKER_SELF_DELETE_NOT_ALLOWED);
  });
});

describe("legacy self-delete route guards", () => {
  it("DELETE /api/me does not mutate users and blocks worker self-delete", async () => {
    const source = await readFile("app/api/me/route.ts", "utf8");

    assert.match(source, /resolveManualSelfDelete/);
    assert.match(source, /WORKER_SELF_DELETE_NOT_ALLOWED|resolveManualSelfDelete/);
    assert.doesNotMatch(source, /prisma\.user\.update/);
    assert.doesNotMatch(source, /deactivatedAt/);
    assert.doesNotMatch(source, /pendingDeletionAt/);
    assert.doesNotMatch(source, /syncWorkerOrphanState/);
  });

  it("DELETE /api/me/display-name blocks manual self-deactivation bypass", async () => {
    const source = await readFile("app/api/me/display-name/route.ts", "utf8");

    assert.match(source, /resolveManualSelfDelete/);
    assert.doesNotMatch(source, /isActive:\s*false/);
  });

  it("employer legacy DELETE still cannot bypass dedicated deactivation flow", async () => {
    const source = await readFile("app/api/me/route.ts", "utf8");
    assert.match(source, /resolveManualSelfDelete/);
    assert.doesNotMatch(source, /deactivateEmployerAccount/);
    assert.equal(resolveManualSelfDelete("employer").error, USE_DEACTIVATION_FINAL_ENDPOINT);
  });
});

describe("worker settings UI", () => {
  it("does not expose manual delete account action for workers", async () => {
    const source = await readFile("app/settings/page.tsx", "utf8");

    assert.doesNotMatch(source, /role === "worker"[\s\S]*Usuń konto/);
    assert.doesNotMatch(source, /deleteOpen/);
    assert.doesNotMatch(source, /deleteConfirm/);
    assert.doesNotMatch(source, /deleteAccount/);
    assert.match(source, /Usuń konto i firmę/);
  });
});

describe("worker orphan lifecycle remains unchanged", () => {
  const fixedNow = new Date("2026-01-01T12:00:00.000Z");

  it("uses a 24 hour orphan grace period before tombstone", async () => {
    const source = await readFile("lib/server/workers/worker-lifecycle.ts", "utf8");
    assert.match(source, /ORPHAN_CLEANUP_MS = 24 \* 60 \* 60 \* 1000/);
    assert.match(source, /pendingDeletionAt > 24h/);
  });

  it("worker removed from last company enters ORPHAN with pendingDeletionAt", () => {
    const state = deriveWorkerMembershipState(0, 0);
    const pendingDeletionAt = resolvePendingDeletionAt(state, fixedNow);

    assert.equal(state, "ORPHAN");
    assert.equal(pendingDeletionAt, fixedNow);
  });

  it("worker with another active company remains ACTIVE", () => {
    const state = deriveWorkerMembershipState(1, 2);
    const pendingDeletionAt = resolvePendingDeletionAt(state, fixedNow);

    assert.equal(state, "ACTIVE");
    assert.equal(pendingDeletionAt, null);
  });

  it("does not invoke worker lifecycle from manual self-delete guard", async () => {
    const meRoute = await readFile("app/api/me/route.ts", "utf8");
    assert.doesNotMatch(meRoute, /syncWorkerOrphanState/);
    assert.equal(resolveManualSelfDelete("worker").error, WORKER_SELF_DELETE_NOT_ALLOWED);
  });
});

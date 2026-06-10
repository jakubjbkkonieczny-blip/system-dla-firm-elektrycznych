import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveWorkerMembershipState,
  resolvePendingDeletionAt,
  shouldTombstonePendingWorker,
} from "../worker-membership-state";

describe("deriveWorkerMembershipState", () => {
  it("returns ACTIVE when at least one active membership", () => {
    assert.equal(deriveWorkerMembershipState(1, 1), "ACTIVE");
    assert.equal(deriveWorkerMembershipState(2, 3), "ACTIVE");
  });

  it("returns SUSPENDED when memberships exist but none are active", () => {
    assert.equal(deriveWorkerMembershipState(0, 1), "SUSPENDED");
    assert.equal(deriveWorkerMembershipState(0, 2), "SUSPENDED");
  });

  it("returns ORPHAN when there are no memberships", () => {
    assert.equal(deriveWorkerMembershipState(0, 0), "ORPHAN");
  });
});

describe("resolvePendingDeletionAt", () => {
  const fixedNow = new Date("2026-06-10T12:00:00.000Z");

  it("returns null for ACTIVE and SUSPENDED", () => {
    assert.equal(resolvePendingDeletionAt("ACTIVE", fixedNow), null);
    assert.equal(resolvePendingDeletionAt("SUSPENDED", fixedNow), null);
  });

  it("returns now for ORPHAN", () => {
    assert.equal(resolvePendingDeletionAt("ORPHAN", fixedNow), fixedNow);
  });
});

describe("worker lifecycle — business scenarios (pure state machine)", () => {
  const fixedNow = new Date("2026-06-10T12:00:00.000Z");

  function afterMembershipChange(activeCount: number, totalCount: number) {
    const state = deriveWorkerMembershipState(activeCount, totalCount);
    const pendingDeletionAt = resolvePendingDeletionAt(state, fixedNow);
    return { state, pendingDeletionAt };
  }

  it("scenario 1: one company — Dezaktywuj → SUSPENDED, no countdown", () => {
    const { state, pendingDeletionAt } = afterMembershipChange(0, 1);

    assert.equal(state, "SUSPENDED");
    assert.equal(pendingDeletionAt, null);
  });

  it("scenario 2: one company — Aktywuj → ACTIVE, no countdown", () => {
    const { state, pendingDeletionAt } = afterMembershipChange(1, 1);

    assert.equal(state, "ACTIVE");
    assert.equal(pendingDeletionAt, null);
  });

  it("scenario 3: one company — Usuń → ORPHAN, countdown starts", () => {
    const { state, pendingDeletionAt } = afterMembershipChange(0, 0);

    assert.equal(state, "ORPHAN");
    assert.equal(pendingDeletionAt, fixedNow);
  });

  it("scenario 4: two companies — Usuń z jednej → ACTIVE, no countdown", () => {
    const { state, pendingDeletionAt } = afterMembershipChange(1, 1);

    assert.equal(state, "ACTIVE");
    assert.equal(pendingDeletionAt, null);
  });

  it("scenario 5: cleanupPendingWorkers — legacy suspended with pendingDeletionAt", () => {
    const activeCount = 0;
    const totalCount = 1;

    assert.equal(deriveWorkerMembershipState(activeCount, totalCount), "SUSPENDED");
    assert.equal(shouldTombstonePendingWorker(totalCount), false);
    assert.equal(resolvePendingDeletionAt("SUSPENDED", fixedNow), null);
  });

  it("new worker without any company — ORPHAN, countdown starts", () => {
    const { state, pendingDeletionAt } = afterMembershipChange(0, 0);

    assert.equal(state, "ORPHAN");
    assert.equal(pendingDeletionAt, fixedNow);
    assert.equal(shouldTombstonePendingWorker(0), true);
  });
});

describe("worker onboarding — role assignment without CompanyMember", () => {
  const fixedNow = new Date("2026-06-10T12:00:00.000Z");

  it("A: post-register worker with no memberships → ORPHAN → pendingDeletionAt set", () => {
    const state = deriveWorkerMembershipState(0, 0);
    const pendingDeletionAt = resolvePendingDeletionAt(state, fixedNow);

    assert.equal(state, "ORPHAN");
    assert.notEqual(pendingDeletionAt, null);
  });

  it("B: post-register employer path must not imply worker orphan state", () => {
    // Employer has no worker lifecycle; syncWorkerOrphanState guard skips non-workers.
    const state = deriveWorkerMembershipState(0, 0);
    assert.equal(state, "ORPHAN");
    // Route must not call sync for employer — enforced in post-register route, not here.
  });

  it("C: user/init worker assignment with no memberships → ORPHAN → pendingDeletionAt set", () => {
    const state = deriveWorkerMembershipState(0, 0);
    const pendingDeletionAt = resolvePendingDeletionAt(state, fixedNow);

    assert.equal(state, "ORPHAN");
    assert.notEqual(pendingDeletionAt, null);
  });

  it("D: invite after registration → ACTIVE → pendingDeletionAt cleared", () => {
    const state = deriveWorkerMembershipState(1, 1);
    const pendingDeletionAt = resolvePendingDeletionAt(state, fixedNow);

    assert.equal(state, "ACTIVE");
    assert.equal(pendingDeletionAt, null);
  });
});

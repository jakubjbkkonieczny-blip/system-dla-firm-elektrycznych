import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getRecoveryDeadline, isPermanentDeletionPending, isRecoverable } from "../lifecycle";

describe("employer deactivation lifecycle", () => {
  const deactivatedAt = new Date("2025-06-15T00:00:00.000Z");

  it("computes a 12-month recovery deadline", () => {
    const deadline = getRecoveryDeadline(deactivatedAt, 12);
    assert.equal(deadline.toISOString(), "2026-06-15T00:00:00.000Z");
  });

  it("treats scheduledDeletionAt as recoverable deadline when the account is inactive", () => {
    const future = new Date("2026-06-14T23:59:59.999Z");
    const deadline = getRecoveryDeadline(deactivatedAt, 12);

    assert.equal(isRecoverable(false, deactivatedAt, deadline, future), true);
  });

  it("does not treat active accounts as recoverable", () => {
    const deadline = getRecoveryDeadline(deactivatedAt, 12);
    assert.equal(isRecoverable(true, deactivatedAt, deadline), false);
  });

  it("does not treat a deactivated account as recoverable without a scheduled deletion deadline", () => {
    assert.equal(isRecoverable(false, deactivatedAt, null), false);
  });

  it("marks permanent deletion pending when now is at or after the deadline", () => {
    const deadline = getRecoveryDeadline(deactivatedAt, 12);
    assert.equal(isPermanentDeletionPending(false, deadline, deadline), true);
    assert.equal(
      isPermanentDeletionPending(false, deadline, new Date(deadline.getTime() + 1)),
      true
    );
  });
});

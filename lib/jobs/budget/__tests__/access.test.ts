import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Access policy tests — mirrors requireOwnerOrAdmin / requireBudgetAdmin behavior.
 * Workers (staff) must be blocked; owners and admins allowed.
 */
function canAccessBudget(role: string): boolean {
  return role === "owner" || role === "admin";
}

describe("budget access control", () => {
  it("allows owner access", () => {
    assert.equal(canAccessBudget("owner"), true);
  });

  it("allows admin access", () => {
    assert.equal(canAccessBudget("admin"), true);
  });

  it("blocks worker (staff) access", () => {
    assert.equal(canAccessBudget("staff"), false);
  });
});

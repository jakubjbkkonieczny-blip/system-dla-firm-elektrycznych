import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveAppShellRoleState } from "../appShellRole";
import {
  buildRoleContextKey,
  fetchOutcomeForIdentityChange,
  resolveRoleFetchError,
  resolveRoleFetchResponse,
  shouldApplyRoleFetchResult,
} from "../appShellRoleContext";

describe("AppShell role context identity", () => {
  it("builds a role context key from user id and company id", () => {
    assert.equal(buildRoleContextKey("user-a", "company-x"), "user-a:company-x");
    assert.equal(buildRoleContextKey("user-b", "company-x"), "user-b:company-x");
  });

  it("requires matching keys before applying async role responses", () => {
    assert.equal(
      shouldApplyRoleFetchResult("user-a:company-x", "user-a:company-x"),
      true
    );
    assert.equal(
      shouldApplyRoleFetchResult("user-a:company-x", "user-b:company-x"),
      false
    );
    assert.equal(
      shouldApplyRoleFetchResult("user-a:company-x", "user-a:company-y"),
      false
    );
  });

  it("resets to loading when company context is not ready after user switch", () => {
    assert.deepEqual(
      fetchOutcomeForIdentityChange({
        isAuthed: true,
        hideShell: false,
        companyId: "company-x",
        companyReady: false,
      }),
      { status: "loading" }
    );
  });

  it("does not keep owner outcome visible while company context reloads", () => {
    const duringSwitch = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "company-x",
      companyReady: false,
      fetchOutcome: { status: "success", role: "owner" },
    });

    assert.equal(duringSwitch.roleLoaded, false);
    assert.equal(duringSwitch.isOwnerOrAdmin, false);
    assert.equal(duringSwitch.roleLabel, "");
    assert.notEqual(duringSwitch.roleLabel, "Właściciel");
  });

  it("Owner A → Worker B: old owner role cannot survive user switch", () => {
    const ownerKey = buildRoleContextKey("owner-a", "company-x");
    const workerKey = buildRoleContextKey("worker-b", "company-x");

    const staleOwnerResponse = resolveRoleFetchResponse({
      requestKey: ownerKey,
      currentKey: workerKey,
      role: "owner",
    });

    assert.equal(staleOwnerResponse.kind, "stale");

    const workerState = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "company-x",
      companyReady: true,
      fetchOutcome: { status: "success", role: "staff" },
    });

    assert.equal(workerState.role, "staff");
    assert.equal(workerState.roleLabel, "Pracownik");
    assert.equal(workerState.isOwnerOrAdmin, false);
  });

  it("Worker B → Owner A: old staff role cannot survive user switch", () => {
    const workerKey = buildRoleContextKey("worker-b", "company-y");
    const ownerKey = buildRoleContextKey("owner-a", "company-y");

    const staleStaffResponse = resolveRoleFetchResponse({
      requestKey: workerKey,
      currentKey: ownerKey,
      role: "staff",
    });

    assert.equal(staleStaffResponse.kind, "stale");

    const ownerState = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "company-y",
      companyReady: true,
      fetchOutcome: { status: "success", role: "owner" },
    });

    assert.equal(ownerState.roleLabel, "Właściciel");
    assert.equal(ownerState.isOwnerOrAdmin, true);
  });

  it("same company X resolves staff for Worker B after Owner A", () => {
    const ownerResponse = resolveRoleFetchResponse({
      requestKey: buildRoleContextKey("owner-a", "company-x"),
      currentKey: buildRoleContextKey("worker-b", "company-x"),
      role: "owner",
    });
    assert.equal(ownerResponse.kind, "stale");

    const workerResponse = resolveRoleFetchResponse({
      requestKey: buildRoleContextKey("worker-b", "company-x"),
      currentKey: buildRoleContextKey("worker-b", "company-x"),
      role: "staff",
    });

    assert.deepEqual(workerResponse, {
      kind: "applied",
      outcome: { status: "success", role: "staff" },
    });
  });

  it("ignores stale success response that arrives after identity changed", () => {
    const resolved = resolveRoleFetchResponse({
      requestKey: buildRoleContextKey("owner-a", "company-a"),
      currentKey: buildRoleContextKey("worker-b", "company-b"),
      role: "owner",
    });

    assert.equal(resolved.kind, "stale");
  });

  it("ignores stale error response that arrives after identity changed", () => {
    const resolved = resolveRoleFetchError({
      requestKey: buildRoleContextKey("owner-a", "company-a"),
      currentKey: buildRoleContextKey("worker-b", "company-b"),
    });

    assert.equal(resolved.kind, "stale");
  });

  it("invalid company lookup does not become staff fallback", () => {
    const resolved = resolveRoleFetchResponse({
      requestKey: buildRoleContextKey("worker-b", "company-b"),
      currentKey: buildRoleContextKey("worker-b", "company-b"),
      role: "employer",
    });

    assert.deepEqual(resolved, {
      kind: "applied",
      outcome: { status: "error" },
    });

    const state = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "company-b",
      companyReady: true,
      fetchOutcome: { status: "error" },
    });

    assert.equal(state.role, null);
    assert.notEqual(state.roleLabel, "Pracownik");
    assert.equal(state.roleLabel, "Brak aktywnej firmy");
  });

  it("no active company renders neutral no-company state", () => {
    const state = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "",
      companyReady: true,
      fetchOutcome: { status: "no_company" },
    });

    assert.equal(state.roleLabel, "Brak aktywnej firmy");
    assert.equal(state.isOwnerOrAdmin, false);
    assert.notEqual(state.roleLabel, "Właściciel");
  });
});

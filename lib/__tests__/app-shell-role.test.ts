import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveAppShellRoleState,
  parseCompanyRole,
} from "../appShellRole";

describe("AppShell company role handling", () => {
  it("does not fabricate staff when company lookup fails", () => {
    const state = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "stale-company",
      companyReady: true,
      fetchOutcome: { status: "error" },
    });

    assert.equal(state.role, null);
    assert.equal(state.roleLoaded, true);
    assert.equal(state.shouldClearActiveCompany, true);
    assert.equal(state.isOwnerOrAdmin, false);
    assert.equal(state.roleLabel, "Brak aktywnej firmy");
  });

  it("does not represent employer-like account as worker when no validated company exists", () => {
    const state = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "",
      companyReady: true,
      fetchOutcome: { status: "no_company" },
    });

    assert.equal(state.role, null);
    assert.equal(state.isOwnerOrAdmin, false);
    assert.notEqual(state.roleLabel, "Pracownik");
  });

  it("keeps valid owner/admin/staff behavior unchanged", () => {
    const owner = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "company-a",
      companyReady: true,
      fetchOutcome: { status: "success", role: "owner" },
    });
    const admin = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "company-a",
      companyReady: true,
      fetchOutcome: { status: "success", role: "admin" },
    });
    const staff = deriveAppShellRoleState({
      isAuthed: true,
      hideShell: false,
      companyId: "company-a",
      companyReady: true,
      fetchOutcome: { status: "success", role: "staff" },
    });

    assert.equal(owner.role, "owner");
    assert.equal(owner.isOwnerOrAdmin, true);
    assert.equal(owner.roleLabel, "Właściciel");

    assert.equal(admin.role, "admin");
    assert.equal(admin.isOwnerOrAdmin, true);
    assert.equal(admin.roleLabel, "Administrator");

    assert.equal(staff.role, "staff");
    assert.equal(staff.isOwnerOrAdmin, false);
    assert.equal(staff.roleLabel, "Pracownik");
  });

  it("rejects unknown roles from company lookup responses", () => {
    assert.equal(parseCompanyRole("owner"), "owner");
    assert.equal(parseCompanyRole("admin"), "admin");
    assert.equal(parseCompanyRole("staff"), "staff");
    assert.equal(parseCompanyRole("employer"), null);
    assert.equal(parseCompanyRole(undefined), null);
  });
});

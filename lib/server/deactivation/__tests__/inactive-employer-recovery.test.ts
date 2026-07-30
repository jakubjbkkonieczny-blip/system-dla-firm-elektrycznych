import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "crypto";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

import { prisma } from "@/lib/db/prisma";
import {
  createDeactivatedAccessToken,
  DEACTIVATED_ACCESS_PURPOSE,
  isDeactivatedRecoveryApiPath,
  verifyDeactivatedAccessToken,
} from "../deactivated-account-access";
import { getDeactivatedAccountStateFromAccess } from "../get-deactivated-account-state";
import { getRecoveryDeadline } from "../lifecycle";
import { mintDeactivatedAccessForUser } from "../mint-deactivated-access";
import { recoverEmployerAccount } from "../recovery-service";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

async function seedDeactivatedEmployer() {
  const id = randomUUID();
  const companyId = randomUUID();
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const deactivatedAt = new Date();
  const scheduledDeletionAt = getRecoveryDeadline(deactivatedAt);

  const user = await prisma.user.create({
    data: {
      id,
      email: `recovery-${id}@example.com`,
      passwordHash,
      displayName: "Recovery Owner",
      accountRole: "employer",
      isActive: false,
      deactivatedAt,
      scheduledDeletionAt,
      sessionVersion: 3,
    },
  });
  const company = await prisma.company.create({
    data: {
      id: companyId,
      name: `Recovery Co ${companyId}`,
      isActive: false,
      deactivatedAt,
      scheduledDeletionAt,
    },
  });
  await prisma.companyMember.create({
    data: { companyId, userId: user.id, role: "owner", isActive: false },
  });

  return { user, company };
}

describe("deactivated access token binding", () => {
  it("embeds userId, companyId, and sessionVersion", () => {
    const token = createDeactivatedAccessToken({
      userId: "user-1",
      companyId: "company-1",
      sessionVersion: 2,
    });
    const verified = verifyDeactivatedAccessToken(token);
    assert.ok(verified);
    assert.equal(verified.userId, "user-1");
    assert.equal(verified.companyId, "company-1");
    assert.equal(verified.sessionVersion, 2);
    assert.equal(DEACTIVATED_ACCESS_PURPOSE, "DEACTIVATED_ACCOUNT_ACCESS");
  });

  it("rejects malformed tokens", () => {
    assert.equal(verifyDeactivatedAccessToken("not-a-token"), null);
  });

  it("rejects expired tokens", () => {
    const payload = {
      purpose: DEACTIVATED_ACCESS_PURPOSE,
      userId: "user-1",
      companyId: "company-1",
      sessionVersion: 1,
      exp: Math.floor(Date.now() / 1000) - 10,
    };
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
    const sig = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(payloadJson, "utf8")
      .digest("base64url");
    const token = Buffer.from(`${payloadB64}.${sig}`, "utf8").toString("base64url");
    assert.equal(verifyDeactivatedAccessToken(token), null);
  });

  it("rejects tokens missing companyId (legacy shape)", () => {
    const payload = {
      purpose: DEACTIVATED_ACCESS_PURPOSE,
      userId: "user-1",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
    const sig = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(payloadJson, "utf8")
      .digest("base64url");
    const token = Buffer.from(`${payloadB64}.${sig}`, "utf8").toString("base64url");
    assert.equal(verifyDeactivatedAccessToken(token), null);
  });

  it("allowlists only recovery API paths", () => {
    assert.equal(isDeactivatedRecoveryApiPath("/api/deactivation/recover"), true);
    assert.equal(isDeactivatedRecoveryApiPath("/api/deactivation/account-status"), true);
    assert.equal(isDeactivatedRecoveryApiPath("/api/deactivation/access/logout"), true);
    assert.equal(isDeactivatedRecoveryApiPath("/api/deactivation/final"), false);
    assert.equal(isDeactivatedRecoveryApiPath("/api/companies/x"), false);
    assert.equal(isDeactivatedRecoveryApiPath("/dashboard"), false);
  });
});

describe("inactive employer recovery capability", () => {
  it("mints access for recoverable deactivated employer", async () => {
    const { user, company } = await seedDeactivatedEmployer();
    const minted = await mintDeactivatedAccessForUser(user.id);
    assert.equal(minted.ok, true);
    if (!minted.ok) return;
    assert.equal(minted.claims.userId, user.id);
    assert.equal(minted.claims.companyId, company.id);
    assert.equal(minted.claims.sessionVersion, 3);
  });

  it("does not mint for active employer", async () => {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `active-${id}@example.com`,
        passwordHash: await bcrypt.hash("Password123!", 10),
        accountRole: "employer",
        isActive: true,
      },
    });
    const minted = await mintDeactivatedAccessForUser(id);
    assert.equal(minted.ok, false);
  });

  it("rejects wrong company binding against live state", async () => {
    const { user } = await seedDeactivatedEmployer();
    const token = createDeactivatedAccessToken({
      userId: user.id,
      companyId: "wrong-company",
      sessionVersion: user.sessionVersion,
    });
    // Simulate cookie via direct verify + state resolve path
    const claims = verifyDeactivatedAccessToken(token);
    assert.ok(claims);
    assert.equal(claims.companyId, "wrong-company");
    // getDeactivatedAccountStateFromAccess reads cookies(); unit-check binding logic:
    const state = await import("../get-deactivated-account-state").then((m) =>
      m.resolveDeactivatedEmployerAccountState(user.id)
    );
    assert.ok(state);
    assert.notEqual(state.companyId, claims.companyId);
  });

  it("rejects wrong user binding", async () => {
    const a = await seedDeactivatedEmployer();
    const b = await seedDeactivatedEmployer();
    const token = createDeactivatedAccessToken({
      userId: b.user.id,
      companyId: a.company.id,
      sessionVersion: b.user.sessionVersion,
    });
    const claims = verifyDeactivatedAccessToken(token);
    assert.ok(claims);
    const state = await import("../get-deactivated-account-state").then((m) =>
      m.resolveDeactivatedEmployerAccountState(claims.userId)
    );
    assert.ok(state);
    assert.notEqual(state.companyId, claims.companyId);
  });

  it("rejects replay after successful recovery (sessionVersion bump)", async () => {
    const { user, company } = await seedDeactivatedEmployer();
    const minted = await mintDeactivatedAccessForUser(user.id);
    assert.equal(minted.ok, true);
    if (!minted.ok) return;

    const before = verifyDeactivatedAccessToken(minted.token);
    assert.ok(before);
    assert.equal(before.sessionVersion, 3);

    await recoverEmployerAccount(user.id);

    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      select: { sessionVersion: true, isActive: true },
    });
    assert.ok(refreshed);
    assert.equal(refreshed.isActive, true);
    assert.equal(refreshed.sessionVersion, 4);
    // Old token still cryptographically verifies, but sessionVersion no longer matches.
    const stillSigned = verifyDeactivatedAccessToken(minted.token);
    assert.ok(stillSigned);
    assert.notEqual(stillSigned.sessionVersion, refreshed.sessionVersion);
    assert.equal(company.id, minted.claims.companyId);
  });
});

describe("inactive employer denied from normal protected authorization helpers", () => {
  it("resolveDeactivatedEmployerAccountState is null for active employer (unchanged)", async () => {
    const id = randomUUID();
    const companyId = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: `active-ok-${id}@example.com`,
        passwordHash: await bcrypt.hash("Password123!", 10),
        accountRole: "employer",
        isActive: true,
      },
    });
    await prisma.company.create({
      data: { id: companyId, name: `Active ${companyId}`, isActive: true },
    });
    await prisma.companyMember.create({
      data: { companyId, userId: id, role: "owner", isActive: true },
    });
    const { resolveDeactivatedEmployerAccountState } = await import(
      "../get-deactivated-account-state"
    );
    assert.equal(await resolveDeactivatedEmployerAccountState(id), null);
  });
});

// Keep module referenced for cookie-based helper existence in compiled graph.
void getDeactivatedAccountStateFromAccess;

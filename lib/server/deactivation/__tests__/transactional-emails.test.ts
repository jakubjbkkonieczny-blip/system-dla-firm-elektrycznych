import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

import { prisma } from "@/lib/db/prisma";
import {
  sendAccountDeactivatedConfirmationEmail,
  stripeCancellationFailedForEmail,
} from "@/lib/server/deactivation/account-deactivated-email";
import { sendAccountRecoveredConfirmationEmail } from "@/lib/server/deactivation/account-recovered-email";
import { deactivateEmployerAccount } from "@/lib/server/deactivation/deactivation-service";
import {
  createDeactivationVerificationToken,
  consumeDeactivationVerificationToken,
} from "@/lib/server/deactivation/email-verification";
import { recoverEmployerAccount } from "@/lib/server/deactivation/recovery-service";
import { deliverDeactivationVerificationCode } from "@/lib/server/deactivation/verification-delivery";
import { testSyncWorkerOrphanState } from "@/lib/server/deactivation/__tests__/test-worker-sync";
import { buildAccountDeactivatedEmail } from "@/lib/server/email/templates/account-deactivated";
import { buildDeactivationVerificationEmail } from "@/lib/server/email/templates/deactivation-verification";
import type { EmailClient, TransactionalEmailPayload } from "@/lib/server/email/types";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret-0123456789abcdef";

const PASSWORD = "Password123!";

async function createTestUser(emailPrefix: string) {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.user.create({
    data: {
      id,
      email: `${emailPrefix}-${id}@example.com`,
      passwordHash,
      displayName: "Test Owner",
      accountRole: "employer",
      sessionVersion: 0,
      isActive: true,
    },
  });
}

async function createTestCompany(namePrefix: string) {
  return prisma.company.create({
    data: {
      id: randomUUID(),
      name: `${namePrefix}-${randomUUID()}`,
      isActive: true,
    },
  });
}

async function createOwnerMembership(userId: string, companyId: string) {
  return prisma.companyMember.create({
    data: { companyId, userId, role: "owner", isActive: true },
  });
}

function createMockEmailClient(
  behavior: (payload: TransactionalEmailPayload) => Promise<{ ok: boolean; errorCategory?: string }>
): EmailClient {
  return {
    async send(payload) {
      const result = await behavior(payload);
      if (result.ok) {
        return { ok: true, providerMessageId: "mock-message-id" };
      }
      return { ok: false, errorCategory: result.errorCategory ?? "mock_send_failed" };
    },
  };
}

async function confirmDeactivation(userId: string) {
  const { code } = await createDeactivationVerificationToken(userId);
  const ok = await consumeDeactivationVerificationToken(userId, code);
  assert.equal(ok, true);
}

describe("deactivation verification email delivery", () => {
  it("passes plaintext code only to the email delivery call", async () => {
    const owner = await createTestUser("verify-email");
    const company = await createTestCompany("verify-email-company");
    await createOwnerMembership(owner.id, company.id);

    const { code } = await createDeactivationVerificationToken(owner.id);
    let capturedPayload: TransactionalEmailPayload | undefined;

    const client = createMockEmailClient(async (payload) => {
      capturedPayload = payload;
      return { ok: true };
    });

    await deliverDeactivationVerificationCode(owner.id, "EMPLOYER_ACCOUNT_DEACTIVATION", code, {
      emailClient: client,
    });

    assert.ok(capturedPayload);
    assert.match(capturedPayload.text, new RegExp(code));
    assert.match(capturedPayload.html, new RegExp(code));
    assert.equal(capturedPayload.subject, "Potwierdzenie dezaktywacji konta");
  });

  it("does not store plaintext code in audit log data", async () => {
    const owner = await createTestUser("verify-audit");
    const company = await createTestCompany("verify-audit-company");
    await createOwnerMembership(owner.id, company.id);

    const { code } = await createDeactivationVerificationToken(owner.id);
    await deliverDeactivationVerificationCode(owner.id, "EMPLOYER_ACCOUNT_DEACTIVATION", code, {
      emailClient: createMockEmailClient(async () => ({ ok: true })),
    });

    const audit = await prisma.auditLog.findFirst({
      where: { companyId: company.id, action: "deactivation_verification_email_sent" },
    });

    assert.ok(audit);
    assert.equal(JSON.stringify(audit.data).includes(code), false);
  });

  it("does not log verification code in delivery sources", async () => {
    const sources = await Promise.all([
      readFile("lib/server/deactivation/verification-delivery.ts", "utf8"),
      readFile("lib/server/email/resend-client.ts", "utf8"),
      readFile("lib/server/email/send-transactional-email.ts", "utf8"),
    ]);

    for (const source of sources) {
      assert.equal(source.includes("console.log"), false);
      assert.equal(source.includes("console.info"), false);
      assert.doesNotMatch(source, /log\(.*code/i);
    }
  });

  it("verification email failure does not mark token as used", async () => {
    const owner = await createTestUser("verify-fail");
    const company = await createTestCompany("verify-fail-company");
    await createOwnerMembership(owner.id, company.id);

    const { code } = await createDeactivationVerificationToken(owner.id);

    await assert.rejects(
      deliverDeactivationVerificationCode(owner.id, "EMPLOYER_ACCOUNT_DEACTIVATION", code, {
        emailClient: createMockEmailClient(async () => ({ ok: false, errorCategory: "mock_failed" })),
      }),
      /EMAIL_DELIVERY_FAILED/
    );

    const verified = await consumeDeactivationVerificationToken(owner.id, code);
    assert.equal(verified, true);
  });
});

describe("account deactivated confirmation email", () => {
  it("attempts confirmation email after deactivation success", async () => {
    const owner = await createTestUser("deact-email");
    const company = await createTestCompany("deact-email-company");
    await createOwnerMembership(owner.id, company.id);
    await confirmDeactivation(owner.id);

    const deactivatedAt = new Date("2026-01-10T12:00:00.000Z");
    const scheduledDeletionAt = new Date("2027-01-10T12:00:00.000Z");
    let sendCount = 0;

    const result = await sendAccountDeactivatedConfirmationEmail(
      {
        userId: owner.id,
        companyId: company.id,
        deactivatedAt,
        scheduledDeletionAt,
        stripeStatus: "canceled",
      },
      {
        emailClient: createMockEmailClient(async (payload) => {
          sendCount += 1;
          assert.equal(payload.subject, "Twoje konto i firma zostały zdezaktywowane");
          return { ok: true };
        }),
      }
    );

    assert.equal(result.sent, true);
    assert.equal(sendCount, 1);
  });

  it("uses neutral subscription wording when stripe cancellation failed", () => {
    const template = buildAccountDeactivatedEmail({
      deactivatedAt: new Date("2026-01-10T12:00:00.000Z"),
      recoveryDeadline: new Date("2027-01-10T12:00:00.000Z"),
      stripeCancellationFailed: true,
    });

    assert.match(template.text, /problem z anulowaniem subskrypcji/i);
    assert.doesNotMatch(template.text, /została anulowana zgodnie/i);
    assert.equal(stripeCancellationFailedForEmail("cancellation_failed"), true);
    assert.equal(stripeCancellationFailedForEmail("canceled"), false);
  });

  it("does not rollback deactivation when confirmation email fails", async () => {
    const owner = await createTestUser("deact-email-fail");
    const company = await createTestCompany("deact-email-fail-company");
    await createOwnerMembership(owner.id, company.id);
    await confirmDeactivation(owner.id);

    const outcome = await deactivateEmployerAccount({
      actorUserId: owner.id,
      currentPassword: PASSWORD,
      syncWorkerOrphanStateFn: testSyncWorkerOrphanState,
    });

    assert.equal(outcome.status, "deactivated");

    const emailResult = await sendAccountDeactivatedConfirmationEmail(
      {
        userId: outcome.userId,
        companyId: outcome.companyId,
        deactivatedAt: outcome.deactivatedAt,
        scheduledDeletionAt: outcome.scheduledDeletionAt,
        stripeStatus: "canceled",
      },
      {
        emailClient: createMockEmailClient(async () => ({ ok: false, errorCategory: "provider_down" })),
      }
    );

    assert.equal(emailResult.sent, false);

    const user = await prisma.user.findUnique({ where: { id: owner.id }, select: { isActive: true } });
    assert.equal(user?.isActive, false);
  });
});

describe("account recovered confirmation email", () => {
  it("attempts recovery email only for recovered status", async () => {
    const owner = await createTestUser("recover-email");
    const company = await createTestCompany("recover-email-company");
    await createOwnerMembership(owner.id, company.id);
    await confirmDeactivation(owner.id);

    await deactivateEmployerAccount({
      actorUserId: owner.id,
      currentPassword: PASSWORD,
      syncWorkerOrphanStateFn: testSyncWorkerOrphanState,
    });

    const first = await recoverEmployerAccount(owner.id);
    assert.equal(first.status, "recovered");

    let sendCount = 0;
    const sent = await sendAccountRecoveredConfirmationEmail(
      { userId: first.userId, companyId: first.companyId },
      {
        emailClient: createMockEmailClient(async (payload) => {
          sendCount += 1;
          assert.equal(payload.subject, "Twoje konto i firma zostały odzyskane");
          return { ok: true };
        }),
      }
    );

    assert.equal(sent.sent, true);
    assert.equal(sendCount, 1);
  });

  it("does not send duplicate recovery email for already_recovered", async () => {
    const finalRouteSource = await readFile("app/api/deactivation/recover/route.ts", "utf8");
    assert.match(finalRouteSource, /outcome\.status === "recovered"/);
    assert.doesNotMatch(finalRouteSource, /already_recovered[\s\S]*sendAccountRecoveredConfirmationEmail/);
  });

  it("does not rollback recovery when confirmation email fails", async () => {
    const owner = await createTestUser("recover-email-fail");
    const company = await createTestCompany("recover-email-fail-company");
    await createOwnerMembership(owner.id, company.id);
    await confirmDeactivation(owner.id);

    await deactivateEmployerAccount({
      actorUserId: owner.id,
      currentPassword: PASSWORD,
      syncWorkerOrphanStateFn: testSyncWorkerOrphanState,
    });

    const outcome = await recoverEmployerAccount(owner.id);
    assert.equal(outcome.status, "recovered");

    const emailResult = await sendAccountRecoveredConfirmationEmail(
      { userId: outcome.userId, companyId: outcome.companyId },
      {
        emailClient: createMockEmailClient(async () => ({ ok: false, errorCategory: "provider_down" })),
      }
    );

    assert.equal(emailResult.sent, false);

    const user = await prisma.user.findUnique({ where: { id: owner.id }, select: { isActive: true } });
    assert.equal(user?.isActive, true);
  });
});

describe("transactional email route contracts", () => {
  it("skips duplicate deactivation confirmation email for already_deactivated", async () => {
    const finalRouteSource = await readFile("app/api/deactivation/final/route.ts", "utf8");
    assert.match(finalRouteSource, /outcome\.status === "deactivated"/);
    assert.doesNotMatch(finalRouteSource, /already_deactivated[\s\S]*sendAccountDeactivatedConfirmationEmail/);
  });

  it("returns safe email warning codes without raw provider errors", async () => {
    const finalRouteSource = await readFile("app/api/deactivation/final/route.ts", "utf8");
    const recoverRouteSource = await readFile("app/api/deactivation/recover/route.ts", "utf8");
    const startRouteSource = await readFile("app/api/deactivation/verification/start/route.ts", "utf8");

    assert.match(finalRouteSource, /ACCOUNT_DEACTIVATED_EMAIL_FAILED/);
    assert.match(recoverRouteSource, /ACCOUNT_RECOVERED_EMAIL_FAILED/);
    assert.match(startRouteSource, /EMAIL_DELIVERY_FAILED/);
    assert.doesNotMatch(finalRouteSource, /emailWarning[\s\S]*errorCategory/);
    assert.doesNotMatch(recoverRouteSource, /emailWarning[\s\S]*errorCategory/);
    assert.doesNotMatch(startRouteSource, /resend_api_error/i);
  });

  it("keeps email service out of client bundles", async () => {
    const clientSources = await Promise.all([
      readFile("components/deactivation/DeactivatedAccountClient.tsx", "utf8"),
      readFile("components/deactivation/DeactivationFlowModal.tsx", "utf8"),
      readFile("app/login/page.tsx", "utf8"),
    ]);

    for (const source of clientSources) {
      assert.equal(source.includes("@/lib/server/email"), false);
      assert.equal(source.includes("resend"), false);
    }
  });
});

describe("deactivation verification email template", () => {
  it("includes required content without sensitive fields", () => {
    const template = buildDeactivationVerificationEmail("123456");
    assert.match(template.subject, /dezaktywacji/i);
    assert.match(template.text, /123456/);
    assert.match(template.text, /15 minut/i);
    assert.doesNotMatch(template.text, /tokenHash/i);
    assert.doesNotMatch(template.text, /userId/i);
  });
});

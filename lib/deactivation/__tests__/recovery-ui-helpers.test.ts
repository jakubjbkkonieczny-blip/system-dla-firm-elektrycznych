import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { submitAccountRecovery } from "../deactivation-client-api";
import { RECOVERY_CONFIRMATION_POINTS, RECOVERY_LOGIN_SUCCESS_MESSAGE } from "../recovery-ui-copy";
import {
  beginRecoverySubmit,
  buildRecoveryLoginRedirectUrl,
  buildRecoveryRequestBody,
  canSubmitRecovery,
  createRecoverySubmitGuard,
  finishRecoverySubmit,
  isRecoverySuccessOutcome,
  mapRecoveryError,
  recoveryRequestHasNoClientIdentifiers,
  shouldRedirectToLoginAfterRecovery,
  shouldTreatRecoveryAsSuccess,
} from "../recovery-ui-helpers";

describe("recovery UI copy", () => {
  it("includes required confirmation points", () => {
    assert.equal(RECOVERY_CONFIRMATION_POINTS.length, 6);
    assert.match(RECOVERY_CONFIRMATION_POINTS.join(" "), /NIE zostaną automatycznie reaktywowani/i);
    assert.match(RECOVERY_CONFIRMATION_POINTS.join(" "), /Subskrypcja NIE zostanie automatycznie wznowiona/i);
  });

  it("defines login success message", () => {
    assert.match(RECOVERY_LOGIN_SUCCESS_MESSAGE, /odzyskane/i);
    assert.match(RECOVERY_LOGIN_SUCCESS_MESSAGE, /Zaloguj się ponownie/i);
  });
});

describe("recovery UI helpers", () => {
  it("builds recovery request body without client-side identifiers", () => {
    const body = buildRecoveryRequestBody();
    assert.equal(body, undefined);
    assert.equal(recoveryRequestHasNoClientIdentifiers(body), true);
    assert.equal(recoveryRequestHasNoClientIdentifiers({ userId: "x" }), false);
    assert.equal(recoveryRequestHasNoClientIdentifiers({ companyId: "x" }), false);
    assert.equal(recoveryRequestHasNoClientIdentifiers({ ownerId: "x" }), false);
  });

  it("treats recovered and already_recovered as success", () => {
    assert.equal(isRecoverySuccessOutcome("recovered"), true);
    assert.equal(isRecoverySuccessOutcome("already_recovered"), true);
    assert.equal(isRecoverySuccessOutcome("failed"), false);

    assert.equal(
      shouldTreatRecoveryAsSuccess({ ok: true, outcome: { status: "recovered" } }),
      true
    );
    assert.equal(
      shouldTreatRecoveryAsSuccess({ ok: true, outcome: { status: "already_recovered" } }),
      true
    );
    assert.equal(shouldTreatRecoveryAsSuccess({ ok: true, outcome: { status: "failed" as never } }), false);
  });

  it("redirects to login after successful recovery when requiresLogin is true", () => {
    assert.equal(
      shouldRedirectToLoginAfterRecovery({
        ok: true,
        requiresLogin: true,
        outcome: { status: "recovered" },
      }),
      true
    );
    assert.equal(
      shouldRedirectToLoginAfterRecovery({
        ok: true,
        requiresLogin: true,
        outcome: { status: "already_recovered" },
      }),
      true
    );
    assert.equal(buildRecoveryLoginRedirectUrl(), "/login?type=employer&recovered=1");
  });

  it("maps recovery API errors safely", () => {
    assert.match(mapRecoveryError("RECOVERY_WINDOW_EXPIRED"), /Okres odzyskiwania/i);
    assert.match(mapRecoveryError("MISSING_DEACTIVATED_ACCESS"), /Brak uprawnień/i);
    assert.match(mapRecoveryError("MULTIPLE_OWNED_COMPANIES"), /wiele firm/i);
    assert.match(mapRecoveryError("FORBIDDEN"), /uprawnień/i);
    assert.match(mapRecoveryError("NETWORK_ERROR"), /połączenia/i);
    assert.doesNotMatch(mapRecoveryError("INTERNAL_ERROR"), /Prisma/i);
    assert.doesNotMatch(mapRecoveryError("INTERNAL_ERROR"), /Stripe/i);
  });

  it("blocks double submit while recovery is in flight", () => {
    const initial = createRecoverySubmitGuard();
    assert.equal(canSubmitRecovery(initial), true);

    const started = beginRecoverySubmit(initial);
    assert.ok(started);
    assert.equal(canSubmitRecovery(started!), false);
    assert.equal(beginRecoverySubmit(started!), null);

    const finished = finishRecoverySubmit(started!);
    assert.equal(canSubmitRecovery(finished), true);
  });
});

describe("recovery client API contract", () => {
  it("submitAccountRecovery does not send userId or companyId in request body", async () => {
    const originalFetch = globalThis.fetch;
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (_input, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true, requiresLogin: true, outcome: { status: "recovered" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      await submitAccountRecovery();
      assert.equal(capturedInit?.method, "POST");
      assert.equal(capturedInit?.body, undefined);
      assert.equal(recoveryRequestHasNoClientIdentifiers(undefined), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("recovery UI safety constraints", () => {
  it("does not call Stripe resume from recovery UI sources", async () => {
    const sources = await Promise.all([
      readFile("components/deactivation/DeactivatedAccountClient.tsx", "utf8"),
      readFile("components/deactivation/RecoveryConfirmationModal.tsx", "utf8"),
      readFile("lib/deactivation/deactivation-client-api.ts", "utf8"),
      readFile("lib/deactivation/recovery-ui-helpers.ts", "utf8"),
    ]);

    for (const source of sources) {
      assert.equal(/stripe.*resume/i.test(source), false);
      assert.equal(source.includes("syncSubscription"), false);
      assert.equal(source.includes("/api/billing"), false);
    }
  });

  it("does not reactivate workers or create normal sessions from recovery UI", async () => {
    const clientSource = await readFile("components/deactivation/DeactivatedAccountClient.tsx", "utf8");
    const apiSource = await readFile("lib/deactivation/deactivation-client-api.ts", "utf8");

    assert.equal(clientSource.includes("/api/auth/session"), false);
    assert.equal(clientSource.includes("localStorage"), false);
    assert.equal(clientSource.includes("sessionStorage"), false);
    assert.equal(apiSource.includes("/api/companies"), false);
    assert.doesNotMatch(clientSource, /worker/i);
    assert.doesNotMatch(apiSource, /worker/i);
  });
});

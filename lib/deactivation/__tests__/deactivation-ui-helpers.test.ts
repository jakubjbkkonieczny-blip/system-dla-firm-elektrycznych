import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEACTIVATION_CONSEQUENCES,
  DEACTIVATION_CONFIRMATIONS,
  DEACTIVATION_WARNING_POINTS,
} from "../deactivation-ui-copy";
import {
  allConfirmationsChecked,
  buildDeactivationFinalRequestBody,
  createEmptyConfirmationState,
  hasStripeCancellationWarning,
  isPasswordStepValid,
  isVerificationCodeValid,
  mapDeactivationFinalError,
  mapVerificationConfirmError,
  mapVerificationStartError,
} from "../deactivation-ui-helpers";

describe("deactivation UI copy", () => {
  it("includes required warning points", () => {
    assert.ok(DEACTIVATION_WARNING_POINTS.length >= 7);
    assert.match(DEACTIVATION_WARNING_POINTS.join(" "), /12-miesięczny okres odzyskiwania/);
    assert.doesNotMatch(DEACTIVATION_WARNING_POINTS.join(" "), /bezwarunkowo usunięte/);
  });

  it("includes required consequences", () => {
    assert.equal(DEACTIVATION_CONSEQUENCES.length, 8);
    assert.match(DEACTIVATION_CONSEQUENCES.join(" "), /subskrypcja zostanie anulowana/i);
  });

  it("defines all required confirmation checkboxes", () => {
    assert.equal(DEACTIVATION_CONFIRMATIONS.length, 5);
  });
});

describe("deactivation UI helpers", () => {
  it("requires all confirmations before proceeding", () => {
    const empty = createEmptyConfirmationState();
    assert.equal(allConfirmationsChecked(empty), false);

    const partial = { ...empty, accessLoss: true, dataExport: true };
    assert.equal(allConfirmationsChecked(partial), false);

    const allChecked = DEACTIVATION_CONFIRMATIONS.reduce(
      (acc, item) => {
        acc[item.id] = true;
        return acc;
      },
      createEmptyConfirmationState()
    );
    assert.equal(allConfirmationsChecked(allChecked), true);
  });

  it("validates verification code format", () => {
    assert.equal(isVerificationCodeValid("123456"), true);
    assert.equal(isVerificationCodeValid("12345"), false);
    assert.equal(isVerificationCodeValid("abcdef"), false);
  });

  it("requires non-empty password", () => {
    assert.equal(isPasswordStepValid(""), false);
    assert.equal(isPasswordStepValid("   "), false);
    assert.equal(isPasswordStepValid("secret"), true);
  });

  it("builds final request body without client-side identifiers", () => {
    const body = buildDeactivationFinalRequestBody("secret");
    assert.deepEqual(body, { currentPassword: "secret" });
    assert.equal("userId" in body, false);
    assert.equal("ownerId" in body, false);
    assert.equal("companyId" in body, false);
  });

  it("maps verification and final API errors safely", () => {
    assert.match(mapVerificationStartError("TOO_MANY_REQUESTS"), /przerwie/i);
    assert.match(mapVerificationConfirmError("INVALID_CODE"), /Nieprawidłowy lub wygasły kod/i);
    assert.match(mapDeactivationFinalError("INVALID_PASSWORD"), /Nieprawidłowe hasło/i);
    assert.match(mapDeactivationFinalError("EMAIL_VERIFICATION_REQUIRED"), /weryfikacja e-mail/i);
  });

  it("detects stripe cancellation warning in final response", () => {
    assert.equal(
      hasStripeCancellationWarning({ warning: "STRIPE_CANCELLATION_FAILED" }),
      true
    );
    assert.equal(
      hasStripeCancellationWarning({ outcome: { stripe: "cancellation_failed" } }),
      true
    );
    assert.equal(hasStripeCancellationWarning({ ok: true }), false);
  });
});

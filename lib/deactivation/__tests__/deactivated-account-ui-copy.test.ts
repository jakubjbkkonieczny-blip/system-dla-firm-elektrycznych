import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEACTIVATED_RECOVERY_EXPIRED_TITLE,
  DEACTIVATED_STRIPE_WARNING,
  formatDeactivationDate,
} from "../deactivated-account-ui-copy";

describe("deactivated account UI copy", () => {
  it("uses safe stripe failure wording", () => {
    assert.match(DEACTIVATED_STRIPE_WARNING, /dezaktywowane/i);
    assert.match(DEACTIVATED_STRIPE_WARNING, /subskrypcji/i);
    assert.doesNotMatch(DEACTIVATED_STRIPE_WARNING, /Stripe/i);
  });

  it("formats deactivation dates for Polish locale", () => {
    const formatted = formatDeactivationDate("2025-06-15T00:00:00.000Z");
    assert.match(formatted, /2025/);
  });

  it("defines recovery expired title", () => {
    assert.match(DEACTIVATED_RECOVERY_EXPIRED_TITLE, /Okres odzyskiwania/i);
  });
});

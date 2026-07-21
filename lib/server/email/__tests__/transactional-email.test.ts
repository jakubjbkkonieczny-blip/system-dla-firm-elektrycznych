import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { getEmailFromAddress, getResendApiKey } from "../config";
import { sendTransactionalEmail, setDefaultEmailClientForTests } from "../send-transactional-email";
import type { EmailClient } from "../types";

describe("email config", () => {
  it("reads provider secrets from env without hardcoded values", () => {
    const originalKey = process.env.RESEND_API_KEY;
    const originalFrom = process.env.EMAIL_FROM;

    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    assert.equal(getResendApiKey(), null);
    assert.match(getEmailFromAddress(), /VectorWork/);

    process.env.RESEND_API_KEY = originalKey;
    process.env.EMAIL_FROM = originalFrom;
  });
});

describe("sendTransactionalEmail", () => {
  it("returns missing config when provider is unavailable", async () => {
    setDefaultEmailClientForTests(null);

    const result = await sendTransactionalEmail({
      to: "owner@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errorCategory, "missing_email_provider_config");
    }
  });

  it("delegates to injected client without exposing provider secrets", async () => {
    let capturedTo: string | null = null;
    const client: EmailClient = {
      async send(payload) {
        capturedTo = payload.to;
        return { ok: true, providerMessageId: "msg_123" };
      },
    };

    setDefaultEmailClientForTests(client);

    const result = await sendTransactionalEmail({
      to: "owner@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });

    assert.equal(result.ok, true);
    assert.equal(capturedTo, "owner@example.com");
  });
});

describe("email server-only boundary", () => {
  it("does not expose API keys in email module sources", async () => {
    const configSource = await readFile("lib/server/email/config.ts", "utf8");
    const resendSource = await readFile("lib/server/email/resend-client.ts", "utf8");

    assert.equal(configSource.includes("re_"), false);
    assert.match(configSource, /process\.env\.RESEND_API_KEY/);
    assert.equal(resendSource.includes("re_"), false);
    assert.match(resendSource, /getResendApiKey/);
  });
});

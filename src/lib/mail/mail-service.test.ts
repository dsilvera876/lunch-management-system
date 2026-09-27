import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { EmailDeliveryRuntimeConfig } from "@/lib/mail/email-delivery-types";
import { assertEmailDeliveryReady } from "@/lib/mail/load-email-delivery-config";
import { sendEmail } from "@/lib/mail/mail-service";

const runtimeConfig: EmailDeliveryRuntimeConfig = {
  providerType: "smtp",
  providerName: "Test SMTP",
  smtpHost: "smtp.example.test",
  smtpPort: 587,
  smtpSecurity: "starttls",
  smtpUsername: "user",
  smtpPassword: "pass",
  fromEmail: "noreply@example.test",
  fromName: "LMS",
  replyToEmail: null,
  enabled: true,
};

describe("mail service", () => {
  it("blocks send when delivery is disabled", async () => {
    const result = await sendEmail(
      { to: "a@b.com", subject: "Test", text: "Hello" },
      {
        loadRuntimeConfig: async () => ({ ...runtimeConfig, enabled: false }),
        sendSmtp: async () => ({ success: true }),
      },
    );

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /disabled/i);
  });

  it("blocks send when secret missing", async () => {
    const ready = assertEmailDeliveryReady({ ...runtimeConfig, smtpPassword: null });
    assert.equal(ready.ok, false);
  });

  it("delegates to SMTP provider when configured", async () => {
    let sent = false;
    const result = await sendEmail(
      { to: "a@b.com", subject: "Test", text: "Hello" },
      {
        loadRuntimeConfig: async () => runtimeConfig,
        sendSmtp: async () => {
          sent = true;
          return { success: true };
        },
      },
    );

    assert.equal(result.success, true);
    assert.equal(sent, true);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertEmailDeliveryReady,
  loadEmailDeliveryRuntimeConfig,
} from "@/lib/mail/load-email-delivery-config";
import { sendEmail } from "@/lib/mail/mail-service";

describe("email delivery configuration authority", () => {
  it("returns disabled database config without environment fallback", async () => {
    const previousKey = process.env.SMTP2GO_API_KEY;
    const previousSender = process.env.SMTP2GO_SENDER;
    process.env.SMTP2GO_API_KEY = "legacy-key";
    process.env.SMTP2GO_SENDER = "legacy@example.test";

    const config = await loadEmailDeliveryRuntimeConfig({
      rpc: async () => ({
        data: [
          {
            provider_type: "smtp",
            provider_name: "Local SMTP",
            smtp_host: "127.0.0.1",
            smtp_port: 1025,
            smtp_security: "none",
            smtp_username: "",
            smtp_password: "vault-secret",
            from_email: "noreply@lunch.test",
            from_name: "LMS",
            reply_to_email: null,
            enabled: false,
          },
        ],
        error: null,
      }),
    } as never);

    process.env.SMTP2GO_API_KEY = previousKey;
    process.env.SMTP2GO_SENDER = previousSender;

    assert.equal(config?.enabled, false);
    const ready = assertEmailDeliveryReady(config);
    assert.equal(ready.ok, false);
    if (ready.ok) {
      throw new Error("expected disabled");
    }
    assert.match(ready.error, /disabled/i);
  });

  it("does not send when delivery is disabled even if legacy env vars are set", async () => {
    const previousKey = process.env.SMTP2GO_API_KEY;
    const previousSender = process.env.SMTP2GO_SENDER;
    process.env.SMTP2GO_API_KEY = "legacy-key";
    process.env.SMTP2GO_SENDER = "legacy@example.test";

    let smtpCalled = false;
    const result = await sendEmail(
      { to: "user@example.test", subject: "Test", text: "Hello" },
      {
        loadRuntimeConfig: async () => ({
          providerType: "smtp",
          providerName: "Local",
          smtpHost: "127.0.0.1",
          smtpPort: 1025,
          smtpSecurity: "none",
          smtpUsername: "",
          smtpPassword: "secret",
          fromEmail: "noreply@lunch.test",
          fromName: "LMS",
          replyToEmail: null,
          enabled: false,
        }),
        sendSmtp: async () => {
          smtpCalled = true;
          return { success: true };
        },
      },
    );

    process.env.SMTP2GO_API_KEY = previousKey;
    process.env.SMTP2GO_SENDER = previousSender;

    assert.equal(result.success, false);
    assert.equal(smtpCalled, false);
  });

  it("does not fall back to environment credentials when database config is missing", async () => {
    const previousKey = process.env.SMTP2GO_API_KEY;
    const previousSender = process.env.SMTP2GO_SENDER;
    process.env.SMTP2GO_API_KEY = "legacy-key";
    process.env.SMTP2GO_SENDER = "legacy@example.test";

    let smtpCalled = false;
    const result = await sendEmail(
      { to: "user@example.test", subject: "Test", text: "Hello" },
      {
        loadRuntimeConfig: async () => null,
        sendSmtp: async () => {
          smtpCalled = true;
          return { success: true };
        },
      },
    );

    process.env.SMTP2GO_API_KEY = previousKey;
    process.env.SMTP2GO_SENDER = previousSender;

    assert.equal(result.success, false);
    assert.equal(smtpCalled, false);
    if (result.success) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /not configured/i);
  });

  it("sends when enabled database config is valid", async () => {
    let smtpCalled = false;
    const result = await sendEmail(
      { to: "user@example.test", subject: "Test", text: "Hello" },
      {
        loadRuntimeConfig: async () => ({
          providerType: "smtp",
          providerName: "Local",
          smtpHost: "127.0.0.1",
          smtpPort: 1025,
          smtpSecurity: "none",
          smtpUsername: "user",
          smtpPassword: "secret",
          fromEmail: "noreply@lunch.test",
          fromName: "LMS",
          replyToEmail: null,
          enabled: true,
        }),
        sendSmtp: async () => {
          smtpCalled = true;
          return { success: true };
        },
      },
    );

    assert.equal(result.success, true);
    assert.equal(smtpCalled, true);
  });
});

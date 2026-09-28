import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildAuthConfirmUrl,
  buildAuthEmailContent,
  isDirectSupabaseVerifyUrl,
  mapAuthEmailOtpType,
} from "@/lib/mail/auth-email-templates";
import { enqueueAuthSendEmailHook } from "@/lib/mail/process-auth-send-email-hook";
import { getBreadcrumbs } from "@/lib/breadcrumbs";
import { canAccessRoute, getNavForRole } from "@/lib/navigation";
import { canManageAuthSettings } from "@/lib/roles";

describe("auth and email admin settings", () => {
  it("restricts auth settings management to admin and owner", () => {
    assert.equal(canManageAuthSettings("admin"), true);
    assert.equal(canManageAuthSettings("owner"), true);
    assert.equal(canManageAuthSettings("hr"), false);
    assert.equal(canManageAuthSettings("staff"), false);
    assert.equal(canManageAuthSettings("accounts"), false);
  });

  it("requires Admin or Owner for Admin Settings route", () => {
    assert.equal(canAccessRoute("admin", "/admin/settings/system"), true);
    assert.equal(canAccessRoute("owner", "/admin/settings/system"), true);
    assert.equal(canAccessRoute("hr", "/admin/settings/system"), false);
  });

  it("denies HR route access to authentication and email delivery settings", () => {
    assert.equal(canAccessRoute("hr", "/admin/settings/authentication"), false);
    assert.equal(canAccessRoute("hr", "/admin/settings/email-delivery"), false);
    assert.equal(canAccessRoute("admin", "/admin/settings/authentication"), true);
    assert.equal(canAccessRoute("owner", "/admin/settings/email-delivery"), true);
    assert.equal(canAccessRoute("accounts", "/admin/settings/authentication"), false);
    assert.equal(canAccessRoute("staff", "/admin/settings/email-delivery"), false);
  });

  it("shows Admin Settings under ADMIN for Admin and Owner only", () => {
    for (const role of ["admin", "owner"] as const) {
      const adminGroup = getNavForRole(role).find((group) => group.label === "ADMIN");
      assert.ok(adminGroup?.items.some((item) => item.label === "Admin Settings"));
    }

    const hrNavText = JSON.stringify(getNavForRole("hr"));
    assert.doesNotMatch(hrNavText, /Admin Settings/);
    assert.doesNotMatch(hrNavText, /\/admin\/settings\/system/);
  });

  it("keeps HR Settings operational-only without authentication cards", () => {
    const settingsPage = readFileSync(
      new URL("../app/admin/settings/page.tsx", import.meta.url),
      "utf8",
    );
    const systemPage = readFileSync(
      new URL("../app/admin/settings/system/page.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(settingsPage, /\/admin\/settings\/authentication/);
    assert.doesNotMatch(settingsPage, /\/admin\/settings\/email-delivery/);
    assert.doesNotMatch(settingsPage, /canManageAuthSettings/);
    assert.match(systemPage, /\/admin\/settings\/authentication/);
    assert.match(systemPage, /\/admin\/settings\/email-delivery/);
  });

  it("requires admin or owner on admin system and child settings pages", () => {
    const systemPage = readFileSync(
      new URL("../app/admin/settings/system/page.tsx", import.meta.url),
      "utf8",
    );
    const authPage = readFileSync(
      new URL("../app/admin/settings/authentication/page.tsx", import.meta.url),
      "utf8",
    );
    const emailPage = readFileSync(
      new URL("../app/admin/settings/email-delivery/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(systemPage, /requireAdminOrOwner/);
    assert.match(authPage, /requireAdminOrOwner/);
    assert.match(emailPage, /requireAdminOrOwner/);
    assert.doesNotMatch(authPage, /Back to settings/i);
    assert.doesNotMatch(emailPage, /Back to settings/i);
  });

  it("uses Admin Settings breadcrumbs for technical settings pages", () => {
    assert.deepEqual(getBreadcrumbs("/admin/settings"), [
      { label: "Home", href: "/home" },
      { label: "Settings" },
    ]);

    assert.deepEqual(getBreadcrumbs("/admin/settings/system"), [
      { label: "Home", href: "/home" },
      { label: "Admin Settings" },
    ]);

    const authCrumbs = getBreadcrumbs("/admin/settings/authentication");
    assert.equal(authCrumbs[1]?.label, "Admin Settings");
    assert.equal(authCrumbs[1]?.href, "/admin/settings/system");
    assert.equal(authCrumbs[2]?.label, "Authentication");

    const emailCrumbs = getBreadcrumbs("/admin/settings/email-delivery");
    assert.equal(emailCrumbs[1]?.label, "Admin Settings");
    assert.equal(emailCrumbs[1]?.href, "/admin/settings/system");
    assert.equal(emailCrumbs[2]?.label, "Email Delivery");
  });

  it("supports disabled-domain delete flow in authentication settings UI", () => {
    const domainsUi = readFileSync(
      new URL("../components/admin/authentication-domains-settings.tsx", import.meta.url),
      "utf8",
    );
    const actions = readFileSync(
      new URL("../app/admin/settings/auth-settings-actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(domainsUi, /deleteSignupEmailDomain/);
    assert.match(domainsUi, /variant="danger"/);
    assert.match(domainsUi, /Delete trusted domain\?/);
    assert.match(domainsUi, /Delete Domain/);
    assert.match(actions, /delete_signup_email_domain/);
  });

  it("masks password field and supports configured state", () => {
    const form = readFileSync(
      new URL("../components/admin/email-delivery-settings-form.tsx", import.meta.url),
      "utf8",
    );

    assert.match(form, /type="password"/);
    assert.match(form, /smtp_password_configured/);
    assert.match(form, /leave blank to keep/i);
  });

  it("routes auth hook payloads through the email queue without SMTP", async () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://example.test";

    let capturedSubject: string | null = null;
    const result = await enqueueAuthSendEmailHook(
      {
        user: { email: "user@example.test" },
        email_data: {
          token: "123456",
          token_hash: "hash-value",
          token_new: "",
          token_hash_new: "",
          redirect_to: "https://example.test/auth/confirm?type=signup",
          email_action_type: "recovery",
          site_url: "https://example.test",
        },
      },
      {
        getServiceClient: () => ({}) as never,
        enqueue: async (_client, input) => {
          capturedSubject = input.subject;
          return { success: true, queueId: "queue-1" };
        },
      },
    );

    process.env.APP_ORIGIN = previousOrigin;

    assert.equal(result.success, true);
    assert.match(capturedSubject ?? "", /password/i);
  });

  it("fails auth hook processing when queue enqueue fails", async () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://example.test";

    const result = await enqueueAuthSendEmailHook(
      {
        user: { email: "user@example.test" },
        email_data: {
          token: "123456",
          token_hash: "hash-value",
          token_new: "",
          token_hash_new: "",
          redirect_to: "https://example.test/auth/confirm?type=signup",
          email_action_type: "signup",
          site_url: "https://example.test",
        },
      },
      {
        getServiceClient: () => ({}) as never,
        enqueue: async () => ({ success: false, error: "Queue insert failed" }),
      },
    );

    process.env.APP_ORIGIN = previousOrigin;

    assert.equal(result.success, false);
    if (result.success) {
      throw new Error("expected failure");
    }
    assert.match(result.error, /queue insert failed/i);
  });

  it("maps invite hook payloads to internal invite confirmation URLs", async () => {
    const previousOrigin = process.env.APP_ORIGIN;
    process.env.APP_ORIGIN = "https://example.test";

    let capturedText: string | null = null;

    const result = await enqueueAuthSendEmailHook(
      {
        user: { email: "external@gmail.com" },
        email_data: {
          token: "",
          token_hash: "invite-hash-value",
          token_new: "",
          token_hash_new: "",
          redirect_to: "https://example.test/account/update-password?invite=1",
          email_action_type: "invite",
          site_url: "https://example.test",
        },
      },
      {
        getServiceClient: () => ({}) as never,
        enqueue: async (_client, input) => {
          capturedText = input.textBody;
          return { success: true, queueId: "queue-1" };
        },
      },
    );

    process.env.APP_ORIGIN = previousOrigin;

    assert.equal(result.success, true);
    assert.match(capturedText ?? "", /type=invite/);
    assert.doesNotMatch(capturedText ?? "", /type=signup/);
    assert.match(capturedText ?? "", /invite-hash-value/);
    assert.doesNotMatch(capturedText ?? "", /supabase\.co\/auth\/v1\/verify/);
    assert.doesNotMatch(capturedText ?? "", /redirect_to=/);
    assert.match(capturedText ?? "", /next=%2Faccount%2Fupdate-password%3Finvite%3D1/);
  });

  it("maps auth email action types to Supabase EmailOtpType values explicitly", () => {
    assert.equal(mapAuthEmailOtpType("invite"), "invite");
    assert.equal(mapAuthEmailOtpType("signup"), "signup");
    assert.equal(mapAuthEmailOtpType("recovery"), "recovery");
    assert.equal(mapAuthEmailOtpType("email"), "email");
    assert.equal(mapAuthEmailOtpType("magiclink"), "magiclink");
    assert.equal(mapAuthEmailOtpType("email_change"), "email_change");
  });

  it("rejects direct Supabase verify links in auth email templates", () => {
    assert.equal(
      isDirectSupabaseVerifyUrl(
        "https://project.supabase.co/auth/v1/verify?token=abc&type=invite",
      ),
      true,
    );
    assert.equal(
      isDirectSupabaseVerifyUrl("https://example.test/auth/confirm?type=invite&token_hash=abc"),
      false,
    );
  });

  it("builds auth confirm URLs without logging tokens in templates", () => {
    const url = buildAuthConfirmUrl({
      applicationOrigin: "https://example.test",
      tokenHash: "hash-value",
      actionType: "signup",
    });
    assert.match(url, /token_hash=hash-value/);

    const content = buildAuthEmailContent({
      actionType: "signup",
      confirmUrl: url,
    });
    assert.match(content.text, /hash-value/);
    assert.match(content.subject, /Confirm your Lunch Management System account/);
  });
});

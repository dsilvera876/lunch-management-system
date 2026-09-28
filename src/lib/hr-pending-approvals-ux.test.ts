import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildAppNotifications,
  hrSignupApprovalNotificationItems,
} from "./app-notification-sources";
import {
  buildHrPendingSignupApprovalAlert,
  HR_SIGNUP_APPROVALS_PATH,
} from "./hr-pending-signup-approvals";

describe("HR pending approvals UX", () => {
  it("builds dashboard and notification alerts only when count is positive", () => {
    assert.equal(buildHrPendingSignupApprovalAlert(0), null);
    const alert = buildHrPendingSignupApprovalAlert(1);
    assert.ok(alert);
    assert.equal(alert?.href, HR_SIGNUP_APPROVALS_PATH);
    assert.match(alert?.message ?? "", /1 user is waiting for approval/);
  });

  it("maps pending signup approvals into header notification items", () => {
    assert.deepEqual(hrSignupApprovalNotificationItems(0), []);
    const items = buildAppNotifications(2);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.title, "Pending user approval");
    assert.equal(items[0]?.actionLabel, "Review requests");
    assert.equal(items[0]?.href, HR_SIGNUP_APPROVALS_PATH);
  });

  it("uses teal primary and red badge on users page when pending count is positive", () => {
    const page = readFileSync(
      new URL("../app/admin/users/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /variant=\{pendingCount > 0 \? "primary" : "secondary"\}/);
    assert.match(page, /bg-red-600/);
    assert.match(page, /Pending approvals, \$\{pendingCount\} request/);
  });

  it("shows HR dashboard alert on home when pending approvals exist", () => {
    const home = readFileSync(new URL("../app/home/page.tsx", import.meta.url), "utf8");

    assert.match(home, /HrPendingApprovalsAlert/);
    assert.match(home, /profile\.role === "hr"/);
    assert.match(home, /getHrPendingSignupApprovalCount/);
  });

  it("wires HR-only header notifications with approvals link", () => {
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    const wrapper = readFileSync(
      new URL("../components/app-shell/app-shell-wrapper.tsx", import.meta.url),
      "utf8",
    );
    const header = readFileSync(
      new URL("../components/app-shell/header-notifications.tsx", import.meta.url),
      "utf8",
    );

    assert.match(layout, /hrPendingSignupCount/);
    assert.match(layout, /profile\?\.role === "hr"/);
    assert.match(wrapper, /isInvitePasswordPage/);
    assert.match(header, /bg-red-600/);
    assert.match(
      readFileSync(new URL("./hr-pending-signup-approvals.ts", import.meta.url), "utf8"),
      /Review requests/,
    );
  });
});

describe("invite and recovery password setup layout", () => {
  it("uses auth onboarding layout for invite and recovery without app chrome", () => {
    const wrapper = readFileSync(
      new URL("../components/app-shell/app-shell-wrapper.tsx", import.meta.url),
      "utf8",
    );
    const page = readFileSync(
      new URL("../app/account/update-password/page.tsx", import.meta.url),
      "utf8",
    );
    const authLayout = readFileSync(
      new URL("../components/auth-layout.tsx", import.meta.url),
      "utf8",
    );

    assert.match(wrapper, /isInvitePasswordPage/);
    assert.match(wrapper, /isRecoveryPasswordPage/);
    assert.match(page, /AuthLayout variant="onboarding"/);
    assert.match(page, /!isRecovery && !isInvite/);
    assert.match(page, /Set password/);
    assert.match(authLayout, /pt-20 sm:pt-24/);
  });

  it("keeps logged-in password change in the normal account layout", () => {
    const page = readFileSync(
      new URL("../app/account/update-password/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /PageHeader/);
    assert.match(page, /Change password/);
    assert.match(page, /Back to account/);
  });

  it("routes successful invite password updates to home", () => {
    const actions = readFileSync(
      new URL("../app/account/update-password/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(actions, /getPasswordUpdateRedirectPath\(isRecovery, isInvite\)/);
  });
});

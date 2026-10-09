import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("operational attention header wiring", () => {
  it("loads unread count in layout only for inbox roles", () => {
    const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    const wrapper = readFileSync(
      new URL("../components/app-shell/app-shell-wrapper.tsx", import.meta.url),
      "utf8",
    );
    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );

    assert.match(layout, /canAccessOperationalAttentionInbox/);
    assert.match(layout, /getOperationalAttentionUnreadCount/);
    assert.match(layout, /operationalAttentionUnreadCount/);
    assert.doesNotMatch(layout, /hrPendingSignupCount/);
    assert.match(wrapper, /operationalAttentionUnreadCount/);
    assert.match(shell, /operationalAttentionUnreadCount/);
  });

  it("hides the bell for staff and accounts at the component gate", () => {
    const header = readFileSync(
      new URL("../components/app-shell/header-notifications.tsx", import.meta.url),
      "utf8",
    );

    assert.match(header, /canAccessOperationalAttentionInbox\(role\)/);
    assert.match(header, /return null/);
    assert.match(header, /loadOperationalAttentionInbox/);
    assert.match(header, /markAllOperationalAttentionItemsRead/);
    assert.match(header, /markOperationalAttentionItemRead/);
    assert.match(header, /refreshOperationalAttentionUnreadCount/);
    assert.match(header, /loadGenerationRef/);
    assert.match(header, /refreshGenerationRef/);
    assert.doesNotMatch(
      readFileSync(new URL("../components/app-shell/top-header.tsx", import.meta.url), "utf8"),
      /key=\{`operational-attention-/,
    );
    assert.match(header, /initialUnreadCount/);
    assert.match(header, /event.key === "Escape"/);
    assert.match(header, /aria-live="polite"/);
    assert.match(header, /Mark all as read/);
    assert.match(header, /loadError/);
    assert.match(header, /actionError/);
    assert.match(header, /Could not load notifications/);
    assert.match(header, /Could not mark notification as read/);
    assert.match(header, /Could not mark all notifications as read/);
    assert.match(header, /Try again/);
    assert.doesNotMatch(header, /hr-signup-approval/);
  });

  it("preserves HR home pending approvals alert separate from the bell", () => {
    const home = readFileSync(new URL("../app/home/page.tsx", import.meta.url), "utf8");

    assert.match(home, /HrPendingApprovalsAlert/);
    assert.match(home, /getHrPendingSignupApprovalCount/);
    assert.doesNotMatch(home, /HeaderNotifications/);
  });

  it("uses server actions instead of client Supabase credentials", () => {
    const actions = readFileSync(
      new URL("../app/operational-attention/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(actions, /"use server"/);
    assert.match(actions, /createClient/);
    assert.match(actions, /list_my_operational_attention_items/);
    assert.doesNotMatch(actions, /service_role/);
  });
});

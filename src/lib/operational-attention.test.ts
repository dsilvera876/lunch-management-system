import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canAccessOperationalAttentionInbox,
  mapOperationalAttentionRow,
  mapOperationalAttentionRows,
  operationalAttentionActionLabel,
  operationalAttentionBellAriaLabel,
  shouldShowOperationalAttentionBell,
} from "./operational-attention";

describe("operational attention presentation", () => {
  it("limits inbox access to HR, Admin, and Owner", () => {
    assert.equal(canAccessOperationalAttentionInbox("hr"), true);
    assert.equal(canAccessOperationalAttentionInbox("admin"), true);
    assert.equal(canAccessOperationalAttentionInbox("owner"), true);
    assert.equal(canAccessOperationalAttentionInbox("staff"), false);
    assert.equal(canAccessOperationalAttentionInbox("accounts"), false);
    assert.equal(shouldShowOperationalAttentionBell("staff"), false);
  });

  it("maps RPC rows into UI items with workflow labels", () => {
    const item = mapOperationalAttentionRow({
      id: "11111111-1111-4111-8111-111111111111",
      event_key: "hr.pending_signup_approval",
      title: "Pending user approval",
      body: "Someone needs review.",
      action_href: "/admin/users?view=approvals",
      read_at: null,
      created_at: "2026-10-09T12:00:00.000Z",
    });

    assert.ok(item);
    assert.equal(item?.actionLabel, operationalAttentionActionLabel("hr.pending_signup_approval"));
    assert.equal(item?.isUnread, true);
  });

  it("skips unknown event keys", () => {
    assert.equal(
      mapOperationalAttentionRows([
        {
          id: "11111111-1111-4111-8111-111111111111",
          event_key: "unknown.event",
          title: "X",
          body: "Y",
          action_href: "/admin",
          read_at: null,
          created_at: "2026-10-09T12:00:00.000Z",
        },
      ]).length,
      0,
    );
  });

  it("formats bell aria labels for unread counts", () => {
    assert.equal(operationalAttentionBellAriaLabel(0), "Operational notifications");
    assert.match(operationalAttentionBellAriaLabel(2), /2 unread notifications/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildStaffOrderCancelReorderMessage,
  buildStaffOrderRenderedEmail,
  formatStaffOrderSummaryFromItems,
} from "@/lib/staff-order-notification-content";
import { extractNotificationTemplateVariables } from "@/lib/notification-template";

describe("staff order notification content", () => {
  it("formats order summary lines like staff UI", () => {
    const summary = formatStaffOrderSummaryFromItems([
      { name: "Rice and Peas", unit_label: "Each", quantity: 1, item_type: "side" },
      { name: "Coconut Water", unit_label: "Bottle", quantity: 2, item_type: "standalone" },
      { name: "Jerk Chicken", unit_label: "Each", quantity: 1, item_type: "main" },
    ]);

    assert.match(summary, /Jerk Chicken × 1/);
    assert.match(summary, /Rice and Peas × 1/);
    assert.match(summary, /Coconut Water \(Bottle\) × 2/);
    assert.ok(summary.indexOf("Jerk Chicken") < summary.indexOf("Rice and Peas"));
  });

  it("omits reorder message when ordering is closed", () => {
    assert.equal(
      buildStaffOrderCancelReorderMessage(false, "https://example.com/lunch"),
      "",
    );
    assert.match(
      buildStaffOrderCancelReorderMessage(true, "https://example.com/lunch"),
      /place another order/,
    );
  });

  it("renders submitted template without unsupported variables", () => {
    const rendered = buildStaffOrderRenderedEmail(
      {
        eventKey: "staff.order_submitted",
        orderId: "00000000-0000-0000-0000-000000000099",
        orderDate: "2026-09-14",
        providerName: "Island Eats",
        orderSummary: "Jerk Chicken × 1",
        orderTotal: 12,
        orderStatus: "submitted",
        orderingStillOpen: true,
        recipientName: "Alex Staff",
        recipientEmail: "alex@test.local",
      },
      "https://lunch.example.com",
      {
        subjectTemplate: "Lunch order confirmed for {{order_date}}",
        bodyHtmlTemplate:
          "<p>Hi {{first_name}},</p><p>{{order_summary}}</p><p>{{order_total}}</p>",
        bodyTextTemplate: "Hi {{first_name}},\n{{order_summary}}\n{{order_total}}",
      },
    );

    assert.match(rendered.subject, /September 14/);
    assert.match(rendered.textBody, /Alex/);
    assert.match(rendered.textBody, /\$12\.00/);
    assert.doesNotMatch(rendered.htmlBody, /\{\{/);
  });

  it("escapes are literal in template output (no eval)", () => {
    const vars = extractNotificationTemplateVariables("Hello {{first_name}}");
    assert.deepEqual(vars, ["first_name"]);
  });
});

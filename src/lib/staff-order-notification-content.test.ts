import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildStaffOrderCancelReorderMessage,
  buildStaffOrderRenderedEmail,
  formatStaffOrderSummaryFromItems,
} from "@/lib/staff-order-notification-content";
import {
  extractNotificationTemplateVariables,
  validateNotificationTemplateVariables,
} from "@/lib/notification-template";

/** Matches `notification_event_catalog.allowed_variables` for staff.order_cancelled. */
const STAFF_ORDER_CANCELLED_ALLOWED_VARIABLES = [
  "first_name",
  "order_date",
  "provider_name",
  "order_summary",
  "order_total",
  "order_url",
  "reorder_message",
] as const;

const STAFF_ORDER_CANCELLED_DEFAULT_SUBJECT =
  "Lunch order with {{provider_name}} cancelled for {{order_date}}";

const STAFF_ORDER_CANCELLED_DEFAULT_HTML = `<p>Hi {{first_name}},</p>
<p>Your lunch order with <strong>{{provider_name}}</strong> for <strong>{{order_date}}</strong> has been cancelled.</p>
<p><strong>Order:</strong><br>{{order_summary}}</p>
<p>Other lunch orders for this day were not affected.</p>
<p>{{reorder_message}}</p>`;

const STAFF_ORDER_CANCELLED_DEFAULT_TEXT = `Hi {{first_name}},

Your lunch order with {{provider_name}} for {{order_date}} has been cancelled.

Order:
{{order_summary}}

Other lunch orders for this day were not affected.

{{reorder_message}}`;

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

  it("shipped cancelled default template uses only catalog-allowed variables", () => {
    assert.deepEqual(
      validateNotificationTemplateVariables(
        [...STAFF_ORDER_CANCELLED_ALLOWED_VARIABLES],
        STAFF_ORDER_CANCELLED_DEFAULT_SUBJECT,
        STAFF_ORDER_CANCELLED_DEFAULT_HTML,
        STAFF_ORDER_CANCELLED_DEFAULT_TEXT,
      ),
      [],
    );
  });

  it("renders cancelled template with provider and order summary", () => {
    const rendered = buildStaffOrderRenderedEmail(
      {
        eventKey: "staff.order_cancelled",
        orderId: "00000000-0000-0000-0000-000000000099",
        orderDate: "2026-10-01",
        providerName: "Island Eats",
        orderSummary: "Jerk Chicken × 1",
        orderTotal: 12,
        orderStatus: "cancelled",
        orderingStillOpen: false,
        recipientName: "Alex Staff",
        recipientEmail: "alex@test.local",
      },
      "https://lunch.example.com",
      {
        subjectTemplate: "Lunch order with {{provider_name}} cancelled for {{order_date}}",
        bodyHtmlTemplate:
          "<p>Your lunch order with {{provider_name}} for {{order_date}} has been cancelled.</p><p>{{order_summary}}</p><p>Other lunch orders for this day were not affected.</p>",
        bodyTextTemplate:
          "Your lunch order with {{provider_name}} for {{order_date}} has been cancelled.\n\n{{order_summary}}\n\nOther lunch orders for this day were not affected.",
      },
    );

    assert.match(rendered.subject, /Island Eats/);
    assert.match(rendered.textBody, /Island Eats/);
    assert.match(rendered.textBody, /Jerk Chicken/);
    assert.match(rendered.textBody, /Other lunch orders for this day were not affected/);
    assert.doesNotMatch(rendered.textBody, /all of your lunch orders/i);
  });
});

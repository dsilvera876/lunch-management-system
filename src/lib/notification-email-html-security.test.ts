import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAdminEmailDeliveryFailureRenderedEmail } from "@/lib/admin-email-delivery-failure-notification-content";
import { buildHrEmailDeliveryFailureRenderedEmail } from "@/lib/hr-email-delivery-failure-notification-content";
import { buildHrPendingSignupRenderedEmail } from "@/lib/hr-pending-signup-notification-content";
import { buildAccountSetupEmailContent } from "@/lib/mail/account-setup-email";
import { buildAuthEmailContent } from "@/lib/mail/auth-email-templates";
import {
  buildHrLateOrderSubmittedRenderedEmail,
  buildStaffLateOrderRequestStatusRenderedEmail,
} from "@/lib/staff-late-order-request-content";
import { buildStaffLunchPeriodFinalizedRenderedEmail } from "@/lib/staff-lunch-period-finalized-notification-content";
import { buildStaffOrderRenderedEmail } from "@/lib/staff-order-notification-content";

const TAG_PAYLOAD = `<script>alert("x")</script>`;
const LINK_PAYLOAD = `<a href="https://evil.example/phish">Approve now</a>`;
const ATTRIBUTE_PAYLOAD = `" onmouseover="alert(1)" data-x="`;
const IMG_PAYLOAD = `<img src=x onerror=alert(1)>`;
const PUNCTUATION_PAYLOAD = `O'Brien & "Sons" <Ltd>`;

/** Fails if any payload produced live markup, a new attribute, or a link. */
function assertNoInjectedMarkup(html: string) {
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /href="https:\/\/evil\.example/);
  assert.doesNotMatch(html, /<a href="https:\/\/evil/);
  assert.doesNotMatch(html, /" onmouseover="/);
  assert.doesNotMatch(html, /<Ltd>/);
}

describe("HR pending signup email escaping", () => {
  const templates = {
    subjectTemplate: "New signup approval request: {{requester_name}}",
    bodyHtmlTemplate:
      '<p><strong>{{requester_name}}</strong> ({{requester_email}}) requested access on {{requested_at}}.</p><p><a href="{{review_url}}">Review request</a></p>',
    bodyTextTemplate: "{{requester_name}} ({{requester_email}})\nReview: {{review_url}}",
  };

  function render(requesterName: string, requesterEmail = "applicant@gmail.com") {
    return buildHrPendingSignupRenderedEmail(
      { requesterName, requesterEmail, requestedAt: "2099-01-05T22:30:00.000Z" },
      "https://app.example.com",
      templates,
    );
  }

  it("does not render HTML tags from anonymous signup names", () => {
    const rendered = render(`${TAG_PAYLOAD}<b>Bold</b>`);
    assertNoInjectedMarkup(rendered.htmlBody);
    assert.doesNotMatch(rendered.htmlBody, /<b>Bold/);
    assert.match(
      rendered.htmlBody,
      /<strong>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;&lt;b&gt;Bold&lt;\/b&gt;<\/strong>/,
    );
  });

  it("does not render crafted links from signup names", () => {
    const rendered = render(LINK_PAYLOAD);
    assertNoInjectedMarkup(rendered.htmlBody);
    assert.equal((rendered.htmlBody.match(/<a /g) ?? []).length, 1);
    assert.match(rendered.htmlBody, /<a href="https:\/\/app.example.com\/admin\/users\?view=approvals">/);
  });

  it("does not let signup names or emails add HTML attributes", () => {
    const rendered = render(ATTRIBUTE_PAYLOAD, `x"onclick="alert(1)@evil.example`);
    assertNoInjectedMarkup(rendered.htmlBody);
    assert.doesNotMatch(rendered.htmlBody, /"onclick="/);
    assert.match(rendered.htmlBody, /&quot; onmouseover=&quot;alert\(1\)&quot; data-x=&quot;/);
  });

  it("escapes quotes, ampersands, and angle brackets but keeps them in text", () => {
    const rendered = render(PUNCTUATION_PAYLOAD);
    assert.match(rendered.htmlBody, /O&#39;Brien &amp; &quot;Sons&quot; &lt;Ltd&gt;/);
    assert.match(rendered.textBody, /^O'Brien & "Sons" <Ltd> \(applicant@gmail.com\)/);
    assert.equal(rendered.subject, `New signup approval request: ${PUNCTUATION_PAYLOAD}`);
  });

  it("keeps legitimate names and review link unchanged", () => {
    const rendered = render("Alex Applicant");
    assert.match(rendered.htmlBody, /<p><strong>Alex Applicant<\/strong> \(applicant@gmail.com\)/);
    assert.match(rendered.textBody, /Review: https:\/\/app.example.com\/admin\/users\?view=approvals/);
  });
});

describe("staff order email escaping", () => {
  const html =
    '<p>Hi {{first_name}},</p><p><strong>Provider:</strong><br>{{provider_name}}</p><p><strong>Order:</strong><br>{{order_summary}}</p><p><a href="{{order_url}}">{{order_url}}</a></p><p>{{reorder_message}}</p>';
  const text = "Hi {{first_name}},\n{{provider_name}}\n{{order_summary}}\n{{reorder_message}}";

  function render(overrides: { providerName?: string; orderSummary?: string; recipientName?: string }) {
    return buildStaffOrderRenderedEmail(
      {
        eventKey: "staff.order_cancelled",
        orderId: "00000000-0000-0000-0000-000000000099",
        orderDate: "2026-09-14",
        providerName: overrides.providerName ?? "Island Eats",
        orderSummary: overrides.orderSummary ?? "Jerk Chicken × 1",
        orderTotal: 12,
        orderStatus: "cancelled",
        orderingStillOpen: true,
        recipientName: overrides.recipientName ?? "Alex Staff",
        recipientEmail: "alex@test.local",
      },
      "https://lunch.example.com",
      { subjectTemplate: "Order with {{provider_name}}", bodyHtmlTemplate: html, bodyTextTemplate: text },
    );
  }

  it("escapes malicious provider names, menu items, and employee names", () => {
    const rendered = render({
      providerName: LINK_PAYLOAD,
      orderSummary: `${IMG_PAYLOAD} × 1\nRice & Peas × 2`,
      recipientName: `${TAG_PAYLOAD} Smith`,
    });

    assertNoInjectedMarkup(rendered.htmlBody);
    assert.match(rendered.htmlBody, /&lt;img src=x onerror=alert\(1\)&gt; × 1\nRice &amp; Peas × 2/);
    assert.match(rendered.textBody, /<img src=x onerror=alert\(1\)> × 1\nRice & Peas × 2/);
    assert.match(rendered.textBody, new RegExp(LINK_PAYLOAD.replace(/[.?/]/g, "\\$&")));
  });

  it("keeps the generated order link and reorder message intact", () => {
    const rendered = render({});
    assert.match(
      rendered.htmlBody,
      /<a href="https:\/\/lunch.example.com\/lunch\/orders\/00000000-0000-0000-0000-000000000099">https:\/\/lunch.example.com\/lunch\/orders\/00000000-0000-0000-0000-000000000099<\/a>/,
    );
    assert.match(rendered.htmlBody, /place another order here:\nhttps:\/\/lunch.example.com\/lunch\/orders\//);
    assert.match(rendered.subject, /^Order with Island Eats$/);
  });
});

describe("late order email escaping", () => {
  const template = {
    subjectTemplate: "Late order: {{employee_name}}",
    bodyHtmlTemplate:
      "<p><strong>{{employee_name}}</strong></p><p>{{provider_name}} {{delivery_date}}</p><p>{{requested_summary}}</p><p>{{decline_reason}}</p>",
    bodyTextTemplate: "{{employee_name}} {{requested_summary}} {{decline_reason}}",
  };

  it("escapes staff-entered request summaries and employee names for HR", () => {
    const rendered = buildHrLateOrderSubmittedRenderedEmail(
      {
        employeeName: TAG_PAYLOAD,
        providerName: PUNCTUATION_PAYLOAD,
        deliveryDate: "2026-10-12",
        requestedSummary: LINK_PAYLOAD,
        submittedAt: "2026-10-12T10:00:00Z",
      },
      "https://lunch.example.com",
      template,
    );

    assertNoInjectedMarkup(rendered.htmlBody);
    assert.match(rendered.textBody, /<script>alert\("x"\)<\/script>/);
  });

  it("escapes HR decline reasons sent to staff", () => {
    const rendered = buildStaffLateOrderRequestStatusRenderedEmail(
      {
        firstName: "Alex",
        providerName: "Island Eats",
        deliveryDate: "2026-10-12",
        requestedSummary: "Extra rice",
        declineReason: `${ATTRIBUTE_PAYLOAD}${IMG_PAYLOAD}`,
      },
      template,
    );

    assertNoInjectedMarkup(rendered.htmlBody);
    assert.match(rendered.htmlBody, /<p>Extra rice<\/p>/);
  });
});

describe("staff lunch period finalized email escaping", () => {
  it("escapes period names", () => {
    const rendered = buildStaffLunchPeriodFinalizedRenderedEmail(
      {
        firstName: "Alex",
        periodName: `${LINK_PAYLOAD} & more`,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-15",
      },
      "https://lunch.example.com",
      {
        subjectTemplate: "{{period_name}} finalized",
        bodyHtmlTemplate: '<p>{{period_name}}</p><a href="{{account_url}}">View</a>',
        bodyTextTemplate: "{{period_name}} {{account_url}}",
      },
    );

    assertNoInjectedMarkup(rendered.htmlBody);
    assert.match(rendered.htmlBody, /&amp; more/);
    assert.match(rendered.htmlBody, /<a href="https:\/\/lunch.example.com\/financials">View<\/a>/);
    assert.match(rendered.textBody, / & more https:\/\/lunch.example.com\/financials$/);
  });
});

describe("email delivery failure alert escaping", () => {
  it("escapes recipients and error summaries in HR alerts and keeps follow-up copy", () => {
    const rendered = buildHrEmailDeliveryFailureRenderedEmail(
      {
        emailType: IMG_PAYLOAD,
        recipient: `${ATTRIBUTE_PAYLOAD}@evil.example`,
        failedAt: "2026-10-01T12:00:00Z",
        providerFollowUp: true,
      },
      {
        subjectTemplate: "Email failed: {{email_type}}",
        bodyHtmlTemplate: "<p>{{email_type}} to {{recipient}} at {{failed_at}}</p>",
        bodyTextTemplate: "{{email_type}} to {{recipient}}",
      },
    );

    assertNoInjectedMarkup(rendered.htmlBody);
    assert.match(rendered.htmlBody, /<p>The lunch provider may not have received the order email\./);
  });

  it("escapes provider names inside the admin review fragment", () => {
    const rendered = buildAdminEmailDeliveryFailureRenderedEmail(
      {
        failureSource: "provider_primary_dispatch",
        messageType: "Provider primary lunch-order dispatch",
        recipient: "kitchen@example.test",
        failedAt: "2026-10-01T12:00:00Z",
        errorSummary: TAG_PAYLOAD,
        providerName: LINK_PAYLOAD,
        scheduledDeliveryDate: "2026-10-02",
      },
      "https://lunch.example.com",
      {
        subjectTemplate: "Email delivery failed",
        bodyHtmlTemplate: "<p>Error: {{error_summary}}</p>{{review_html}}",
        bodyTextTemplate: "Error: {{error_summary}}\n\n{{review_text}}",
      },
    );

    assertNoInjectedMarkup(rendered.htmlBody);
    assert.match(rendered.htmlBody, /<p><strong>Failure source:<\/strong> Provider primary lunch-order dispatch\./);
    assert.match(rendered.htmlBody, /<p>Provider: &lt;a href=&quot;https:\/\/evil.example\/phish&quot;&gt;Approve now&lt;\/a&gt;\. Delivery date: /);
    assert.match(rendered.textBody, /Provider: <a href="https:\/\/evil.example\/phish">Approve now<\/a>\./);
  });
});

describe("account setup and auth email escaping", () => {
  it("escapes display names and setup URLs", () => {
    const content = buildAccountSetupEmailContent({
      to: "user@example.test",
      fullName: `${TAG_PAYLOAD} ${PUNCTUATION_PAYLOAD}`,
      setupUrl: `https://lunch.example.com/setup?token=a&b="c"`,
    });

    assertNoInjectedMarkup(content.html);
    assert.match(content.html, /<a href="https:\/\/lunch.example.com\/setup\?token=a&amp;b=&quot;c&quot;">/);
    assert.match(content.text, /Hello <script>alert\("x"\)<\/script> O'Brien/);
  });

  it("escapes reauthentication codes and confirm URLs", () => {
    const content = buildAuthEmailContent({
      actionType: "reauthentication",
      confirmUrl: `https://lunch.example.com/auth/confirm?a=1&b="2"`,
      otpCode: IMG_PAYLOAD,
    });

    assertNoInjectedMarkup(content.html);
    assert.match(content.html, /href="https:\/\/lunch.example.com\/auth\/confirm\?a=1&amp;b=&quot;2&quot;"/);
  });
});

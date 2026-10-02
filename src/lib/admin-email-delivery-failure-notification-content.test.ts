import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAdminEmailDeliveryFailureRenderedEmail,
  buildAdminEmailDeliveryMonitoringUrl,
  buildAdminEmailDeliveryQueueFailureReviewContent,
  buildAdminProviderSupplementalDispatchFailureReviewContent,
} from "@/lib/admin-email-delivery-failure-notification-content";
import { NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH } from "@/lib/notification-delivery";

const templates = {
  subjectTemplate: "Email delivery failed",
  bodyHtmlTemplate:
    "<p>Type: {{message_type}}</p><p>Error: {{error_summary}}</p>{{review_html}}",
  bodyTextTemplate: "Type: {{message_type}}\n\n{{review_text}}",
};

describe("admin email delivery failure notification content", () => {
  it("links queue failures to Email Delivery history", () => {
    const origin = "https://lunch.example.com";
    const review = buildAdminEmailDeliveryQueueFailureReviewContent(origin);
    const url = buildAdminEmailDeliveryMonitoringUrl(origin);

    assert.equal(url, `https://lunch.example.com${NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH}`);
    assert.match(review.reviewHtml, new RegExp(NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH));
    assert.match(review.reviewText, new RegExp(NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH));

    const rendered = buildAdminEmailDeliveryFailureRenderedEmail(
      {
        failureSource: "email_delivery_queue",
        messageType: "auth_hook",
        recipient: "user@example.test",
        failedAt: "2026-10-01T12:00:00Z",
        errorSummary: "SMTP down",
        providerName: null,
        scheduledDeliveryDate: null,
      },
      origin,
      templates,
    );

    assert.match(rendered.htmlBody, /Review Email Delivery/);
    assert.match(rendered.textBody, /Review Email Delivery:/);
    assert.ok(rendered.textBody.includes(NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH));
  });

  it("does not link provider supplemental dispatch failures to Email Delivery history", () => {
    const origin = "https://lunch.example.com";
    const review = buildAdminProviderSupplementalDispatchFailureReviewContent({
      providerName: "Kitchen Co",
      scheduledDeliveryDate: "2026-10-02",
    });

    assert.doesNotMatch(review.reviewHtml, /email\/delivery\/history/);
    assert.doesNotMatch(review.reviewText, /email\/delivery\/history/);
    assert.match(review.reviewHtml, /Provider supplemental late-order dispatch/);
    assert.match(review.reviewHtml, /Late Orders/);

    const rendered = buildAdminEmailDeliveryFailureRenderedEmail(
      {
        failureSource: "provider_supplemental_dispatch",
        messageType: "Provider supplemental late-order dispatch",
        recipient: "kitchen@example.test",
        failedAt: "2026-10-01T12:00:00Z",
        errorSummary: "SMTP rejected",
        providerName: "Kitchen Co",
        scheduledDeliveryDate: "2026-10-02",
      },
      origin,
      templates,
    );

    assert.ok(!rendered.htmlBody.includes(NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH));
    assert.ok(!rendered.textBody.includes(NOTIFICATION_EMAIL_DELIVERY_HISTORY_PATH));
    assert.match(rendered.htmlBody, /Kitchen Co/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHrPendingSignupRenderedEmail,
  buildHrPendingSignupReviewUrl,
} from "@/lib/hr-pending-signup-notification-content";

describe("HR pending signup notification content", () => {
  it("renders review URL toward pending approvals workspace", () => {
    const url = buildHrPendingSignupReviewUrl("https://app.example.com");
    assert.equal(url, "https://app.example.com/admin/users?view=approvals");
  });

  it("renders applicant fields in template", () => {
    const rendered = buildHrPendingSignupRenderedEmail(
      {
        requesterName: "Alex Applicant",
        requesterEmail: "alex@gmail.com",
        requestedAt: "2099-01-05T22:30:00.000Z",
      },
      "https://app.example.com",
      {
        subjectTemplate: "New signup approval request",
        bodyHtmlTemplate:
          "<p>{{requester_name}} · {{requester_email}} · {{requested_at}}</p><a href=\"{{review_url}}\">Review</a>",
        bodyTextTemplate: "{{requester_name}} {{review_url}}",
      },
    );

    assert.equal(rendered.subject, "New signup approval request");
    assert.match(rendered.htmlBody, /Alex Applicant/);
    assert.match(rendered.htmlBody, /alex@gmail.com/);
    assert.match(rendered.htmlBody, /admin\/users\?view=approvals/);
    assert.doesNotMatch(rendered.htmlBody, /internal_id/i);
  });
});

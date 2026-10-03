import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildStaffLunchActivityUrl,
  buildStaffLunchPeriodFinalizedRenderedEmail,
} from "@/lib/staff-lunch-period-finalized-notification-content";

describe("staff lunch period finalized notification content", () => {
  it("links to My Spend financials route", () => {
    assert.equal(buildStaffLunchActivityUrl("https://lunch.example.com"), "https://lunch.example.com/financials");
  });

  it("renders period variables without Jamaica time wording", () => {
    const rendered = buildStaffLunchPeriodFinalizedRenderedEmail(
      {
        firstName: "Alex",
        periodName: "March Payroll",
        periodStart: "2099-03-01",
        periodEnd: "2099-03-15",
      },
      "https://lunch.example.com",
      {
        subjectTemplate: "Lunch period finalized",
        bodyHtmlTemplate: "<p>{{period_start}} – {{period_end}}</p><a href=\"{{account_url}}\">x</a>",
        bodyTextTemplate: "{{period_start}} – {{period_end}}\n{{account_url}}",
      },
    );

    assert.match(rendered.htmlBody, /March 1/);
    assert.match(rendered.htmlBody, /March 15/);
    assert.match(rendered.textBody, /\/financials/);
    assert.doesNotMatch(rendered.textBody, /Jamaica/i);
  });
});

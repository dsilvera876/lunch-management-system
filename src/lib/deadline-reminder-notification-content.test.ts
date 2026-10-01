import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderNotificationTemplate } from "@/lib/notification-template";

describe("deadline reminder notification content", () => {
  it("renders subject and body without Jamaica time wording", () => {
    const variables = {
      first_name: "Alex",
      order_date: "Fri, Jan 10, 2099",
      ordering_deadline: "6:00 PM",
      order_url: "https://app.example.com/lunch",
    };

    const subject = renderNotificationTemplate("Lunch ordering closes soon", variables);
    const html = renderNotificationTemplate(
      '<p>Hi {{first_name}},</p><p>Closes at {{ordering_deadline}}.</p><a href="{{order_url}}">Order</a>',
      variables,
    );

    assert.equal(subject, "Lunch ordering closes soon");
    assert.match(html, /6:00 PM/);
    assert.match(html, /https:\/\/app.example.com\/lunch/);
    assert.doesNotMatch(html, /Jamaica/i);
  });
});

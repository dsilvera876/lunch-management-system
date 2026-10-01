import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { firstNameFromFullName } from "@/lib/today-menu-notification-content";
import { renderNotificationTemplate } from "@/lib/notification-template";
import { TODAY_MENU_SAMPLE_VARIABLES } from "@/lib/notification-template";

describe("today menu notification content", () => {
  it("derives first name for template rendering", () => {
    assert.equal(firstNameFromFullName("Alex Morgan", "alex@test.local"), "Alex");
    assert.equal(firstNameFromFullName(null, "alex@test.local"), "alex");
  });

  it("renders order URL and menu variables in template", () => {
    const subject = renderNotificationTemplate(
      "Today''s Lunch Menu — {{menu_date}}",
      TODAY_MENU_SAMPLE_VARIABLES,
    );
    const html = renderNotificationTemplate(
      '<a href="{{order_url}}">Order Lunch</a>',
      TODAY_MENU_SAMPLE_VARIABLES,
    );

    assert.match(subject, /Sep 14, 2026/);
    assert.match(html, /https:\/\/example.com\/lunch/);
  });
});

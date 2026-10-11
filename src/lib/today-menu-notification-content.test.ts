import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTodayMenuProviderSections,
  firstNameFromFullName,
  renderTodayMenuEmail,
} from "@/lib/today-menu-notification-content";
import {
  renderNotificationHtmlTemplate,
  renderNotificationSubjectTemplate,
  TODAY_MENU_SAMPLE_HTML_VARIABLES,
  TODAY_MENU_SAMPLE_TEXT_VARIABLES,
} from "@/lib/notification-template";
import type { ProviderMenuBundle } from "@/lib/staff-provider-menu";

function provider(
  name: string,
  items: Array<{ name: string; itemType: "main" | "side" | "standalone" }>,
): Pick<ProviderMenuBundle, "name" | "menuItems"> {
  return {
    name,
    menuItems: items as unknown as ProviderMenuBundle["menuItems"],
  };
}

const TEMPLATES = {
  subjectTemplate: "{{provider_name}} menu — {{menu_date}}",
  bodyHtmlTemplate:
    '<p>Hi {{first_name}},</p><p>{{provider_name}}</p><h3>Mains</h3>{{mains}}<h3>Sides</h3>{{sides}}<p><a href="{{order_url}}">Order Lunch</a></p>',
  bodyTextTemplate: "Hi {{first_name}},\n{{provider_name}}\nMains:\n{{mains}}\nSides:\n{{sides}}\n{{order_url}}",
};

function render(providers: Array<Pick<ProviderMenuBundle, "name" | "menuItems">>, firstName = "Alex") {
  return renderTodayMenuEmail(
    {
      firstName,
      menuDate: "Mon, Sep 14, 2026",
      orderingDeadline: "11:00 AM",
      orderUrl: "https://lunch.example.com/lunch",
      sections: buildTodayMenuProviderSections(providers),
    },
    TEMPLATES,
  );
}

describe("today menu notification content", () => {
  it("derives first name for template rendering", () => {
    assert.equal(firstNameFromFullName("Alex Morgan", "alex@test.local"), "Alex");
    assert.equal(firstNameFromFullName(null, "alex@test.local"), "alex");
  });

  it("renders order URL and menu variables in template", () => {
    const subject = renderNotificationSubjectTemplate(
      "Today''s Lunch Menu — {{menu_date}}",
      TODAY_MENU_SAMPLE_TEXT_VARIABLES,
    );
    const html = renderNotificationHtmlTemplate(
      '<a href="{{order_url}}">Order Lunch</a>{{mains}}',
      TODAY_MENU_SAMPLE_HTML_VARIABLES,
    );

    assert.match(subject, /Sep 14, 2026/);
    assert.match(html, /https:\/\/example.com\/lunch/);
    assert.match(html, /<ul><li>Jerk Chicken<\/li>/);
  });

  it("keeps legitimate single-provider lists formatted in HTML and text", () => {
    const rendered = render([
      provider("Island Eats", [
        { name: "Jerk Chicken", itemType: "main" },
        { name: "Rice & Peas", itemType: "side" },
      ]),
    ]);

    assert.match(rendered.htmlBody, /<ul><li>Jerk Chicken<\/li><\/ul>/);
    assert.match(rendered.htmlBody, /<ul><li>Rice &amp; Peas<\/li><\/ul>/);
    assert.match(rendered.textBody, /- Jerk Chicken/);
    assert.match(rendered.textBody, /- Rice & Peas/);
    assert.equal(rendered.subject, "Island Eats menu — Mon, Sep 14, 2026");
  });

  it("escapes malicious provider and menu item names in HTML only", () => {
    const rendered = render(
      [
        provider(`<a href="https://evil.example">Click</a>`, [
          { name: `<img src=x onerror="alert(1)">`, itemType: "main" },
          { name: "<script>alert('x')</script>", itemType: "side" },
        ]),
      ],
      `<b onmouseover="x">Alex</b>`,
    );

    assert.doesNotMatch(rendered.htmlBody, /<img|<script|<a href="https:\/\/evil|<b /);
    assert.match(rendered.htmlBody, /<li>&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;<\/li>/);
    assert.match(rendered.htmlBody, /<li>&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;<\/li>/);
    assert.match(rendered.htmlBody, /&lt;a href=&quot;https:\/\/evil.example&quot;&gt;Click&lt;\/a&gt;/);
    assert.match(rendered.htmlBody, /<a href="https:\/\/lunch.example.com\/lunch">Order Lunch<\/a>/);

    assert.match(rendered.textBody, /- <img src=x onerror="alert\(1\)">/);
    assert.match(rendered.textBody, /<b onmouseover="x">Alex<\/b>/);
  });

  it("escapes provider headings in multi-provider sections", () => {
    const rendered = render([
      provider("Tom & Jerry's <Kitchen>", [{ name: "Curry Goat", itemType: "main" }]),
      provider("Island Eats", [{ name: "Ackee", itemType: "main" }]),
    ]);

    assert.match(
      rendered.htmlBody,
      /<p><strong>Tom &amp; Jerry&#39;s &lt;Kitchen&gt;<\/strong><\/p><ul><li>Curry Goat<\/li><\/ul>/,
    );
    assert.match(rendered.htmlBody, /<p><strong>Island Eats<\/strong><\/p><ul><li>Ackee<\/li><\/ul>/);
    assert.match(rendered.textBody, /Tom & Jerry's <Kitchen>:\n- Curry Goat/);
  });
});

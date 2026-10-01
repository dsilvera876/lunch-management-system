import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractNotificationTemplateVariables,
  renderNotificationTemplate,
  validateNotificationTemplateVariables,
} from "./notification-template";

describe("notification template helpers", () => {
  it("extracts variable names from templates", () => {
    assert.deepEqual(
      extractNotificationTemplateVariables("Hello {{first_name}} on {{menu_date}}"),
      ["first_name", "menu_date"],
    );
  });

  it("validates allowed variables", () => {
    assert.deepEqual(
      validateNotificationTemplateVariables(
        ["first_name", "menu_date"],
        "Hi {{first_name}}",
        "<p>{{menu_date}}</p>",
      ),
      [],
    );
    assert.deepEqual(
      validateNotificationTemplateVariables(
        ["first_name"],
        "Hi {{unknown_variable}}",
        "<p></p>",
      ),
      ["unknown_variable"],
    );
  });

  it("renders sample today menu content", () => {
    const rendered = renderNotificationTemplate(
      "Today''s Lunch Menu — {{menu_date}}",
      { menu_date: "Mon, Sep 14, 2026" },
    );
    assert.match(rendered, /Mon, Sep 14, 2026/);
  });
});

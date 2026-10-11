import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmailHtmlList,
  emailHtml,
  escapeEmailHtml,
  joinEmailHtml,
  TrustedEmailHtml,
} from "./email-html";
import {
  extractNotificationTemplateVariables,
  renderNotificationHtmlTemplate,
  renderNotificationSubjectTemplate,
  renderNotificationTextTemplate,
  TODAY_MENU_SAMPLE_HTML_VARIABLES,
  TODAY_MENU_SAMPLE_TEXT_VARIABLES,
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
    const rendered = renderNotificationSubjectTemplate(
      "Today''s Lunch Menu — {{menu_date}}",
      { menu_date: "Mon, Sep 14, 2026" },
    );
    assert.match(rendered, /Mon, Sep 14, 2026/);
  });
});

describe("email HTML escaping", () => {
  it("escapes ampersands, angle brackets, and both quote styles", () => {
    assert.equal(
      escapeEmailHtml(`Tom & "Jerry" <b>'s</b>`),
      "Tom &amp; &quot;Jerry&quot; &lt;b&gt;&#39;s&lt;/b&gt;",
    );
  });

  it("escapes interpolated values in emailHtml but keeps literal markup", () => {
    const fragment = emailHtml`<p><strong>${"<script>alert(1)</script>"}</strong></p>`;
    assert.equal(
      fragment.html,
      "<p><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></p>",
    );
  });

  it("nests trusted fragments without double escaping", () => {
    const inner = emailHtml`<em>${"A & B"}</em>`;
    const outer = emailHtml`<p>${inner}</p>`;
    assert.equal(outer.html, "<p><em>A &amp; B</em></p>");
    assert.equal(
      joinEmailHtml([emailHtml`<li>1</li>`, emailHtml`<li>2</li>`]).html,
      "<li>1</li><li>2</li>",
    );
  });

  it("rejects trusted fragments not created by the module builders", () => {
    assert.throws(
      () => new TrustedEmailHtml(Symbol("TrustedEmailHtml") as never, "<script>x</script>"),
      TypeError,
    );

    const prototypeForgery = Object.create(TrustedEmailHtml.prototype) as TrustedEmailHtml;
    const shapeForgery = { html: "<script>x</script>" } as unknown as TrustedEmailHtml;
    assert.equal(TrustedEmailHtml.isTrusted(prototypeForgery), false);
    assert.equal(TrustedEmailHtml.isTrusted(shapeForgery), false);
    assert.equal(TrustedEmailHtml.isTrusted(emailHtml`<p></p>`), true);

    for (const forged of [prototypeForgery, shapeForgery]) {
      assert.throws(() => renderNotificationHtmlTemplate("{{mains}}", { mains: forged }), TypeError);
      assert.throws(() => emailHtml`<p>${forged}</p>`, TypeError);
      assert.throws(() => joinEmailHtml([forged]), TypeError);
    }
  });

  it("rejects emailHtml calls that are not tagged template literals", () => {
    const fakeStrings = ["<script>x</script>"] as unknown as TemplateStringsArray;
    assert.throws(() => emailHtml(fakeStrings), TypeError);
  });

  it("builds formatted lists with escaped item names", () => {
    assert.equal(
      buildEmailHtmlList(["Jerk Chicken", `<img src=x onerror="alert(1)">`]).html,
      "<ul><li>Jerk Chicken</li><li>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</li></ul>",
    );
    assert.equal(buildEmailHtmlList([]).html, "<p>—</p>");
  });
});

describe("notification HTML rendering", () => {
  it("escapes plain string variables in HTML bodies", () => {
    const html = renderNotificationHtmlTemplate("<p>Hi {{first_name}}</p>", {
      first_name: "<b>Alex</b>",
    });
    assert.equal(html, "<p>Hi &lt;b&gt;Alex&lt;/b&gt;</p>");
  });

  it("does not let a value break out of a quoted attribute", () => {
    const html = renderNotificationHtmlTemplate('<a href="{{order_url}}">Order</a>', {
      order_url: `https://evil.example/" onclick="alert(1)`,
    });
    assert.equal(
      html,
      '<a href="https://evil.example/&quot; onclick=&quot;alert(1)">Order</a>',
    );
    assert.doesNotMatch(html, /" onclick="/);
  });

  it("escapes strings even when the variable name looks like HTML", () => {
    const html = renderNotificationHtmlTemplate("{{review_html}}{{mains}}", {
      review_html: "<a href='https://evil.example'>x</a>",
      mains: "<ul><li>x</li></ul>",
    });
    assert.doesNotMatch(html, /<a |<ul>/);
    assert.match(html, /&lt;a href=&#39;https:\/\/evil.example&#39;&gt;/);
  });

  it("inserts trusted fragments as markup", () => {
    const html = renderNotificationHtmlTemplate("<div>{{mains}}</div>", {
      mains: buildEmailHtmlList(["Curry & Rice"]),
    });
    assert.equal(html, "<div><ul><li>Curry &amp; Rice</li></ul></div>");
  });

  it("renders missing variables as empty", () => {
    assert.equal(renderNotificationHtmlTemplate("<p>{{missing}}</p>", {}), "<p></p>");
  });

  it("leaves text and subject output unescaped", () => {
    const variables = { first_name: `O'Brien & "Co" <Ltd>` };
    assert.equal(
      renderNotificationTextTemplate("Hi {{first_name}}", variables),
      `Hi O'Brien & "Co" <Ltd>`,
    );
    assert.equal(
      renderNotificationSubjectTemplate("Hi {{first_name}}", variables),
      `Hi O'Brien & "Co" <Ltd>`,
    );
  });

  it("collapses line breaks in subjects", () => {
    assert.equal(
      renderNotificationSubjectTemplate("New request: {{name}}", {
        name: "Alex\r\nBcc: victim@example.com",
      }),
      "New request: Alex Bcc: victim@example.com",
    );
  });

  it("renders today menu samples as HTML lists and text bullets", () => {
    const html = renderNotificationHtmlTemplate(
      "{{mains}}{{sides}}",
      TODAY_MENU_SAMPLE_HTML_VARIABLES,
    );
    const text = renderNotificationTextTemplate(
      "{{mains}}\n{{sides}}",
      TODAY_MENU_SAMPLE_TEXT_VARIABLES,
    );
    assert.match(html, /^<ul><li>Jerk Chicken<\/li>/);
    assert.match(html, /<li>Garden Salad<\/li><\/ul>$/);
    assert.match(text, /^- Jerk Chicken\n/);
    assert.doesNotMatch(text, /<li>/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  validateProviderOrderEmailForActiveProvider,
  normalizeProviderOrderEmail,
} from "@/lib/provider-order-email";
import {
  parseProviderOrderEmailFromForm,
  validateProviderOrderEmailInput,
} from "@/app/admin/providers/provider-mutations";

describe("provider order email", () => {
  it("requires email for active providers only", () => {
    assert.equal(validateProviderOrderEmailForActiveProvider(true, null), "missing");
    assert.equal(validateProviderOrderEmailForActiveProvider(true, "bad"), "invalid");
    assert.equal(validateProviderOrderEmailForActiveProvider(true, "kitchen@example.test"), null);
    assert.equal(validateProviderOrderEmailForActiveProvider(false, null), null);
  });

  it("maps validation to redirect error codes", () => {
    assert.equal(validateProviderOrderEmailInput(true, null), "provider-email-required");
    assert.equal(validateProviderOrderEmailInput(true, "kitchen@example.test"), null);
  });

  it("parses form email values", () => {
    const form = new FormData();
    form.set("primaryOrderEmail", "  kitchen@example.test  ");
    assert.equal(parseProviderOrderEmailFromForm(form), "kitchen@example.test");
    assert.equal(normalizeProviderOrderEmail("   "), null);
  });

  it("wires provider order email outside late-order settings UI", () => {
    const addDrawer = readFileSync(
      new URL("../components/admin/lunch-providers/add-provider-drawer.tsx", import.meta.url),
      "utf8",
    );
    const editPage = readFileSync(
      new URL("../app/admin/providers/[id]/edit/page.tsx", import.meta.url),
      "utf8",
    );
    const lateSettings = readFileSync(
      new URL("../components/admin/provider-late-order-settings.tsx", import.meta.url),
      "utf8",
    );
    const lateActions = readFileSync(
      new URL("../app/admin/providers/[id]/late-order-actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(addDrawer, /ProviderOrderEmailField/);
    const emailField = readFileSync(
      new URL("../components/admin/lunch-providers/provider-order-email-field.tsx", import.meta.url),
      "utf8",
    );
    assert.match(emailField, /PROVIDER_ORDER_EMAIL_HELPER/);
    assert.match(
      readFileSync(new URL("./provider-order-email.ts", import.meta.url), "utf8"),
      /Daily lunch orders and any late-order supplements/,
    );
    assert.match(editPage, /ProviderOrderEmailField/);
    assert.doesNotMatch(lateSettings, /primaryOrderEmail/);
    assert.doesNotMatch(lateActions, /primary_order_email/);
  });

  it("requires HR operational mutation for provider create/update actions", () => {
    const actions = readFileSync(
      new URL("../app/admin/providers/actions.ts", import.meta.url),
      "utf8",
    );
    const lateActions = readFileSync(
      new URL("../app/admin/providers/[id]/late-order-actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(actions, /requireManageProviders/);
    assert.match(lateActions, /requireMutateHrOperationalData/);
  });
});

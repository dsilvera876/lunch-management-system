import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  formatCartEntryRemoveLabel,
  formatCartLineRemoveLabel,
} from "./lunch-checkout-accessibility";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("PRL-011 form and star contrast tokens", () => {
  const css = read("../app/staff-accessibility.css");
  const formField = read("../components/ui/form-field.tsx");
  const stars = read("../components/ui/rating-stars.tsx");

  it("defines staff form and empty-star colors at ≥3:1 on white", () => {
    assert.match(css, /\.border-staff-form[\s\S]*#64748b/);
    assert.match(css, /\.text-staff-star-empty[\s\S]*#64748b/);
  });

  it("applies staff form borders to shared input classes", () => {
    assert.match(formField, /border-staff-form/);
    assert.doesNotMatch(formField, /inputClassName[\s\S]*border-border/);
  });

  it("uses the empty-star token instead of low-contrast teal", () => {
    assert.match(stars, /text-staff-star-empty/);
    assert.doesNotMatch(stars, /teal-700\/25/);
  });
});

describe("PRL-012 control names", () => {
  const cart = read("../components/lunch/lunch-cart-panel.tsx");
  const statusBar = read("../components/lunch/ordering-status-bar.tsx");
  const header = read("../components/app-shell/top-header.tsx");

  it("builds distinct remove labels for lines and orders", () => {
    assert.equal(
      formatCartLineRemoveLabel("Curry Chicken", "Alberries"),
      "Remove Curry Chicken from Alberries order",
    );
    assert.equal(
      formatCartEntryRemoveLabel("Alberries", 2),
      "Remove Alberries order 2 from lunch cart",
    );
  });

  it("cart line Remove buttons expose the full label", () => {
    assert.match(cart, /aria-label=\{label\}/);
    assert.match(cart, /formatCartLineRemoveLabel\(/);
    assert.match(cart, /formatCartEntryRemoveLabel\(/);
  });

  it("delivery location change button is not named only Change", () => {
    assert.match(statusBar, /Change delivery location, currently/);
    assert.match(statusBar, /Choose delivery location/);
    assert.match(statusBar, /aria-hidden="true"[\s\S]*Change/);
  });

  it("account link is not announced as initials only", () => {
    assert.match(header, /Account settings,/);
    assert.match(header, /sr-only/);
    assert.match(header, /aria-hidden="true"[\s\S]*getInitials/);
  });
});

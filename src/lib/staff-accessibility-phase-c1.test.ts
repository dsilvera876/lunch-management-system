import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  contrastRatio,
  STAFF_CONTRAST_PAIRS,
  staffContrastPairsMeetMinimum,
} from "./staff-visual-contrast";

describe("staff visual contrast (Phase C1)", () => {
  it("documents staff color pairs meeting WCAG AA minimum ratios", () => {
    assert.equal(staffContrastPairsMeetMinimum(), true);
    for (const pair of STAFF_CONTRAST_PAIRS) {
      const ratio = contrastRatio(pair.foreground, pair.background);
      assert.ok(
        ratio >= pair.minimumRatio,
        `${pair.name}: ${ratio.toFixed(2)}:1 (need ${pair.minimumRatio}:1)`,
      );
    }
  });
});

describe("Phase C1 staff accessibility wiring", () => {
  it("includes prefers-reduced-motion rules", () => {
    const css = readFileSync(
      new URL("../app/staff-accessibility.css", import.meta.url),
      "utf8",
    );
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  });

  it("includes forced-colors fallbacks for staff tabs and calendar", () => {
    const css = readFileSync(
      new URL("../app/staff-accessibility.css", import.meta.url),
      "utf8",
    );
    assert.match(css, /forced-colors:\s*active/);
    assert.match(css, /staff-tab-selected/);
    assert.match(css, /staff-calendar-day-selected/);
  });

  it("does not replace global primary or muted CSS variables", () => {
    const globals = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    assert.match(globals, /--primary:\s*#0d9488/);
    assert.match(globals, /--muted:\s*#64748b/);
  });

  it("uses staff CTA class on finish and place order actions", () => {
    const menu = readFileSync(
      new URL("../components/lunch/provider-menu-panel.tsx", import.meta.url),
      "utf8",
    );
    const submit = readFileSync(
      new URL("../components/form-submit-button.tsx", import.meta.url),
      "utf8",
    );
    const providerForm = readFileSync(
      new URL("../components/provider-order-form.tsx", import.meta.url),
      "utf8",
    );
    assert.match(menu, /STAFF_PRIMARY_CTA_CLASS/);
    assert.match(submit, /staffPrimaryCta/);
    assert.match(providerForm, /staffPrimaryCta=\{!isLateOrderLayout\}/);
  });

  it("uses staff teal for staff mobile nav active state only", () => {
    const shell = readFileSync(
      new URL("../components/app-shell/app-shell.tsx", import.meta.url),
      "utf8",
    );
    assert.match(shell, /staffMobileNav/);
    assert.match(shell, /role === "staff"/);
    assert.match(shell, /text-staff-teal/);
    assert.match(shell, /border-primary bg-primary\/10 text-primary/);
  });

  it("expands touch targets on cart remove, toast dismiss, and calendar controls", () => {
    const cart = readFileSync(
      new URL("../components/lunch/lunch-cart-panel.tsx", import.meta.url),
      "utf8",
    );
    const toast = readFileSync(
      new URL("../components/ui/toast.tsx", import.meta.url),
      "utf8",
    );
    const calendar = readFileSync(
      new URL("../components/my-orders/past-order-calendar-popover.tsx", import.meta.url),
      "utf8",
    );
    assert.match(cart, /min-h-10/);
    assert.match(toast, /min-h-10 min-w-10/);
    assert.match(calendar, /size-9/);
  });
});

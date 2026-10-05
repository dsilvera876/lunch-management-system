import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Phase D staff accessibility E2E wiring", () => {
  it("declares npm run test:a11y and Playwright devDependencies", () => {
    const pkg = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
    assert.match(pkg, /"test:a11y"/);
    assert.match(pkg, /@playwright\/test/);
    assert.match(pkg, /@axe-core\/playwright/);
  });

  it("does not hardcode staff passwords in accessibility tests", () => {
    const envHelper = readFileSync(
      new URL("../../tests/accessibility/helpers/env.ts", import.meta.url),
      "utf8",
    );
    const authSetup = readFileSync(
      new URL("../../tests/accessibility/auth.setup.ts", import.meta.url),
      "utf8",
    );
    for (const source of [envHelper, authSetup]) {
      assert.doesNotMatch(source, /LunchTest123!/);
      assert.doesNotMatch(source, /password\s*=\s*['"][^'"]+['"]/);
    }
  });

  it("uses WCAG axe tags in the accessibility helper", () => {
    const axe = readFileSync(
      new URL("../../tests/accessibility/helpers/axe.ts", import.meta.url),
      "utf8",
    );
    assert.match(axe, /wcag22aa/);
    assert.match(axe, /wcag2aa/);
  });

  it("documents local ordering fixture and loopback guard", () => {
    const readme = readFileSync(
      new URL("../../tests/accessibility/README.md", import.meta.url),
      "utf8",
    );
    const fixture = readFileSync(
      new URL("../../tests/accessibility/helpers/e2e-ordering-fixture.ts", import.meta.url),
      "utf8",
    );
    assert.match(readme, /override_open/);
    assert.match(readme, /e2e-ordering-fixture-snapshot\.json/);
    assert.match(fixture, /isLocalSupabaseApiUrl/);
    assert.match(fixture, /127\.0\.0\.1/);
    assert.doesNotMatch(fixture, /\.endsWith\(["']\.local["']\)/);
  });

  it("documents manual accessibility limitations", () => {
    const readme = readFileSync(
      new URL("../../tests/accessibility/README.md", import.meta.url),
      "utf8",
    );
    assert.match(readme, /does not prove full WCAG/i);
    assert.match(readme, /staff-accessibility-manual-checklist\.md/);
  });
});

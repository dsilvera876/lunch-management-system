import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type HarnessWindow = typeof window & {
  __lunchPeriodMode?:
    | "success"
    | "invalid-range"
    | "failure"
    | "delayed-success"
    | "delayed-failure";
  __lunchPeriodCalls?: number;
  __lunchPeriodSuccesses?: number;
  __releaseLunchPeriodAction?: () => void;
  __unmountLunchPeriodsHarness?: () => void;
  __setTableCurrent?: () => void;
  __setTableDetails?: (label: string, endDate: string) => void;
  __tableEditSubmissions?: { label: string; endDate: string }[];
  __tableHistorical?: boolean;
};

const projectRoot = path.resolve(__dirname, "../..");

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function transpileCommonJs(source: string, fileName: string) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

function defineModule(id: string, source: string) {
  return `define(${JSON.stringify(id)}, function (module, exports, require) {\n${source}\n});`;
}

function createLunchPeriodActionsBrowserBundle() {
  const react = readProjectFile("node_modules/react/cjs/react.production.js");
  const jsxRuntime = readProjectFile(
    "node_modules/react/cjs/react-jsx-runtime.production.js",
  );
  const scheduler = readProjectFile("node_modules/scheduler/cjs/scheduler.production.js");
  const reactDom = readProjectFile("node_modules/react-dom/cjs/react-dom.production.js");
  const reactDomClient = readProjectFile(
    "node_modules/react-dom/cjs/react-dom-client.production.js",
  );
  const icons = transpileCommonJs(
    readProjectFile("src/components/icons/line-icons.tsx"),
    "line-icons.tsx",
  );
  const toast = transpileCommonJs(
    readProjectFile("src/components/ui/toast.tsx"),
    "toast.tsx",
  );
  const formActionStatus = transpileCommonJs(
    readProjectFile("src/components/ui/form-action-status.tsx"),
    "form-action-status.tsx",
  );
  const feedback = transpileCommonJs(
    readProjectFile("src/lib/lunch-period-action-feedback.ts"),
    "lunch-period-action-feedback.ts",
  );
  const workspace = transpileCommonJs(
    readProjectFile(
      "src/components/admin/lunch-periods/lunch-periods-workspace.tsx",
    ),
    "lunch-periods-workspace.tsx",
  );
  const linkStub = `
    "use strict";
    const React = require("react");
    module.exports = function Link({ href, children, ...props }) {
      return React.createElement("a", { href: typeof href === "string" ? href : "#", ...props }, children);
    };
  `;
  const harness = transpileCommonJs(
    `
      import { useState } from "react";
      import { createRoot } from "react-dom/client";
      import {
        LunchPeriodMutationForm,
        LunchPeriodsWorkspace,
      } from "workspace";
      import { LUNCH_PERIOD_UPDATED_SUCCESS } from "feedback";

      function Harness() {
        const [authoritativeLabel, setAuthoritativeLabel] = useState("October 2026");
        const [editing, setEditing] = useState(true);
        const [isCurrent, setIsCurrent] = useState(false);
        const [hasFirstPeriod, setHasFirstPeriod] = useState(false);

        const mutationAction = async (formData: FormData) => {
          window.__lunchPeriodCalls += 1;
          const mode = window.__lunchPeriodMode;
          if (mode === "delayed-success" || mode === "delayed-failure") {
            await new Promise<void>((resolve) => {
              window.__releaseLunchPeriodAction = resolve;
            });
          }
          if (mode === "invalid-range") {
            return { success: false as const, error: "invalid-range" as const };
          }
          if (mode === "failure" || mode === "delayed-failure") {
            return { success: false as const, error: "update" as const };
          }
          setAuthoritativeLabel(String(formData.get("label")));
          return { success: true as const };
        };

        return (
          <LunchPeriodsWorkspace>
            <div style={{ height: 1200 }} aria-hidden="true" />
            <main>
              <p>Authoritative label: <output>{authoritativeLabel}</output></p>
              {editing ? (
                <LunchPeriodMutationForm
                  mutationAction={mutationAction}
                  successMessage={LUNCH_PERIOD_UPDATED_SUCCESS}
                  focusAfterSuccessId="edit-period"
                  onSuccess={() => {
                    window.__lunchPeriodSuccesses += 1;
                    setEditing(false);
                  }}
                >
                  <label htmlFor="label">Label</label>
                  <input id="label" name="label" defaultValue={authoritativeLabel} />
                  <button type="submit">Save period</button>
                </LunchPeriodMutationForm>
              ) : (
                <button id="edit-period" type="button" onClick={() => setEditing(true)}>
                  Edit period
                </button>
              )}
              {!isCurrent ? (
                <LunchPeriodMutationForm
                  mutationAction={mutationAction}
                  successMessage={LUNCH_PERIOD_UPDATED_SUCCESS}
                  focusAfterSuccessId="current-period-target"
                  onSuccess={() => setIsCurrent(true)}
                >
                  <input type="hidden" name="label" value={authoritativeLabel} />
                  <button type="submit">Make current period</button>
                </LunchPeriodMutationForm>
              ) : null}
              <p id="current-period-target" tabIndex={-1}>Current period context</p>
              {!hasFirstPeriod ? (
                <LunchPeriodMutationForm
                  mutationAction={mutationAction}
                  successMessage={LUNCH_PERIOD_UPDATED_SUCCESS}
                  focusAfterSuccessId="append-period-target"
                  onSuccess={() => setHasFirstPeriod(true)}
                >
                  <input type="hidden" name="label" value={authoritativeLabel} />
                  <button type="submit">Create first period</button>
                </LunchPeriodMutationForm>
              ) : (
                <section
                  id="append-period-target"
                  tabIndex={-1}
                  aria-labelledby="append-period-heading"
                >
                  <h2 id="append-period-heading">Append next period</h2>
                </section>
              )}
            </main>
            <div style={{ height: 800 }} aria-hidden="true" />
          </LunchPeriodsWorkspace>
        );
      }

      const rootElement = document.getElementById("root");
      if (!rootElement) throw new Error("Lunch-period test root is missing");
      const root = createRoot(rootElement);
      window.__unmountLunchPeriodsHarness = () => root.unmount();
      root.render(<Harness />);
    `,
    "lunch-period-actions-harness.tsx",
  );

  return `
    (() => {
      const factories = new Map();
      const cache = new Map();
      const define = (id, factory) => factories.set(id, factory);
      const require = (id) => {
        if (cache.has(id)) return cache.get(id).exports;
        const factory = factories.get(id);
        if (!factory) throw new Error("Unknown browser test module: " + id);
        const module = { exports: {} };
        cache.set(id, module);
        factory(module, module.exports, require);
        return module.exports;
      };
      ${defineModule("react", react)}
      ${defineModule("react/jsx-runtime", jsxRuntime)}
      ${defineModule("scheduler", scheduler)}
      ${defineModule("react-dom", reactDom)}
      ${defineModule("react-dom/client", reactDomClient)}
      ${defineModule("next/link", linkStub)}
      ${defineModule("@/components/icons/line-icons", icons)}
      ${defineModule("@/components/ui/toast", toast)}
      ${defineModule("@/components/ui/form-action-status", formActionStatus)}
      ${defineModule("@/lib/lunch-period-action-feedback", feedback)}
      ${defineModule("feedback", feedback)}
      ${defineModule("workspace", workspace)}
      ${defineModule("harness", harness)}
      require("harness");
    })();
  `;
}

const browserBundle = createLunchPeriodActionsBrowserBundle();

function createTableBrowserBundle() {
  const sources: Record<string, string> = {};
  for (const [id, file] of Object.entries({
    react: "node_modules/react/cjs/react.production.js",
    "react/jsx-runtime": "node_modules/react/cjs/react-jsx-runtime.production.js",
    scheduler: "node_modules/scheduler/cjs/scheduler.production.js",
    "react-dom": "node_modules/react-dom/cjs/react-dom.production.js",
    "react-dom/client": "node_modules/react-dom/cjs/react-dom-client.production.js",
  })) {
    sources[id] = readProjectFile(file);
  }
  for (const [id, file] of Object.entries({
    workspace: "src/components/admin/lunch-periods/lunch-periods-workspace.tsx",
    table: "src/components/admin/lunch-periods/lunch-periods-table.tsx",
    "@/components/ui/toast": "src/components/ui/toast.tsx",
    "@/components/ui/form-action-status": "src/components/ui/form-action-status.tsx",
    "@/lib/lunch-period-action-feedback": "src/lib/lunch-period-action-feedback.ts",
  })) {
    sources[id] = transpileCommonJs(readProjectFile(file), file);
  }
  Object.assign(sources, {
    "@/components/admin/lunch-periods/lunch-periods-workspace": 'module.exports = require("workspace");',
    "@/components/icons/line-icons": 'const R = require("react"); module.exports = new Proxy({}, { get: () => () => R.createElement("svg", {"aria-hidden": true}) });',
    "next/link": 'const R = require("react"); module.exports = (p) => R.createElement("a", p, p.children);',
    "@/components/ui/button": 'const R = require("react"); exports.Button = ({variant, ...p}) => R.createElement("button", p, p.children);',
    "@/components/ui/card": 'const R = require("react"); exports.Card = ({padding, ...p}) => R.createElement("div", p, p.children);',
    "@/components/ui/section-header": 'const R = require("react"); exports.SectionHeader = ({title}) => R.createElement("h2", null, title);',
    "@/components/ui/form-field": 'const R = require("react"); exports.FormField = ({label, htmlFor, children}) => R.createElement("div", null, R.createElement("label", {htmlFor}, label), children); exports.inputClassName = "";',
    "@/components/ui/empty-state": 'exports.EmptyState = () => null;',
    "@/components/admin/lunch-periods/lunch-period-status-badge": 'const R = require("react"); exports.LunchPeriodStatusBadge = ({status}) => R.createElement("span", null, status);',
    "@/components/app-shell/support-mode-context": 'exports.SUPPORT_MODE_DISABLED_HINT = "Read only";',
    "@/lib/lunch-periods": 'exports.countLunchPeriodDays = () => 7; exports.formatLunchPeriodAdminDate = x => x; exports.getLunchPeriodAdminStatus = x => x.is_current ? "active" : "locked"; exports.isLatestLunchPeriod = () => !window.__tableHistorical;',
    "@/app/admin/lunch-periods/actions": `
      exports.setCurrentLunchPeriod = async () => {
        window.__lunchPeriodCalls += 1;
        const mode = window.__lunchPeriodMode;
        if (mode === "delayed-success") {
          await new Promise(resolve => { window.__releaseLunchPeriodAction = resolve; });
        }
        if (mode === "failure") return { success: false, error: "set-current" };
        window.__setTableCurrent?.();
        return { success: true };
      };
      exports.updateLunchPeriodDetails = async formData => {
        const label = String(formData.get("label")).trim();
        const endDate = String(formData.get("endDate"));
        window.__tableEditSubmissions.push({label, endDate});
        if (window.__lunchPeriodMode === "delayed-success") {
          await new Promise(resolve => { window.__releaseLunchPeriodAction = resolve; });
        }
        if (!label || endDate < "2026-10-01" || window.__lunchPeriodMode === "failure") {
          return {success: false, error: "update"};
        }
        window.__setTableDetails?.(label, endDate);
        return {success: true};
      };
    `,
    harness: `
      const R = require("react");
      const { createRoot } = require("react-dom/client");
      const { LunchPeriodsWorkspace } = require("workspace");
      const { LunchPeriodsTable } = require("table");
      function Harness() {
        const [current, setCurrent] = R.useState(false);
        const [details, setDetails] = R.useState({label: "Fixture period", end_date: "2026-10-07"});
        window.__setTableCurrent = () => setCurrent(true);
        window.__setTableDetails = (label, endDate) => setDetails({label, end_date: endDate});
        return R.createElement(LunchPeriodsWorkspace, null,
          R.createElement("div", {style: {height: 1200}, "aria-hidden": true}),
          R.createElement(LunchPeriodsTable, { periods: [{id: "fixture-period", ...details, start_date: "2026-10-01", is_current: current, status: "open"}] }),
          R.createElement("div", {style: {height: 800}, "aria-hidden": true}));
      }
      const root = createRoot(document.getElementById("root"));
      window.__unmountLunchPeriodsHarness = () => root.unmount();
      root.render(R.createElement(Harness));
    `,
  });
  return `(() => {
    const factories = new Map();
    const cache = new Map();
    const define = (id, factory) => factories.set(id, factory);
    const require = id => {
      if (cache.has(id)) return cache.get(id).exports;
      const factory = factories.get(id);
      if (!factory) throw new Error("Unknown browser test module: " + id);
      const module = {exports: {}};
      cache.set(id, module);
      factory(module, module.exports, require);
      return module.exports;
    };
    ${Object.entries(sources).map(([id, source]) => defineModule(id, source)).join("\n")}
    require("harness");
  })();`;
}

const tableBrowserBundle = createTableBrowserBundle();

async function mountTable(page: Page, historical = false) {
  await page.setContent('<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>');
  await page.evaluate(() => {
    const state = window as HarnessWindow;
    state.__lunchPeriodMode = "success";
    state.__lunchPeriodCalls = 0;
    state.__tableEditSubmissions = [];
    state.__releaseLunchPeriodAction = undefined;
  });
  await page.addScriptTag({content: tableBrowserBundle});
  await expect(page.getByRole("button", {name: "Edit", exact: true})).toBeVisible();
  await page.evaluate((historical) => {
    (window as HarnessWindow).__tableHistorical = historical;
  }, historical);
}

async function mountHarness(page: Page) {
  await page.setContent(
    '<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>',
  );
  await page.evaluate(() => {
    const harnessWindow = window as HarnessWindow;
    harnessWindow.__lunchPeriodMode = "success";
    harnessWindow.__lunchPeriodCalls = 0;
    harnessWindow.__lunchPeriodSuccesses = 0;
    harnessWindow.__releaseLunchPeriodAction = undefined;
    harnessWindow.__unmountLunchPeriodsHarness = undefined;
  });
  await page.addScriptTag({ content: browserBundle });
  await expect(page.getByRole("button", { name: "Save period" })).toBeVisible();
}

async function scrollToForm(page: Page) {
  await page.getByRole("button", { name: "Save period" }).scrollIntoViewIfNeeded();
  return page.evaluate(() => window.scrollY);
}

test.beforeEach(async ({ page }) => {
  await mountHarness(page);
});

test("successful save refreshes displayed data, preserves scroll, and shows a temporary toast", async ({
  page,
}) => {
  const scrollBefore = await scrollToForm(page);
  await page.getByLabel("Label").fill("October payroll");
  await page.getByRole("button", { name: "Save period" }).click();

  await expect(page.getByText("Authoritative label:")).toContainText("October payroll");
  await expect(
    page.getByRole("status").filter({ hasText: "Lunch period updated successfully." }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodCalls)).toBe(1);
  await expect(page.getByRole("button", { name: "Edit period" })).toBeFocused();
});

for (const viewport of [
  { label: "desktop", width: 1280, height: 720 },
  { label: "mobile", width: 375, height: 720 },
]) {
  test(`successful save restores contextual focus without scrolling on ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const scrollBefore = await scrollToForm(page);
    await page.getByRole("button", { name: "Save period" }).click();

    await expect(page.getByRole("button", { name: "Edit period" })).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });
}

test("failed save keeps data and scroll stable, announces the error, and shows no success toast", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as HarnessWindow).__lunchPeriodMode = "invalid-range";
  });
  const scrollBefore = await scrollToForm(page);
  await page.getByLabel("Label").fill("Invalid period");
  await page.getByRole("button", { name: "Save period" }).click();

  await expect(page.getByRole("alert")).toContainText("Periods must remain contiguous");
  await expect(page.getByText("Authoritative label:")).toContainText("October 2026");
  await expect(page.getByRole("region", { name: "Notifications" })).toBeEmpty();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("focus follows controls that disappear after create-first and make-current actions", async ({
  page,
}) => {
  const scrollBefore = await scrollToForm(page);

  await page.getByRole("button", { name: "Make current period" }).click();
  await expect(page.getByText("Current period context")).toBeFocused();
  await expect(page.getByRole("button", { name: "Make current period" })).toHaveCount(0);

  await page.getByRole("button", { name: "Create first period" }).click();
  await expect(page.getByRole("region").filter({ hasText: "Append next period" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Create first period" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("generic database failure never produces misleading success feedback", async ({ page }) => {
  await page.evaluate(() => {
    (window as HarnessWindow).__lunchPeriodMode = "failure";
  });
  await scrollToForm(page);
  await page.getByRole("button", { name: "Save period" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Unable to complete that lunch period action.",
  );
  await expect(page.getByRole("region", { name: "Notifications" })).toBeEmpty();
});

test("rapid repeated submissions are guarded while a delayed save is pending", async ({ page }) => {
  await page.evaluate(() => {
    (window as HarnessWindow).__lunchPeriodMode = "delayed-success";
  });
  await page.getByLabel("Label").fill("Delayed payroll");
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save period" }),
  });

  await page.getByRole("button", { name: "Save period" }).evaluate((button) => {
    const ownerForm = (button as HTMLButtonElement).form;
    if (!ownerForm) throw new Error("Expected a form owner");
    ownerForm.requestSubmit(button as HTMLButtonElement);
    ownerForm.requestSubmit(button as HTMLButtonElement);
  });

  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodCalls)).toBe(1);
  await expect(form).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Save period" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Make current period" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Saving lunch period changes." }))
    .toHaveText("Saving lunch period changes.");

  await page.evaluate(() => (window as HarnessWindow).__releaseLunchPeriodAction?.());
  await expect(page.getByRole("button", { name: "Edit period" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodCalls)).toBe(1);
});

test("a delayed failure releases the guard for a later legitimate submission", async ({ page }) => {
  await page.evaluate(() => {
    (window as HarnessWindow).__lunchPeriodMode = "delayed-failure";
  });
  await page.getByRole("button", { name: "Save period" }).click();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodCalls)).toBe(1);
  await page.evaluate(() => (window as HarnessWindow).__releaseLunchPeriodAction?.());

  await expect(page.getByRole("alert")).toHaveText(
    "Unable to complete that lunch period action.",
  );
  await expect(page.getByRole("button", { name: "Save period" })).toBeEnabled();

  await page.evaluate(() => {
    (window as HarnessWindow).__lunchPeriodMode = "success";
  });
  await page.getByLabel("Label").fill("Recovered payroll");
  await page.getByRole("button", { name: "Save period" }).click();

  await expect(page.getByText("Authoritative label:")).toContainText("Recovered payroll");
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodCalls)).toBe(2);
  await expect(page.getByRole("button", { name: "Edit period" })).toBeFocused();
});

test("a delayed completion after navigation does not trigger stale success effects", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as HarnessWindow).__lunchPeriodMode = "delayed-success";
  });
  await page.getByRole("button", { name: "Save period" }).click();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodCalls)).toBe(1);

  await page.evaluate(() => {
    const harnessWindow = window as HarnessWindow;
    harnessWindow.__unmountLunchPeriodsHarness?.();
    document.body.innerHTML = `
      <main>
        <button id="destination-sentinel" type="button">Destination sentinel</button>
        <button id="edit-period" type="button">Destination edit target</button>
      </main>
    `;
    document.getElementById("destination-sentinel")?.focus();
  });

  await page.evaluate(() => (window as HarnessWindow).__releaseLunchPeriodAction?.());
  await page.waitForTimeout(100);

  await expect(page.getByRole("button", { name: "Destination sentinel" })).toBeFocused();
  await expect(page.getByText("Lunch period updated successfully.")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodSuccesses))
    .toBe(0);
});

test("actual table restores Edit focus after Make Current from its editor", async ({ page }) => {
  await mountTable(page);
  await page.getByRole("button", {name: "Edit", exact: true}).click();
  const button = page.getByRole("button", {name: "Make current", exact: true});
  await button.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await button.click();

  await expect(page.getByRole("button", {name: "Edit", exact: true})).toBeFocused();
  await expect(page.getByLabel("Label", {exact: true})).toHaveCount(0);
  await expect(page.getByRole("status").filter({hasText: "Current lunch period updated successfully."})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("actual table restores period focus after Make Current from its normal row", async ({ page }) => {
  await mountTable(page);
  const button = page.getByRole("button", {name: "Make current", exact: true});
  await button.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await button.click();

  await expect(page.locator("#lunch-period-fixture-period-focus-target")).toBeFocused();
  await expect(page.getByRole("status").filter({hasText: "Current lunch period updated successfully."})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test("actual table keeps its editor and allows retry after a failed Make Current", async ({ page }) => {
  await mountTable(page);
  await page.evaluate(() => { (window as HarnessWindow).__lunchPeriodMode = "failure"; });
  await page.getByRole("button", {name: "Edit", exact: true}).click();
  const button = page.getByRole("button", {name: "Make current", exact: true});
  await button.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await button.click();

  await expect(page.getByRole("alert")).toHaveText("Unable to complete that lunch period action.");
  await expect(page.getByLabel("Label", {exact: true})).toBeVisible();
  await expect(page.getByRole("region", {name: "Notifications"})).toBeEmpty();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await page.evaluate(() => { (window as HarnessWindow).__lunchPeriodMode = "success"; });
  await button.click();
  await expect(page.getByRole("button", {name: "Edit", exact: true})).toBeFocused();
});

test("actual table ignores a delayed Make Current completion after navigation", async ({ page }) => {
  await mountTable(page);
  await page.evaluate(() => { (window as HarnessWindow).__lunchPeriodMode = "delayed-success"; });
  await page.getByRole("button", {name: "Edit", exact: true}).click();
  await page.getByRole("button", {name: "Make current", exact: true}).click();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__lunchPeriodCalls)).toBe(1);
  await page.evaluate(() => {
    const state = window as HarnessWindow;
    state.__unmountLunchPeriodsHarness?.();
    document.body.innerHTML = '<button id="sentinel">Destination</button><button id="edit-lunch-period-fixture-period">Edit target</button>';
    document.getElementById("sentinel")?.focus();
    state.__releaseLunchPeriodAction?.();
  });
  await page.waitForTimeout(100);
  await expect(page.getByRole("button", {name: "Destination"})).toBeFocused();
  await expect(page.getByText("Current lunch period updated successfully.")).toHaveCount(0);
});

for (const edit of [
  {name: "label only", label: "Renamed period", endDate: "2026-10-07"},
  {name: "end date only", label: "Fixture period", endDate: "2026-10-09"},
  {name: "both fields", label: "Combined period", endDate: "2026-10-09"},
  {name: "unchanged values", label: "Fixture period", endDate: "2026-10-07"},
]) {
  test(`actual table saves ${edit.name} through one form`, async ({page}) => {
    await mountTable(page);
    await page.getByRole("button", {name: "Edit", exact: true}).click();
    await expect(page.getByRole("button", {name: "Save Changes", exact: true})).toHaveCount(1);
    await expect(page.getByRole("button", {name: /Save label|Save end date/})).toHaveCount(0);
    await page.getByLabel("Label", {exact: true}).fill(edit.label);
    await page.getByLabel("End date", {exact: true}).fill(edit.endDate);
    const save = page.getByRole("button", {name: "Save Changes", exact: true});
    await save.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await save.click();
    await expect(page.getByRole("button", {name: "Edit", exact: true})).toBeFocused();
    await expect(page.locator("tbody")).toContainText(edit.label);
    await expect(page.locator("tbody")).toContainText(edit.endDate);
    await expect(page.getByRole("status").filter({hasText: "Lunch period updated successfully."})).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(await page.evaluate(() => (window as HarnessWindow).__tableEditSubmissions)).toEqual([
      {label: edit.label, endDate: edit.endDate},
    ]);
  });
}

test("actual unified editor preserves both drafts after rejection and guards a delayed retry", async ({page}) => {
  await mountTable(page);
  await page.getByRole("button", {name: "Edit", exact: true}).click();
  await page.getByLabel("Label", {exact: true}).fill("Rejected label");
  await page.getByLabel("End date", {exact: true}).fill("2026-09-30");
  const save = page.getByRole("button", {name: "Save Changes", exact: true});
  await save.click();
  await expect(page.getByRole("alert")).toHaveText("Unable to complete that lunch period action.");
  await expect(page.getByLabel("Label", {exact: true})).toHaveValue("Rejected label");
  await expect(page.getByLabel("End date", {exact: true})).toHaveValue("2026-09-30");
  await expect(page.getByRole("region", {name: "Notifications"})).toBeEmpty();
  await page.getByLabel("End date", {exact: true}).fill("2026-10-08");
  await page.evaluate(() => { (window as HarnessWindow).__lunchPeriodMode = "delayed-success"; });
  await save.evaluate(button => {
    const form = (button as HTMLButtonElement).form!;
    form.requestSubmit(button as HTMLButtonElement);
    form.requestSubmit(button as HTMLButtonElement);
  });
  await expect(save).toBeDisabled();
  await expect(page.getByLabel("Label", {exact: true})).toBeDisabled();
  await expect(page.getByLabel("End date", {exact: true})).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as HarnessWindow).__tableEditSubmissions?.length)).toBe(2);
  await page.evaluate(() => (window as HarnessWindow).__releaseLunchPeriodAction?.());
  await expect(page.getByRole("button", {name: "Edit", exact: true})).toBeFocused();
  await expect(page.locator("tbody")).toContainText("Rejected label");
  await expect(page.locator("tbody")).toContainText("2026-10-08");
});

test("actual historical editor saves a label while its end date stays locked", async ({page}) => {
  await mountTable(page, true);
  await page.getByRole("button", {name: "Edit", exact: true}).click();
  await expect(page.getByText("End date (locked)")).toBeVisible();
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  await page.getByLabel("Label", {exact: true}).fill("Historical rename");
  await page.getByRole("button", {name: "Save Changes", exact: true}).click();
  await expect(page.getByRole("button", {name: "Edit", exact: true})).toBeFocused();
  expect(await page.evaluate(() => (window as HarnessWindow).__tableEditSubmissions)).toEqual([
    {label: "Historical rename", endDate: "2026-10-07"},
  ]);
});

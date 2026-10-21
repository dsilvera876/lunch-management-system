import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type HarnessToast = {
  title: string;
  body?: string;
  variant?: "success" | "error" | "warning" | "info";
  action?: { label: string; href: string };
  durationMs?: number;
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

function createToastBrowserBundle() {
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
  const linkStub = `
    "use strict";
    const React = require("react");
    module.exports = function Link({ href, children, ...props }) {
      return React.createElement("a", { href: typeof href === "string" ? href : "#", ...props }, children);
    };
  `;
  const harness = transpileCommonJs(
    `
      import { useEffect } from "react";
      import { createRoot } from "react-dom/client";
      import { ToastProvider, useToast, type ToastInput } from "toast";

      declare global {
        interface Window {
          __toastHarness?: { showToast: (toast: ToastInput) => void };
        }
      }

      function HarnessController() {
        const { showToast } = useToast();
        useEffect(() => {
          window.__toastHarness = { showToast };
          return () => {
            delete window.__toastHarness;
          };
        }, [showToast]);
        return null;
      }

      const rootElement = document.getElementById("root");
      if (!rootElement) {
        throw new Error("Toast test root is missing");
      }
      createRoot(rootElement).render(
        <ToastProvider>
          <HarnessController />
        </ToastProvider>,
      );
    `,
    "toast-harness.tsx",
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
      ${defineModule("toast", toast)}
      ${defineModule("toast-harness", harness)}
      require("toast-harness");
    })();
  `;
}

const toastBrowserBundle = createToastBrowserBundle();

async function mountToastProvider(page: Page) {
  await page.clock.install({ time: new Date("2026-10-21T12:00:00Z") });
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <button id="outside" type="button">Outside control</button>
        <div id="root"></div>
      </body>
    </html>
  `);
  await page.evaluate(() => {
    const originalClearTimeout = window.clearTimeout.bind(window);
    const testWindow = window as typeof window & { __clearTimeoutCalls: number };
    testWindow.__clearTimeoutCalls = 0;
    window.clearTimeout = ((handle?: number) => {
      testWindow.__clearTimeoutCalls += 1;
      originalClearTimeout(handle);
    }) as typeof window.clearTimeout;
  });
  await page.addScriptTag({ content: toastBrowserBundle });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as typeof window & { __toastHarness?: unknown }).__toastHarness,
        ),
      ),
    )
    .toBe(true);
}

async function showToasts(page: Page, toasts: HarnessToast[]) {
  await page.evaluate((items) => {
    const harness = (
      window as typeof window & {
        __toastHarness?: { showToast: (toast: HarnessToast) => void };
      }
    ).__toastHarness;
    if (!harness) {
      throw new Error("Toast test harness is not ready");
    }
    for (const toast of items) {
      harness.showToast(toast);
    }
  }, toasts);
}

function toastByTitle(page: Page, title: string) {
  return page
    .getByRole("region", { name: "Notifications" })
    .locator('[role="status"], [role="alert"]')
    .filter({ hasText: title });
}

test.beforeEach(async ({ page }) => {
  await mountToastProvider(page);
});

test("rapid notifications keep independent identity and omitted variant defaults to success", async ({
  page,
}) => {
  await showToasts(page, [
    { title: "Default success", durationMs: 1000 },
    { title: "Information", variant: "info", durationMs: 2000 },
    { title: "Later success", variant: "success", durationMs: 3000 },
  ]);

  const defaultToast = toastByTitle(page, "Default success");
  const infoToast = toastByTitle(page, "Information");
  const laterToast = toastByTitle(page, "Later success");
  await expect(defaultToast).toHaveClass(/bg-emerald-700/);
  await expect(defaultToast.locator('[data-toast-variant-icon="success"]')).toHaveCount(1);
  await expect(infoToast).toHaveCount(1);
  await expect(laterToast).toHaveCount(1);

  await page.clock.fastForward(1000);
  await expect(defaultToast).toHaveCount(0);
  await expect(infoToast).toHaveCount(1);
  await expect(laterToast).toHaveCount(1);

  await infoToast
    .getByRole("button", { name: "Dismiss Information notification" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(infoToast).toHaveCount(0);
  await expect(laterToast).toHaveCount(1);

  await page.clock.fastForward(2500);
  await expect(laterToast).toHaveCount(0);
});

test("hover and focus pauses overlap until mouse leave and blur both occur", async ({ page }) => {
  await showToasts(page, [{ title: "Paused toast", durationMs: 1000 }]);
  const toast = toastByTitle(page, "Paused toast");
  const dismiss = toast.getByRole("button", {
    name: "Dismiss Paused toast notification",
  });

  await page.clock.fastForward(400);
  await toast.hover();
  await dismiss.focus();
  await page.clock.fastForward(2000);
  await expect(toast).toHaveCount(1);

  await page.locator("#outside").hover();
  await page.clock.fastForward(2000);
  await expect(toast).toHaveCount(1);

  await page.locator("#outside").focus();
  await page.clock.fastForward(500);
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(200);
  await expect(toast).toHaveCount(0);
});

test("document visibility pauses and resumes the mounted toast timer", async ({ page }) => {
  await showToasts(page, [{ title: "Visibility toast", durationMs: 1000 }]);
  const toast = toastByTitle(page, "Visibility toast");

  await page.clock.fastForward(350);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(5000);
  await expect(toast).toHaveCount(1);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(500);
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(200);
  await expect(toast).toHaveCount(0);
});

test("manual dismissal cancels only that toast timer", async ({ page }) => {
  await showToasts(page, [
    { title: "Dismiss early", durationMs: 1000 },
    { title: "Remain independent", durationMs: 1500 },
  ]);
  const dismissedToast = toastByTitle(page, "Dismiss early");
  const remainingToast = toastByTitle(page, "Remain independent");
  const clearCallsBefore = await page.evaluate(
    () => (window as typeof window & { __clearTimeoutCalls: number }).__clearTimeoutCalls,
  );

  await dismissedToast
    .getByRole("button", { name: "Dismiss Dismiss early notification" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(dismissedToast).toHaveCount(0);
  await expect(remainingToast).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as typeof window & { __clearTimeoutCalls: number }).__clearTimeoutCalls,
      ),
    )
    .toBeGreaterThan(clearCallsBefore);

  await page.clock.fastForward(1200);
  await expect(remainingToast).toHaveCount(1);
  await page.clock.fastForward(400);
  await expect(remainingToast).toHaveCount(0);
});

test("errors and action toasts persist unless explicitly timed", async ({ page }) => {
  await showToasts(page, [
    { title: "Persistent error", variant: "error" },
    {
      title: "Persistent action",
      action: { label: "Review", href: "/review" },
    },
    { title: "Timed error", variant: "error", durationMs: 500 },
    {
      title: "Timed action",
      action: { label: "Open", href: "/open" },
      durationMs: 500,
    },
  ]);

  await page.clock.fastForward(500);
  await expect(toastByTitle(page, "Timed error")).toHaveCount(0);
  await expect(toastByTitle(page, "Timed action")).toHaveCount(0);
  await expect(toastByTitle(page, "Persistent error")).toHaveCount(1);
  await expect(toastByTitle(page, "Persistent action")).toHaveCount(1);

  await page.clock.fastForward(30_000);
  await expect(toastByTitle(page, "Persistent error")).toHaveCount(1);
  await expect(toastByTitle(page, "Persistent action")).toHaveCount(1);
});

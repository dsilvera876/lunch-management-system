import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const projectRoot = path.resolve(__dirname, "../..");
const START = Date.parse("2026-10-22T12:00:00Z");
const FIVE_MINUTES = 5 * 60 * 1000;

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

function createActivityBrowserBundle() {
  const react = readProjectFile("node_modules/react/cjs/react.production.js");
  const jsxRuntime = readProjectFile(
    "node_modules/react/cjs/react-jsx-runtime.production.js",
  );
  const scheduler = readProjectFile("node_modules/scheduler/cjs/scheduler.production.js");
  const reactDom = readProjectFile("node_modules/react-dom/cjs/react-dom.production.js");
  const reactDomClient = readProjectFile(
    "node_modules/react-dom/cjs/react-dom-client.production.js",
  );
  const activityClient = transpileCommonJs(
    readProjectFile("src/lib/user-activity-client.ts"),
    "user-activity-client.ts",
  );
  const reporter = transpileCommonJs(
    readProjectFile(
      "src/components/app-shell/authenticated-activity-reporter.tsx",
    ),
    "authenticated-activity-reporter.tsx",
  );
  const navigationStub = `
    "use strict";
    const React = require("react");
    let pathname = "/home";
    const listeners = new Set();
    exports.usePathname = function usePathname() {
      const [value, setValue] = React.useState(pathname);
      React.useEffect(() => {
        listeners.add(setValue);
        return () => listeners.delete(setValue);
      }, []);
      return value;
    };
    exports.useSearchParams = function useSearchParams() {
      return new URLSearchParams();
    };
    window.__activitySetPathname = (value) => {
      pathname = value;
      for (const listener of listeners) listener(value);
    };
  `;
  const supabaseStub = `
    "use strict";
    exports.createClient = function createClient() {
      return {
        rpc: async function rpc(name) {
          if (name !== "record_current_user_activity") {
            throw new Error("Unexpected RPC");
          }
          window.__activityRpcCalls += 1;
          if (window.__activityFailures > 0) {
            window.__activityFailures -= 1;
            return { data: null, error: { message: "unavailable" } };
          }
          return {
            data: [{
              recorded: true,
              last_active_at: new Date(Date.now()).toISOString(),
            }],
            error: null,
          };
        },
      };
    };
  `;
  const harness = transpileCommonJs(
    `
      import { createRoot } from "react-dom/client";
      import { AuthenticatedActivityReporter } from "reporter";

      const rootElement = document.getElementById("root");
      if (!rootElement) throw new Error("Activity test root is missing");
      const root = createRoot(rootElement);
      root.render(<AuthenticatedActivityReporter profileId="test-profile" />);
      window.__activityUnmount = () => root.unmount();
    `,
    "activity-harness.tsx",
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
      ${defineModule("next/navigation", navigationStub)}
      ${defineModule("@/lib/supabase/client", supabaseStub)}
      ${defineModule("@/lib/user-activity-client", activityClient)}
      ${defineModule("reporter", reporter)}
      ${defineModule("activity-harness", harness)}
      require("activity-harness");
    })();
  `;
}

async function mountReporter(page: Page) {
  await page.route("http://activity.test/", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><main id="root"></main></body></html>',
    });
  });
  await page.goto("http://activity.test/");
  await page.evaluate((start) => {
    Object.assign(window, {
      __activityNow: start,
      __activityFocused: true,
      __activityVisible: true,
      __activityRpcCalls: 0,
      __activityFailures: 0,
    });
    Date.now = () => (window as unknown as { __activityNow: number }).__activityNow;
    document.hasFocus = () =>
      (window as unknown as { __activityFocused: boolean }).__activityFocused;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () =>
        (window as unknown as { __activityVisible: boolean }).__activityVisible
          ? "visible"
          : "hidden",
    });
  }, START);
  await page.addScriptTag({ content: createActivityBrowserBundle() });
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(1);
}

test("reports only meaningful visible and focused activity and removes listeners", async ({
  page,
}) => {
  await mountReporter(page);

  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    window.__activitySetPathname?.("/account");
  });
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(1);

  await page.evaluate((interval) => {
    window.__activityNow += interval;
    window.__activityFocused = false;
    window.__activityVisible = false;
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    window.__activitySetPathname?.("/lunch");
  }, FIVE_MINUTES);
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(1);

  await page.evaluate(() => {
    window.__activityVisible = true;
    window.__activityFocused = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(2);

  await page.evaluate((interval) => {
    window.__activityNow += interval;
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", repeat: true, bubbles: true }),
    );
  }, FIVE_MINUTES);
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(2);

  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", repeat: false, bubbles: true }),
    );
  });
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(3);

  await page.evaluate((interval) => {
    window.__activityUnmount?.();
    window.__activityNow += interval;
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
  }, FIVE_MINUTES);
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(3);
});

test("recovers non-disruptively from an activity RPC failure", async ({ page }) => {
  await mountReporter(page);

  await page.evaluate((interval) => {
    window.__activityNow += interval;
    window.__activityFailures = 1;
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  }, FIVE_MINUTES);
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(2);

  await page.evaluate(() => {
    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(2);

  await page.evaluate(() => {
    window.__activityNow += 30_000;
    window.dispatchEvent(new Event("focus"));
  });
  await expect.poll(() => page.evaluate(() => window.__activityRpcCalls)).toBe(3);
});

declare global {
  interface Window {
    __activityNow: number;
    __activityFocused: boolean;
    __activityVisible: boolean;
    __activityRpcCalls: number;
    __activityFailures: number;
    __activitySetPathname?: (value: string) => void;
    __activityUnmount?: () => void;
  }
}

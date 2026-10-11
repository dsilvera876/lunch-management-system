import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { APP_TITLE, PAGE_TITLES, ROOT_TITLE_METADATA, pageMetadata } from "./page-titles";

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));

/** Routes that only redirect and never render a document of their own. */
const REDIRECT_ONLY_PAGES = new Set([
  "page.tsx",
  ["admin", "page.tsx"].join(sep),
  ["admin", "locations", "[id]", "page.tsx"].join(sep),
  ["lunch", "providers", "[id]", "page.tsx"].join(sep),
]);

function listPages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listPages(full);
    return entry === "page.tsx" ? [full] : [];
  });
}

describe("page titles", () => {
  it("formats every route title as 'Page Name | Lunch Management System'", () => {
    assert.equal(APP_TITLE, "Lunch Management System");
    assert.equal(ROOT_TITLE_METADATA.template, "%s | Lunch Management System");
    assert.equal(ROOT_TITLE_METADATA.default, APP_TITLE);
  });

  it("uses unique, non-empty, static page names", () => {
    const titles = Object.values(PAGE_TITLES);
    for (const title of titles) {
      assert.ok(title.trim().length > 0);
      assert.ok(!title.includes("|"), `${title} must not repeat the app suffix`);
      assert.ok(!/[@{}$]/.test(title), `${title} must not contain dynamic or personal data`);
    }
  });

  it("pageMetadata returns the mapped title", () => {
    assert.deepEqual(pageMetadata("login"), { title: "Sign in" });
    assert.deepEqual(pageMetadata("lunch"), { title: "Today's Order" });
  });

  it("root layout applies the title template", () => {
    const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
    assert.match(layout, /title: ROOT_TITLE_METADATA/);
  });

  it("every rendering route exports a title from the shared map", () => {
    const missing: string[] = [];
    for (const page of listPages(APP_DIR)) {
      const rel = relative(APP_DIR, page);
      if (REDIRECT_ONLY_PAGES.has(rel)) continue;
      const source = readFileSync(page, "utf8");
      const usesSharedMap =
        /export const metadata = pageMetadata\("\w+"\)/.test(source) ||
        (/export async function generateMetadata/.test(source) && /PAGE_TITLES|pageMetadata/.test(source));
      if (!usesSharedMap) missing.push(rel);
    }
    assert.deepEqual(missing, []);
  });

  it("dynamic routes never derive titles from records or profiles", () => {
    for (const page of listPages(APP_DIR)) {
      const source = readFileSync(page, "utf8");
      const match = source.match(/export async function generateMetadata[\s\S]*?\r?\n}\r?\n/);
      if (!match) continue;
      assert.doesNotMatch(match[0], /supabase|requireProfile|email|full_name|name:/i);
    }
  });

  it("update-password picks invite and recovery titles from the flow, not the user", () => {
    const source = readFileSync(join(APP_DIR, "account", "update-password", "page.tsx"), "utf8");
    assert.match(source, /pageMetadata\("inviteSetPassword"\)/);
    assert.match(source, /pageMetadata\("recoveryNewPassword"\)/);
    assert.match(source, /pageMetadata\("updatePassword"\)/);
  });
});

import assert from "node:assert/strict";
import { accessSync } from "node:fs";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function pathExists(relativePath: string): boolean {
  try {
    accessSync(new URL(relativePath, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

describe("legacy lunch days decommission", () => {
  it("removes legacy admin and staff ordering routes", () => {
    assert.equal(pathExists("../app/admin/lunch-days/page.tsx"), false);
    assert.equal(pathExists("../app/lunch/[id]/page.tsx"), false);
  });

  it("removes legacy auth helpers and denies legacy admin route access", () => {
    const auth = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
    const roles = readFileSync(new URL("./roles.ts", import.meta.url), "utf8");
    const navigation = readFileSync(new URL("./navigation.ts", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../app/lunch/actions.ts", import.meta.url), "utf8");

    assert.doesNotMatch(auth, /requireLegacyLunchDays/);
    assert.doesNotMatch(roles, /canManageLegacyLunchDays/);
    assert.match(navigation, /\/admin\/lunch-days/);
    assert.match(navigation, /return false/);
    assert.doesNotMatch(actions, /export async function submitLunchOrder/);
  });

  it("keeps modern ordering and operational lunch_days usage", () => {
    const lunchPage = readFileSync(
      new URL("../app/lunch/page.tsx", import.meta.url),
      "utf8",
    );
    const staffOrdering = readFileSync(
      new URL("./staff-ordering.ts", import.meta.url),
      "utf8",
    );
    const lunchActions = readFileSync(
      new URL("../app/lunch/actions.ts", import.meta.url),
      "utf8",
    );
    const providerDeletion = readFileSync(
      new URL("./provider-permanent-deletion.ts", import.meta.url),
      "utf8",
    );
    const migration = readFileSync(
      new URL(
        "../../supabase/migrations/20260925183000_decommission_legacy_manual_lunch_days.sql",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(lunchPage, /LunchOrderingShell/);
    assert.match(lunchPage, /loadProviderMenusForOrderDate/);
    assert.match(staffOrdering, /lunch_days/);
    assert.match(lunchActions, /submitLunchCheckout/);
    assert.match(providerDeletion, /"lunch_days"/);
    assert.match(migration, /alter column provider_id set not null/);
    assert.doesNotMatch(migration, /drop table public.lunch_days/);
  });

  it("documents provider snapshot fixture for DB order tests", () => {
    const fixture = readFileSync(
      new URL(
        "../../supabase/tests/support/submit_order_lunch_day_fixture.inc",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(fixture, /provider_id/);
    assert.doesNotMatch(fixture, /Legacy dev\/test lunch day fixture/);
  });
});

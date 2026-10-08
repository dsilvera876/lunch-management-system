import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  applyLocalStaffOrderingFixture,
  isLocalSupabaseApiUrl,
  loadLocalEnvFiles,
  probeSelfServiceOrderingState,
  readFixtureSnapshot,
  teardownLocalStaffOrderingFixture,
  isPlaywrightOrderingFixtureActive,
  E2E_STAFF1_OFFICE_LOCATION_ID,
} from "./e2e-ordering-fixture";
import { runLocalDbExec } from "./e2e-local-db";

describe("Staff E2E ordering fixture (local DB integration)", () => {
  before(() => {
    loadLocalEnvFiles();
    if (isPlaywrightOrderingFixtureActive()) {
      return;
    }
    teardownLocalStaffOrderingFixture();
  });

  after(() => {
    if (isPlaywrightOrderingFixtureActive()) {
      return;
    }
    teardownLocalStaffOrderingFixture();
  });

  it("opens self-service ordering for Jamaica today on loopback when today is a weekday", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    if (!url || !isLocalSupabaseApiUrl(url)) {
      return;
    }

    const existing = readFixtureSnapshot();
    if (existing && isPlaywrightOrderingFixtureActive()) {
      const probe = probeSelfServiceOrderingState(
        existing.orderDate,
        E2E_STAFF1_OFFICE_LOCATION_ID,
      );
      assert.equal(probe.isOpen, true);
      assert.notEqual(probe.isoWeekday, null);
      return;
    }

    let snapshot;
    try {
      snapshot = applyLocalStaffOrderingFixture();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Sat/Sun")) {
        return;
      }
      throw error;
    }

    assert.ok(readFixtureSnapshot());
    const probe = probeSelfServiceOrderingState(
      snapshot.orderDate,
      E2E_STAFF1_OFFICE_LOCATION_ID,
    );
    assert.equal(probe.isOpen, true);
    assert.notEqual(probe.isoWeekday, null);

    teardownLocalStaffOrderingFixture();
    assert.equal(readFixtureSnapshot(), null);
  });

  it("proves override_open makes a simulated holiday weekday a business day", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    if (!url || !isLocalSupabaseApiUrl(url)) {
      return;
    }

    const testDate = "2099-01-07";

    runLocalDbExec(`
      insert into private.business_calendar_entries (
        id, calendar_date, entry_type, scope, office_location_id, name, source,
        created_by, updated_by
      )
      values (
        '00000003-e2e0-4003-8003-000000000003'::uuid,
        '${testDate}'::date,
        'public_holiday',
        'global',
        null,
        'E2E holiday probe',
        'manual',
        '10000003-0003-4003-8003-000000000003'::uuid,
        '10000003-0003-4003-8003-000000000003'::uuid
      )
      on conflict (id) do nothing
    `);

    const closed = probeSelfServiceOrderingState(testDate, null);
    assert.equal(closed.isBusinessDay, false);

    runLocalDbExec(`
      insert into private.business_calendar_entries (
        id, calendar_date, entry_type, scope, office_location_id, name, source,
        created_by, updated_by
      )
      values (
        '00000004-e2e0-4004-8004-000000000004'::uuid,
        '${testDate}'::date,
        'override_open',
        'global',
        null,
        'E2E override probe',
        'manual',
        '10000003-0003-4003-8003-000000000003'::uuid,
        '10000003-0003-4003-8003-000000000003'::uuid
      )
      on conflict (id) do update set archived_at = null, entry_type = 'override_open'
    `);

    const openDay = probeSelfServiceOrderingState(testDate, null);
    assert.equal(openDay.isBusinessDay, true);
    assert.equal(openDay.isoWeekday, 3);

    runLocalDbExec(`
      delete from private.business_calendar_entries
      where id in (
        '00000003-e2e0-4003-8003-000000000003'::uuid,
        '00000004-e2e0-4004-8004-000000000004'::uuid
      )
    `);
  });

  it("proves Saturday stays closed for self-service even with override_open", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
    if (!url || !isLocalSupabaseApiUrl(url)) {
      return;
    }

    const saturday = "2099-01-10";

    runLocalDbExec(`
      insert into private.business_calendar_entries (
        id, calendar_date, entry_type, scope, office_location_id, name, source,
        created_by, updated_by
      )
      values (
        '00000005-e2e0-4005-8005-000000000005'::uuid,
        '${saturday}'::date,
        'override_open',
        'global',
        null,
        'E2E Saturday probe',
        'manual',
        '10000003-0003-4003-8003-000000000003'::uuid,
        '10000003-0003-4003-8003-000000000003'::uuid
      )
      on conflict (id) do update set archived_at = null, entry_type = 'override_open'
    `);

    const probe = probeSelfServiceOrderingState(saturday, null);
    assert.equal(probe.isoWeekday, null);
    assert.equal(probe.isBusinessDay, true);
    assert.equal(probe.isOpen, false);

    runLocalDbExec(`
      delete from private.business_calendar_entries
      where id = '00000005-e2e0-4005-8005-000000000005'::uuid
    `);
  });
});

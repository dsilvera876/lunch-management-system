import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  E2E_ORDER_CUTOFF,
  isLocalSupabaseApiUrl,
  planSelfServiceOrderingFix,
} from "./e2e-ordering-fixture";

describe("Staff E2E ordering fixture (pure)", () => {
  it("accepts only explicit loopback Supabase API hosts", () => {
    assert.equal(isLocalSupabaseApiUrl("http://localhost:55421"), true);
    assert.equal(isLocalSupabaseApiUrl("http://127.0.0.1:55421"), true);
    assert.equal(isLocalSupabaseApiUrl("http://[::1]:55421"), true);
    assert.equal(isLocalSupabaseApiUrl("http://staging.localhost:55421"), false);
    assert.equal(isLocalSupabaseApiUrl("http://app.local"), false);
    assert.equal(isLocalSupabaseApiUrl("http://192.168.1.10:55421"), false);
    assert.equal(isLocalSupabaseApiUrl("https://abcdef.supabase.co"), false);
  });

  it("plans calendar/cutoff/period fixes for a closed weekday", () => {
    const plan = planSelfServiceOrderingFix({
      isoWeekday: 3,
      isBusinessDayBeforeFixture: false,
      periodFinalizedBeforeFixture: true,
      cutoffBefore: "16:00:00",
    });
    assert.equal(plan.canBeOpenAfterFixture, true);
    assert.equal(plan.needsGlobalOverrideOpen, true);
    assert.equal(plan.needsCutoffExtension, true);
    assert.equal(plan.needsPeriodUnfinalize, true);
    assert.equal(plan.blockReason, undefined);
  });

  it("cannot open self-service ordering on Jamaica weekend even with calendar override", () => {
    const plan = planSelfServiceOrderingFix({
      isoWeekday: null,
      isBusinessDayBeforeFixture: false,
      periodFinalizedBeforeFixture: false,
      cutoffBefore: "16:00:00",
    });
    assert.equal(plan.canBeOpenAfterFixture, false);
    assert.equal(plan.blockReason, "iso_weekday");
    assert.equal(plan.needsGlobalOverrideOpen, true);
  });

  it("is idempotent when cutoff already extended", () => {
    const plan = planSelfServiceOrderingFix({
      isoWeekday: 2,
      isBusinessDayBeforeFixture: true,
      periodFinalizedBeforeFixture: false,
      cutoffBefore: E2E_ORDER_CUTOFF,
    });
    assert.equal(plan.needsCutoffExtension, false);
    assert.equal(plan.needsGlobalOverrideOpen, false);
  });
});

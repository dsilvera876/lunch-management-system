import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FinalizationBlockerDataError,
  loadFinancialFinalizationBlockers,
  parseFinancialFinalizationBlockerSummary,
  parseHrFinalizationBlockerOrders,
} from "./lunch-period-finalization-blockers";

const PERIOD_ID = "10000000-0000-4000-8000-000000000001";

function blocker(index = 1) {
  return {
    order_id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    category: "pending_delivery",
    reasons: {
      pending_delivery: true,
      open_issue: false,
      financial_hold: false,
    },
    employee_name: `Employee ${index}`,
    provider_name: "Provider",
    order_date: "2026-10-20",
    delivery_date: "2026-10-21",
    office_location_name: "Kingston",
    status: "submitted",
    delivery_state: "pending",
    financial_disposition: "chargeable",
    delivery_issue_type: null,
    delivery_resolution_type: null,
  };
}

function payload(blockers = [blocker()]) {
  return {
    period: {
      id: PERIOD_ID,
      label: "October",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      status: "open",
    },
    counts: {
      total: blockers.length,
      pending_delivery: blockers.length,
      open_issue: 0,
      financial_hold: 0,
    },
    blockers,
  };
}

describe("financial finalization blocker payload validation", () => {
  it("accepts an authoritative empty result", () => {
    const parsed = parseFinancialFinalizationBlockerSummary(payload([]));
    assert.equal(parsed.counts.total, 0);
    assert.deepEqual(parsed.blockers, []);
  });

  it("accepts more than 500 complete blocker records without truncation", () => {
    const blockers = Array.from({ length: 501 }, (_, index) => blocker(index + 1));
    const parsed = parseFinancialFinalizationBlockerSummary(payload(blockers));
    assert.equal(parsed.blockers.length, 501);
    assert.equal(parsed.counts.total, 501);
  });

  it("rejects null, malformed, duplicate, and count-inconsistent payloads", () => {
    assert.throws(() => parseFinancialFinalizationBlockerSummary(null), FinalizationBlockerDataError);
    assert.throws(
      () => parseFinancialFinalizationBlockerSummary({ ...payload(), blockers: null }),
      FinalizationBlockerDataError,
    );
    assert.throws(
      () => parseFinancialFinalizationBlockerSummary(payload([blocker(), blocker()])),
      FinalizationBlockerDataError,
    );
    assert.throws(
      () =>
        parseFinancialFinalizationBlockerSummary({
          ...payload(),
          counts: { ...payload().counts, total: 2 },
        }),
      FinalizationBlockerDataError,
    );
  });

  it("rejects records with missing reasons or confidential substitutes", () => {
    const invalid = { ...blocker(), reasons: undefined, employee_name: undefined };
    assert.throws(
      () => parseFinancialFinalizationBlockerSummary(payload([invalid as never])),
      FinalizationBlockerDataError,
    );
  });

  it("rejects a valid payload returned for a different requested period", async () => {
    const fakeSupabase = {
      rpc: async () => ({ data: payload([]), error: null }),
    };

    await assert.rejects(
      loadFinancialFinalizationBlockers(
        fakeSupabase as never,
        "10000000-0000-4000-8000-000000000099",
      ),
      FinalizationBlockerDataError,
    );
  });
});

describe("HR finalization blocker order validation", () => {
  it("rejects duplicate operational order identifiers", () => {
    const order = {
      blocker_category: "pending_delivery",
      blocker_reasons: {
        pending_delivery: true,
        open_issue: false,
        financial_hold: false,
      },
      id: "20000000-0000-4000-8000-000000000001",
      profile_id: "30000000-0000-4000-8000-000000000001",
      status: "submitted",
      delivery_state: "pending",
      financial_disposition: "chargeable",
      delivery_issue_type: null,
      delivery_resolution_type: null,
      actual_delivery_date: null,
      lunch_day_id: "40000000-0000-4000-8000-000000000001",
      created_at: "2026-10-20T12:00:00Z",
      updated_at: "2026-10-20T12:00:00Z",
      special_instructions: null,
      meal_quantity: null,
      is_late_order: false,
      office_location_name: "Kingston",
      office_location_address: null,
      employee_name: "Employee",
      late_order_created_by_name: null,
      provider_id: "50000000-0000-4000-8000-000000000001",
      provider_name: "Provider",
      order_date: "2026-10-20",
      delivery_date: "2026-10-21",
      hr_delivery_notes: null,
      snapshot_menu_items: [],
      items: [],
    };

    assert.throws(
      () =>
        parseHrFinalizationBlockerOrders({
          period: payload().period,
          orders: [order, order],
        }),
      FinalizationBlockerDataError,
    );
  });
});

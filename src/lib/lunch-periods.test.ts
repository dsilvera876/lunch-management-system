import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatLunchPeriodRange,
  getLatestLunchPeriod,
  getNextPeriodStartDate,
  isLatestLunchPeriod,
  orderDateBelongsToPeriod,
  validateFirstLunchPeriodInput,
  validateNextLunchPeriodInput,
} from "./lunch-periods";
import {
  canExportLunchPeriodSummaries,
  canManageLunchPeriods,
} from "./roles";
import { getNavForRole } from "./navigation";

const samplePeriods = [
  {
    id: "1",
    label: "Period 1",
    start_date: "2026-08-03",
    end_date: "2026-08-27",
    is_current: false,
    status: "open" as const,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "2",
    label: "Period 2",
    start_date: "2026-08-28",
    end_date: "2026-09-25",
    is_current: true,
    status: "open" as const,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  },
];

describe("formatLunchPeriodRange", () => {
  it("formats a non-month-boundary range", () => {
    assert.equal(formatLunchPeriodRange("2026-08-03", "2026-08-27"), "Aug 3 – Aug 27");
  });
});

describe("continuity helpers", () => {
  it("derives the next start date as previous end plus one day", () => {
    assert.equal(getNextPeriodStartDate("2026-08-27"), "2026-08-28");
  });

  it("identifies the latest lunch period by end date", () => {
    assert.equal(getLatestLunchPeriod(samplePeriods)?.id, "2");
    assert.equal(isLatestLunchPeriod(samplePeriods[1], samplePeriods), true);
    assert.equal(isLatestLunchPeriod(samplePeriods[0], samplePeriods), false);
  });
});

describe("validateLunchPeriodInput", () => {
  it("rejects invalid first-period date ranges", () => {
    assert.equal(
      validateFirstLunchPeriodInput({
        label: "August",
        startDate: "2026-08-27",
        endDate: "2026-08-03",
      }),
      "Start date must be on or before end date.",
    );
  });

  it("rejects next-period end dates before the derived start", () => {
    assert.equal(
      validateNextLunchPeriodInput({
        label: "September",
        endDate: "2026-08-27",
        derivedStartDate: "2026-08-28",
      }),
      "End date must be on or after the derived start date.",
    );
  });

  it("accepts valid next-period input", () => {
    assert.equal(
      validateNextLunchPeriodInput({
        label: "September",
        endDate: "2026-09-25",
        derivedStartDate: "2026-08-28",
      }),
      null,
    );
  });
});

describe("order-date membership", () => {
  it("uses order date rather than delivery date", () => {
    const period = { start_date: "2026-08-03", end_date: "2026-08-21" };

    assert.equal(orderDateBelongsToPeriod("2026-08-21", period), true);
    assert.equal(orderDateBelongsToPeriod("2026-08-24", period), false);
  });

  it("matches Friday order date even when delivery is later", () => {
    const period = { start_date: "2026-08-03", end_date: "2026-08-21" };
    const fridayOrderDate = "2026-08-21";
    const mondayDeliveryDate = "2026-08-24";

    assert.equal(orderDateBelongsToPeriod(fridayOrderDate, period), true);
    assert.equal(orderDateBelongsToPeriod(mondayDeliveryDate, period), false);
  });
});

describe("lunch period capabilities", () => {
  it("allows Accounts, Admin, and Owner to manage lunch periods", () => {
    assert.equal(canManageLunchPeriods("accounts"), true);
    assert.equal(canManageLunchPeriods("admin"), true);
    assert.equal(canManageLunchPeriods("owner"), true);
    assert.equal(canManageLunchPeriods("hr"), false);
    assert.equal(canManageLunchPeriods("staff"), false);
  });

  it("allows Accounts, Admin, and Owner export placeholders only", () => {
    assert.equal(canExportLunchPeriodSummaries("accounts"), true);
    assert.equal(canExportLunchPeriodSummaries("admin"), true);
    assert.equal(canExportLunchPeriodSummaries("owner"), true);
    assert.equal(canExportLunchPeriodSummaries("hr"), false);
    assert.equal(canExportLunchPeriodSummaries("staff"), false);
  });
});

describe("navigation visibility", () => {
  it("shows lunch periods to Accounts, Admin, and Owner only", () => {
    assert.ok(!getNavForRole("hr").flatMap((group) => group.items).some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(getNavForRole("accounts").find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(getNavForRole("admin").find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(getNavForRole("owner").find((g) => g.label === "ACCOUNTS")?.items.some((item) => item.href === "/admin/lunch-periods"));
    assert.ok(!getNavForRole("staff").find((g) => g.label === "HR TOOLS"));
    assert.ok(!getNavForRole("staff").flatMap((g) => g.items).some((item) => item.href === "/admin/lunch-periods"));
  });
});

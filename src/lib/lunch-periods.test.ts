import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countLunchPeriodDays,
  formatLunchPeriodAdminDate,
  formatLunchPeriodCompactAdminRange,
  formatLunchPeriodRange,
  getLatestLunchPeriod,
  getLunchPeriodAdminStatus,
  getNextPeriodStartDate,
  isLatestLunchPeriod,
  isLunchPeriodDatesLocked,
  orderDateBelongsToPeriod,
  validateFirstLunchPeriodInput,
  validateNextLunchPeriodInput,
} from "./lunch-periods";
import { readFileSync } from "node:fs";
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

  it("formats admin dates with year", () => {
    assert.equal(formatLunchPeriodAdminDate("2026-08-15"), "Aug 15, 2026");
  });

  it("counts inclusive calendar days in a period for admin display", () => {
    assert.equal(countLunchPeriodDays("2026-08-15", "2026-09-18"), 35);
  });

  it("formats compact admin range for same month and year", () => {
    assert.equal(
      formatLunchPeriodCompactAdminRange("2026-09-01", "2026-09-30"),
      "Sep 1 – Sep 30, 2026",
    );
  });

  it("formats compact admin range across months in one year", () => {
    assert.equal(
      formatLunchPeriodCompactAdminRange("2026-08-15", "2026-09-18"),
      "Aug 15 – Sep 18, 2026",
    );
  });

  it("formats compact admin range across years with both years shown", () => {
    assert.equal(
      formatLunchPeriodCompactAdminRange("2026-12-18", "2027-01-22"),
      "Dec 18, 2026 – Jan 22, 2027",
    );
  });
});

describe("lunch period admin presentation", () => {
  it("marks only the current period as active", () => {
    assert.equal(getLunchPeriodAdminStatus(samplePeriods[1]), "active");
    assert.equal(getLunchPeriodAdminStatus(samplePeriods[0]), "locked");
  });

  it("locks historical period dates when a later period exists", () => {
    assert.equal(isLunchPeriodDatesLocked(samplePeriods[0], samplePeriods), true);
    assert.equal(isLunchPeriodDatesLocked(samplePeriods[1], samplePeriods), false);
  });

  it("wires export and append UI on the lunch periods page", () => {
    const pageSource = readFileSync(
      new URL("../app/admin/lunch-periods/page.tsx", import.meta.url),
      "utf8",
    );
    const summarySource = readFileSync(
      new URL("../components/admin/lunch-periods/current-lunch-period-summary.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pageSource, /CurrentLunchPeriodSummary/);
    assert.match(pageSource, /AppendLunchPeriodCard/);
    assert.match(pageSource, /LunchPeriodsTable/);
    assert.match(summarySource, /admin\/financials\/export\?periodId=/);
    assert.match(summarySource, /Export to Excel/);
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

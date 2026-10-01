import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatTodayMenuWorkerLogLine } from "@/lib/process-today-menu-notifications";

describe("today menu worker logging", () => {
  it("includes operational diagnostics without email content", () => {
    const line = formatTodayMenuWorkerLogLine(
      {
        action: "skipped",
        reason: "no_eligible_recipients",
        orderDate: "2026-10-01",
        sendTime: "08:00:00",
        windowOpen: true,
        candidates: 12,
        eligibleCount: 0,
        skipReasonCounts: { closed_business_day: 12 },
      },
      { inserted: 0, queued: 0, skipped: 0, failures: 0 },
    );

    assert.match(line, /order_date=2026-10-01/);
    assert.match(line, /closed_business_day/);
    assert.match(line, /eligible=0/);
    assert.doesNotMatch(line, /@/);
  });
});

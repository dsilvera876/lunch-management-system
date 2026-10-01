import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDeadlineReminderWorkerLogLine } from "@/lib/process-deadline-reminder-notifications";

describe("deadline reminder worker logging", () => {
  it("includes operational diagnostics without email content", () => {
    const line = formatDeadlineReminderWorkerLogLine(
      {
        action: "skipped",
        reason: "no_eligible_recipients",
        orderDate: "2099-01-10",
        sendTime: "17:30:00",
        windowOpen: true,
        candidates: 9,
        eligibleCount: 0,
        skipReasonCounts: { already_ordered: 5, preference_disabled: 1 },
      },
      { inserted: 0, queued: 0, skipped: 0, failures: 0, renderFailures: 0 },
    );

    assert.match(line, /order_date=2099-01-10/);
    assert.match(line, /already_ordered/);
    assert.match(line, /eligible=0/);
    assert.doesNotMatch(line, /@/);
  });
});

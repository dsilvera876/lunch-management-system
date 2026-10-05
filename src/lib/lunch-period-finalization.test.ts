import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isLunchPeriodEligibleForFinalization,
  lunchPeriodFinalizationEligibilityMessage,
} from "./lunch-period-finalization";

describe("lunch period finalization eligibility", () => {
  it("allows finalization when period end is before Jamaica today", () => {
    assert.equal(
      isLunchPeriodEligibleForFinalization("2026-10-03", "2026-10-05"),
      true,
    );
  });

  it("blocks finalization when period end is Jamaica today", () => {
    assert.equal(
      isLunchPeriodEligibleForFinalization("2026-10-05", "2026-10-05"),
      false,
    );
  });

  it("blocks finalization when period end is after Jamaica today", () => {
    assert.equal(
      isLunchPeriodEligibleForFinalization("2026-10-10", "2026-10-05"),
      false,
    );
  });

  it("formats the ineligible-period explanation", () => {
    assert.equal(
      lunchPeriodFinalizationEligibilityMessage("2026-10-05"),
      "This period can be finalized after Oct 5, 2026.",
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("HR pending staff late-order requests panel", () => {
  it("shows Fulfill only when fulfillment window is open", () => {
    const panel = readFileSync(
      new URL(
        "../components/admin/late-orders/pending-staff-late-order-requests.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(panel, /fulfillmentWindowOpen/);
    assert.match(panel, /request\.fulfillmentWindowOpen \?/);
    assert.match(panel, /Fulfill/);
    assert.match(panel, /Decline/);
  });

  it("does not add card-level helper text for closed fulfillment windows", () => {
    const panel = readFileSync(
      new URL(
        "../components/admin/late-orders/pending-staff-late-order-requests.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    assert.doesNotMatch(panel, /window (is )?closed/i);
    assert.doesNotMatch(panel, /deadline has passed/i);
    assert.doesNotMatch(panel, /cannot fulfill/i);
    assert.doesNotMatch(panel, /role="status"/);
  });

  it("maps fulfillment_window_open from the HR list RPC on the server page", () => {
    const page = readFileSync(
      new URL("../app/admin/late-orders/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /list_pending_staff_late_order_requests_for_hr/);
    assert.match(page, /fulfillment_window_open/);
    assert.match(page, /fulfillmentWindowOpen/);
  });
});

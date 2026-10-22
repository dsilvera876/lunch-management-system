import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatLastActive,
  readAuthoritativeLastActiveAt,
} from "./user-last-active";

describe("user last activity presentation", () => {
  it("formats the authoritative timestamp in Jamaica local time", () => {
    assert.equal(
      formatLastActive("2026-10-22T18:15:00Z"),
      "Oct 22, 2026, 1:15 PM",
    );
  });

  it("uses the empty-state label only for an authoritative null", () => {
    assert.equal(readAuthoritativeLastActiveAt({ last_active_at: null }), null);
    assert.equal(formatLastActive(null), "Not yet recorded");
  });

  it("rejects missing and malformed directory values", () => {
    assert.throws(
      () => readAuthoritativeLastActiveAt({}),
      /missing last_active_at/,
    );
    assert.throws(
      () => readAuthoritativeLastActiveAt({ last_active_at: "invalid" }),
      /invalid last_active_at/,
    );
  });
});

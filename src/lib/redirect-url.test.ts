import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendSearchParams } from "./redirect-url";

const periodId = "2359f0d0-2f74-42b7-9827-e903ad1da088";

describe("appendSearchParams", () => {
  it("adds success parameter alongside periodId", () => {
    assert.equal(
      appendSearchParams(`/admin/financials?periodId=${periodId}`, {
        "subsidy-updated": "1",
      }),
      `/admin/financials?periodId=${periodId}&subsidy-updated=1`,
    );
  });

  it("adds success parameter without periodId", () => {
    assert.equal(
      appendSearchParams("/admin/financials", { "subsidy-updated": "1" }),
      "/admin/financials?subsidy-updated=1",
    );
  });

  it("adds error parameter alongside periodId", () => {
    assert.equal(
      appendSearchParams(`/admin/financials?periodId=${periodId}`, {
        "subsidy-error": "update",
      }),
      `/admin/financials?periodId=${periodId}&subsidy-error=update`,
    );
  });

  it("includes only one query delimiter", () => {
    const url = appendSearchParams(`/admin/financials?periodId=${periodId}`, {
      finalized: "1",
    });

    assert.equal((url.match(/\?/g) ?? []).length, 1);
  });

  it("preserves existing parameters safely", () => {
    assert.equal(
      appendSearchParams(
        `/admin/financials?periodId=${periodId}&subsidy-error=invalid`,
        { "subsidy-updated": "1" },
      ),
      `/admin/financials?periodId=${periodId}&subsidy-error=invalid&subsidy-updated=1`,
    );
  });
});

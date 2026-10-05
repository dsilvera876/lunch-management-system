import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("staff order cancellation UX", () => {
  it("uses a single post-cancel confirmation message", () => {
    const page = readFileSync(
      new URL("../app/lunch/orders/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /showCancelConfirmation/);
    assert.match(page, /ORDER_CANCELLED_CONFIRMATION_TITLE/);
    assert.match(page, /ORDER_CANCELLED_CONFIRMATION_DETAIL/);
    assert.doesNotMatch(page, /query\.cancelled &&[\s\S]*This order was cancelled/);
    assert.doesNotMatch(page, /This order has been cancelled/);
  });

  it("exposes My orders as accessible navigation on Today's Order page", () => {
    const lunchPage = readFileSync(
      new URL("../app/lunch/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(lunchPage, /href="\/my-orders"/);
    assert.match(lunchPage, /aria-label="View my orders"/);
    assert.match(lunchPage, /linkButtonClass\("secondary"\)/);
  });

  it("exposes My orders as accessible navigation on order detail", () => {
    const page = readFileSync(
      new URL("../app/lunch/orders/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /href="\/my-orders"/);
    assert.match(page, /aria-label="View my orders"/);
  });
});

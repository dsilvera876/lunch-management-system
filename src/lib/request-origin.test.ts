import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getApplicationOrigin } from "./request-origin";

describe("getApplicationOrigin", () => {
  const originalOrigin = process.env.APP_ORIGIN;

  afterEach(() => {
    if (originalOrigin === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = originalOrigin;
    }
  });

  it("prefers APP_ORIGIN over localhost fallbacks", () => {
    process.env.APP_ORIGIN = "https://lunch-staging.example.com";

    assert.equal(getApplicationOrigin(), "https://lunch-staging.example.com");
  });

  it("does not emit localhost when APP_ORIGIN is configured for staging", () => {
    process.env.APP_ORIGIN = "https://lunch-staging.example.com";

    const origin = getApplicationOrigin();
    assert.doesNotMatch(origin, /localhost|127\.0\.0\.1/);
  });
});

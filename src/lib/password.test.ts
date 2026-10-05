import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MIN_PASSWORD_LENGTH, validatePasswordUpdate } from "./password";

describe("password validation", () => {
  it("aligns local Supabase config minimum length to 8", () => {
    const config = readFileSync(
      new URL("../../supabase/config.toml", import.meta.url),
      "utf8",
    );
    assert.match(config, /minimum_password_length = 8/);
  });

  it("requires minimum 8 characters", () => {
    assert.equal(MIN_PASSWORD_LENGTH, 8);

    const short = validatePasswordUpdate("1234567", "1234567");
    assert.equal(short.ok, false);
    if (!short.ok) {
      assert.equal(short.code, "policy");
    }

    const ok = validatePasswordUpdate("12345678", "12345678");
    assert.equal(ok.ok, true);
  });
});

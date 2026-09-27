import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseClassifySignupEmailResult,
  parseRequestExternalSignupResult,
} from "./signup";

describe("signup RPC result parsing", () => {
  it("parses company and external classification paths", () => {
    assert.deepEqual(parseClassifySignupEmailResult({ ok: true, path: "company" }), {
      ok: true,
      path: "company",
    });
    assert.deepEqual(parseClassifySignupEmailResult({ ok: true, path: "external" }), {
      ok: true,
      path: "external",
    });
    assert.equal(parseClassifySignupEmailResult({ ok: false, code: "invalid_email" }).ok, false);
  });

  it("parses external signup request responses", () => {
    assert.deepEqual(parseRequestExternalSignupResult({ ok: true, code: "submitted" }), {
      ok: true,
      code: "submitted",
    });
    assert.deepEqual(
      parseRequestExternalSignupResult({
        ok: false,
        code: "unavailable",
        message: "blocked",
      }),
      {
        ok: false,
        code: "unavailable",
        message: "blocked",
      },
    );
  });
});

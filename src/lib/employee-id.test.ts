import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapSetEmployeeIdError,
  validateEmployeeIdField,
} from "./employee-id";

describe("employee ID validation", () => {
  it("accepts blank and four-digit values", () => {
    assert.deepEqual(validateEmployeeIdField(""), { ok: true, value: null });
    assert.deepEqual(validateEmployeeIdField("0054"), { ok: true, value: "0054" });
    assert.deepEqual(validateEmployeeIdField("1123"), { ok: true, value: "1123" });
  });

  it("rejects malformed values without coercion", () => {
    assert.equal(validateEmployeeIdField("54").ok, false);
    assert.equal(validateEmployeeIdField("A054").ok, false);
    assert.equal(validateEmployeeIdField("12345").ok, false);
    assert.equal(validateEmployeeIdField("12 34").ok, false);
    assert.equal(validateEmployeeIdField(" 0054").ok, false);
  });

  it("maps duplicate backend errors", () => {
    assert.equal(
      mapSetEmployeeIdError(
        "Employee ID 0054 is already assigned to another user",
      ),
      "Employee ID 0054 is already assigned to another user.",
    );
  });
});

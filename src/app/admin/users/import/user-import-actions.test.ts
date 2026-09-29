import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("user import preview action wiring", () => {
  it("maps parse failures before RPC and logs RPC failures without exposing raw errors", () => {
    const source = readFileSync(
      new URL("./user-import-actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /mapUserImportParseError/);
    assert.match(source, /mapUserImportRpcError/);
    assert.match(source, /unexpectedUserImportValidationMessage/);
    assert.match(source, /console\.error\("\[bulk-user-import\] create_user_import_batch failed"/);
    assert.doesNotMatch(source, /Unable to validate import file\./);
    assert.match(source, /employee_id_import_note/);
    assert.match(source, /employee_id_normalized_from/);
  });
});

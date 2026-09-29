import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PostgrestError } from "@supabase/supabase-js";

import {
  mapUserImportParseError,
  mapUserImportRpcError,
  unexpectedUserImportValidationMessage,
  userImportFileTooLargeMessage,
} from "@/lib/user-import-messages";

describe("user import messages", () => {
  it("maps parse and RPC failures to HR-friendly copy", () => {
    assert.equal(
      mapUserImportParseError("CSV contains no data rows."),
      "This CSV does not contain any employee rows.",
    );
    assert.match(userImportFileTooLargeMessage(), /512 KB/);
    assert.equal(
      mapUserImportRpcError({
        message:
          'new row for relation "user_import_rows" violates check constraint "user_import_rows_employee_id_format_check"',
        details: "",
        hint: "",
        code: "23514",
        name: "PostgrestError",
      } as PostgrestError),
      "Employee ID must contain exactly 4 digits.",
    );
    assert.equal(
      unexpectedUserImportValidationMessage(),
      "Unable to validate this CSV right now. Please try again.",
    );
  });
});

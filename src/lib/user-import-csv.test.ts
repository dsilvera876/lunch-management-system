import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  USER_IMPORT_CSV_TEMPLATE,
  applyCrossRowImportValidation,
  parseUserImportCsv,
} from "@/lib/user-import-csv";

describe("user import CSV", () => {
  it("parses BOM, quoted commas, and preserves employee IDs", () => {
    const csv = `\uFEFFfull_name,email,employee_id
"Brown, Jane",jane@company.com,0054
Michael,michael@gmail.com,1123
`;

    const parsed = parseUserImportCsv(csv);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0]?.full_name, "Brown, Jane");
    assert.equal(parsed.rows[0]?.employee_id, "0054");
  });

  it("rejects missing headers and malformed files", () => {
    assert.equal(parseUserImportCsv("email\na@b.com").ok, false);
    assert.equal(parseUserImportCsv("full_name,email\n").ok, false);
  });

  it("detects duplicate email and employee ID within file", () => {
    const rows = [
      { rowNumber: 2, full_name: "A", email: "dup@test.local", employee_id: "" },
      { rowNumber: 3, full_name: "B", email: "DUP@test.local", employee_id: "" },
      { rowNumber: 4, full_name: "C", email: "c@test.local", employee_id: "0099" },
      { rowNumber: 5, full_name: "D", email: "d@test.local", employee_id: "0099" },
    ];

    const errors = applyCrossRowImportValidation(rows);
    assert.ok(errors.get(2));
    assert.ok(errors.get(3));
    assert.ok(errors.get(4));
    assert.ok(errors.get(5));
  });

  it("ships a downloadable template with guidance columns", () => {
    assert.match(USER_IMPORT_CSV_TEMPLATE, /full_name,email,employee_id/);
    assert.match(USER_IMPORT_CSV_TEMPLATE, /0054/);
  });
});

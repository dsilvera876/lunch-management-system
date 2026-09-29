import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  USER_IMPORT_CSV_TEMPLATE,
  USER_IMPORT_HEADERS,
  applyCrossRowImportValidation,
  normalizeBulkImportEmployeeId,
  parseUserImportCsv,
  validateBulkImportEmail,
} from "@/lib/user-import-csv";
import {
  assertUserImportTemplateHeaders,
  mapUserImportParseError,
} from "@/lib/user-import-messages";

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

  it("round-trips the downloadable template headers through the production parser", () => {
    assert.match(USER_IMPORT_CSV_TEMPLATE, /full_name,email,employee_id/);
    assert.equal(assertUserImportTemplateHeaders(USER_IMPORT_CSV_TEMPLATE), true);

    const parsed = parseUserImportCsv(USER_IMPORT_CSV_TEMPLATE);
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;

    assert.equal(
      mapUserImportParseError(parsed.error),
      "This CSV does not contain any employee rows.",
    );
  });

  it("recognizes required headers on a headers-only file with BOM and CRLF", () => {
    const csv = `\uFEFFfull_name,email,employee_id\r\n\r\n`;
    assert.equal(assertUserImportTemplateHeaders(csv), true);
    const parsed = parseUserImportCsv(csv);
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(mapUserImportParseError(parsed.error), "This CSV does not contain any employee rows.");
  });

  it("maps missing header errors to friendly copy", () => {
    const parsed = parseUserImportCsv("email\na@b.com");
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(mapUserImportParseError(parsed.error), /missing required columns/i);
    assert.match(mapUserImportParseError(parsed.error), /Name/);
    assert.match(mapUserImportParseError(parsed.error), /Employee ID/);
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

  it("keeps template headers aligned with USER_IMPORT_HEADERS", () => {
    const headerLine = USER_IMPORT_CSV_TEMPLATE.trim().split("\n")[0] ?? "";
    const fields = headerLine.split(",").map((field) => field.trim());
    assert.deepEqual(fields, [...USER_IMPORT_HEADERS]);
  });

  it("normalizes bulk import Employee IDs to four digits", () => {
    assert.deepEqual(normalizeBulkImportEmployeeId("7"), {
      ok: true,
      value: "0007",
      normalizedFrom: "7",
    });
    assert.deepEqual(normalizeBulkImportEmployeeId("54"), {
      ok: true,
      value: "0054",
      normalizedFrom: "54",
    });
    assert.deepEqual(normalizeBulkImportEmployeeId("534"), {
      ok: true,
      value: "0534",
      normalizedFrom: "534",
    });
    assert.deepEqual(normalizeBulkImportEmployeeId("1123"), { ok: true, value: "1123" });
    assert.deepEqual(normalizeBulkImportEmployeeId("  54  "), {
      ok: true,
      value: "0054",
      normalizedFrom: "54",
    });
    assert.deepEqual(normalizeBulkImportEmployeeId(""), { ok: true, value: null });
    assert.deepEqual(normalizeBulkImportEmployeeId("   "), { ok: true, value: null });
  });

  it("rejects invalid bulk import Employee ID shapes", () => {
    for (const raw of ["12345", "12A4", "54.0", "-54", "5e1"]) {
      const result = normalizeBulkImportEmployeeId(raw);
      assert.equal(result.ok, false);
    }
  });

  it("parses Excel-style short Employee IDs and flags normalization", () => {
    const parsed = parseUserImportCsv(`full_name,email,employee_id
Pat,pat@example.test,54
`);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.rows[0]?.employee_id, "0054");
    assert.equal(parsed.rows[0]?.employee_id_normalized_from, "54");
  });

  it("treats 54 and 0054 as duplicate Employee IDs after normalization", () => {
    const rows = [
      { rowNumber: 2, full_name: "A", email: "a@test.local", employee_id: "0054" },
      { rowNumber: 3, full_name: "B", email: "b@test.local", employee_id: "54" },
    ];
    const errors = applyCrossRowImportValidation(rows);
    assert.ok(errors.get(2));
    assert.ok(errors.get(3));
    assert.match(String(errors.get(2)), /Duplicate Employee ID 0054/);
  });

  it("rejects malformed email addresses during CSV parse before import", () => {
    assert.equal(validateBulkImportEmail("not-an-email").ok, false);
    assert.equal(validateBulkImportEmail("missing-at.example.com").ok, false);
    assert.equal(validateBulkImportEmail("bad@domain").ok, false);

    const parsed = parseUserImportCsv(`full_name,email,employee_id
Pat,not-an-email,0054
`);
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.error, /Email address is invalid/);
  });

  it("treats 7 and 0007 as duplicate Employee IDs after normalization", () => {
    const parsed = parseUserImportCsv(`full_name,email,employee_id
A,a@test.local,7
B,b@test.local,0007
`);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const errors = applyCrossRowImportValidation(parsed.rows);
    assert.ok(errors.get(2));
    assert.ok(errors.get(3));
  });
});

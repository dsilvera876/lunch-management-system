import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EMPLOYEE_PICKER_EMPTY_MESSAGE,
  filterEmployeesForPicker,
  sortEmployeesForPicker,
  type EmployeePickerOption,
} from "./employee-picker";
import { computeEmployeePickerDropdownPosition } from "./employee-picker-portal";

const sample: EmployeePickerOption[] = [
  { id: "2", name: "Zara Adams", email: "zara.adams@company.com" },
  { id: "1", name: "John Brown", email: "john.brown@company.com" },
  { id: "3", name: "Amy Chen", email: "amy.chen@company.com" },
];

describe("employee picker", () => {
  it("sorts employees alphabetically by display name", () => {
    const sorted = sortEmployeesForPicker(sample).map((employee) => employee.name);
    assert.deepEqual(sorted, ["Amy Chen", "John Brown", "Zara Adams"]);
  });

  it("filters by name case-insensitively", () => {
    const results = filterEmployeesForPicker(sample, "JOHN");
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, "1");
    assert.equal(results[0]?.name, "John Brown");
  });

  it("filters by email case-insensitively", () => {
    const results = filterEmployeesForPicker(sample, "ZARA.ADAMS");
    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, "2");
  });

  it("returns empty list when nothing matches and keeps empty message constant", () => {
    assert.equal(filterEmployeesForPicker(sample, "no-match").length, 0);
    assert.equal(EMPLOYEE_PICKER_EMPTY_MESSAGE, "No employees found.");
  });

  function triggerRect(top: number, height = 40, left = 24, width = 300): DOMRect {
    return {
      top,
      bottom: top + height,
      left,
      right: left + width,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    };
  }

  it("opens below when there is sufficient room even if above has slightly more space", () => {
    const position = computeEmployeePickerDropdownPosition(
      triggerRect(400),
      { width: 1280, height: 800 },
    );

    assert.equal(position.placement, "below");
    assert.equal(position.top, 446);
    assert.equal(position.listMaxHeight, 256);
  });

  it("opens below the trigger at the normal desktop gap when room is ample", () => {
    const position = computeEmployeePickerDropdownPosition(
      triggerRect(100),
      { width: 1280, height: 800 },
    );

    assert.equal(position.placement, "below");
    assert.equal(position.top, 146);
    assert.equal(position.left, 24);
    assert.equal(position.width, 300);
  });

  it("opens above when room below is insufficient and above has more usable space", () => {
    const position = computeEmployeePickerDropdownPosition(
      triggerRect(720),
      { width: 1280, height: 800 },
    );

    assert.equal(position.placement, "above");
    assert.ok(position.top < 720);
    assert.ok(position.top >= 8);
  });

  it("stays below with constrained list height when both sides are tight", () => {
    const position = computeEmployeePickerDropdownPosition(
      triggerRect(180, 40, 16, 280),
      { width: 400, height: 400 },
    );

    assert.equal(position.placement, "below");
    assert.equal(position.top, 226);
    assert.ok(position.listMaxHeight < 256);
    assert.ok(position.listMaxHeight >= 96);
    assert.ok(
      position.top + 56 + position.listMaxHeight <= 400 - 8,
    );
  });

  it("portals the dropdown to document.body with fixed positioning", () => {
    const pickerSource = readFileSync(
      new URL("../components/employee-picker.tsx", import.meta.url),
      "utf8",
    );

    assert.match(pickerSource, /createPortal/);
    assert.match(pickerSource, /document\.body/);
    assert.match(pickerSource, /position: "fixed"/);
    assert.match(pickerSource, /getBoundingClientRect/);
    assert.doesNotMatch(pickerSource, /absolute left-0 right-0 top-\[calc\(100%/);
  });

  it("wires searchable employee picker in late orders without changing profile query filters", () => {
    const page = readFileSync(
      new URL("../app/admin/late-orders/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/late-orders-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /list_late_order_employee_profiles/);
    assert.match(page, /Unable to load employees for late orders/);
    assert.doesNotMatch(page, /\.eq\("role"/);
    assert.match(workspace, /EmployeePicker/);
    assert.doesNotMatch(workspace, /setProfileId\(event\.target\.value\)/);
    assert.match(workspace, /onValueChange=\{setProfileId\}/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  resolveUserImportResultsPhase,
  userImportResultsDescription,
  userImportResultsHeading,
  userImportResultsProgressIndeterminate,
  userImportResultsShowsActivity,
} from "./user-import-results-presentation";

describe("user import results presentation", () => {
  it("maps queued with zero processed rows to preparing state", () => {
    assert.equal(resolveUserImportResultsPhase("queued", 0), "preparing");
    assert.equal(userImportResultsHeading("preparing"), "Getting your import ready…");
    assert.match(userImportResultsDescription("preparing"), /update automatically/i);
    assert.equal(userImportResultsShowsActivity("preparing"), true);
    assert.equal(userImportResultsProgressIndeterminate("preparing"), true);
  });

  it("maps processing to in-progress copy and determinate progress", () => {
    assert.equal(resolveUserImportResultsPhase("processing", 3), "processing");
    assert.equal(resolveUserImportResultsPhase("queued", 1), "processing");
    assert.equal(userImportResultsHeading("processing"), "Import in progress…");
    assert.match(userImportResultsDescription("processing"), /update automatically/i);
    assert.equal(userImportResultsShowsActivity("processing"), true);
    assert.equal(userImportResultsProgressIndeterminate("processing"), false);
  });

  it("maps completed without waiting indicator", () => {
    assert.equal(resolveUserImportResultsPhase("completed", 6), "completed");
    assert.match(userImportResultsDescription("completed"), /finished/i);
    assert.equal(userImportResultsShowsActivity("completed"), false);
    assert.equal(userImportResultsProgressIndeterminate("completed"), false);
  });

  it("maps failed batch without waiting indicator", () => {
    assert.equal(resolveUserImportResultsPhase("failed", 0), "failed");
    assert.equal(userImportResultsShowsActivity("failed"), false);
    assert.equal(userImportResultsProgressIndeterminate("failed"), false);
    assert.match(userImportResultsDescription("failed"), /try importing again/i);
  });

  it("wires bulk import workspace accessibility and motion-safe activity UI", () => {
    const workspace = readFileSync(
      new URL("../components/admin/hr-bulk-import-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.match(workspace, /aria-live="polite"/);
    assert.match(workspace, /userImportResultsHeading/);
    assert.match(workspace, /\{resultsHeading\}/);
    assert.match(workspace, /\{resultsDescription\}/);
    assert.match(workspace, /motion-reduce:animate-none/);
    assert.match(workspace, /data-testid="bulk-import-activity-indicator"/);
    assert.match(workspace, /data-testid="bulk-import-indeterminate-progress"/);
    assert.doesNotMatch(workspace, /running in the background/i);
    assert.doesNotMatch(workspace, /every few seconds/i);
  });
});

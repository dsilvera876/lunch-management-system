import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyUserImportRuntimeError,
  logUserImportRuntimeError,
  sanitizeUserImportResultMessage,
  userImportRuntimeUserFacingMessages,
} from "@/lib/user-import-runtime-errors";

describe("user import runtime errors", () => {
  it("maps APP_ORIGIN configuration errors to SYSTEM_CONFIGURATION copy", () => {
    const classified = classifyUserImportRuntimeError({
      technicalMessage: "APP_ORIGIN must be configured for server-side auth redirects",
    });
    assert.equal(classified.code, "SYSTEM_CONFIGURATION");
    assert.equal(classified.userMessage, userImportRuntimeUserFacingMessages.SYSTEM_CONFIGURATION);
    assert.doesNotMatch(classified.userMessage, /APP_ORIGIN/i);
  });

  it("sanitizes Supabase, Auth, and Postgres errors", () => {
    for (const technical of [
      'duplicate key value violates unique constraint "profiles_pkey"',
      "P0001: Employee ID management access required",
      "AuthApiError: User not allowed",
      "PGRST116: JSON object requested, multiple (or no) rows returned",
    ]) {
      const userMessage = sanitizeUserImportResultMessage(technical, { status: "failed" });
      assert.doesNotMatch(userMessage, /PGRST|P0001|AuthApiError|violates/i);
      assert.equal(userMessage, userImportRuntimeUserFacingMessages.UNKNOWN);
    }
  });

  it("preserves Employee ID conflict messaging with normalized IDs", () => {
    const classified = classifyUserImportRuntimeError({
      technicalMessage: "Employee ID 0054 is already assigned to another user",
    });
    assert.equal(classified.code, "EMPLOYEE_ID_CONFLICT");
    assert.equal(classified.userMessage, "Employee ID 0054 is already assigned to another user.");
  });

  it("uses safe fallback for unknown errors", () => {
    const classified = classifyUserImportRuntimeError({
      technicalMessage: "totally unexpected worker fault xyz",
    });
    assert.equal(classified.code, "UNKNOWN");
    assert.equal(classified.userMessage, userImportRuntimeUserFacingMessages.UNKNOWN);
  });

  it("keeps successful row notes unchanged", () => {
    assert.equal(
      sanitizeUserImportResultMessage("Updated existing user profile.", { status: "succeeded" }),
      "Updated existing user profile.",
    );
  });

  it("logs technical detail without secrets", () => {
    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(String(args[0] ?? ""));
    };

    try {
      logUserImportRuntimeError({
        rowNumber: 2,
        email: "pat@example.test",
        code: "SYSTEM_CONFIGURATION",
        technicalMessage: "APP_ORIGIN must be configured for server-side auth redirects",
      });
    } finally {
      console.error = original;
    }

    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? "", /\[bulk-user-import\] row=2 email=pat@example.test code=SYSTEM_CONFIGURATION/);
    assert.match(logs[0] ?? "", /APP_ORIGIN must be configured/);
    assert.doesNotMatch(logs[0] ?? "", /password|token=/i);
  });
});

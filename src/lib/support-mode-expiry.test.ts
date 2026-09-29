import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildSupportExpiryAccessibleLabel,
  formatSupportExpiryCountdown,
  formatSupportExpiryJamaicaTime,
} from "./support-mode-expiry";

describe("support mode expiry display", () => {
  const expiresAt = "2026-09-29T23:19:55.987Z";

  it("formats Jamaica-local exact expiry time without ISO strings", () => {
    const formatted = formatSupportExpiryJamaicaTime(expiresAt);
    assert.match(formatted, /PM|AM/);
    assert.doesNotMatch(formatted, /T\d{2}:/);
    assert.doesNotMatch(formatted, /\+00:00/);
  });

  it("formats HR-style countdown text", () => {
    const nowMs = Date.parse("2026-09-29T22:50:00.000Z");
    assert.equal(
      formatSupportExpiryCountdown(expiresAt, nowMs),
      "Expires in 29 minutes",
    );
  });

  it("formats Accounts-style countdown text with shorter remaining time", () => {
    const nowMs = Date.parse("2026-09-29T23:11:00.000Z");
    assert.equal(
      formatSupportExpiryCountdown(expiresAt, nowMs),
      "Expires in 8 minutes",
    );
  });

  it("uses singular minute and sub-minute states", () => {
    const oneMinuteBefore = Date.parse("2026-09-29T23:18:55.987Z");
    assert.equal(
      formatSupportExpiryCountdown(expiresAt, oneMinuteBefore),
      "Expires in 1 minute",
    );

    const thirtySecondsBefore = Date.parse("2026-09-29T23:19:25.987Z");
    assert.equal(
      formatSupportExpiryCountdown(expiresAt, thirtySecondsBefore),
      "Expires in less than a minute",
    );
  });

  it("builds accessible labels with scope and remaining time", () => {
    const nowMs = Date.parse("2026-09-29T23:11:00.000Z");
    const label = buildSupportExpiryAccessibleLabel({
      scopeLabel: "HR",
      expiresAtIso: expiresAt,
      nowMs,
    });
    assert.match(label, /HR Support Mode active/);
    assert.match(label, /Expires in 8 minutes/);
    assert.match(label, /Jamaica time/);
  });

  it("does not render raw ISO timestamps in support UI components", () => {
    const banner = readFileSync(
      new URL("../components/app-shell/support-mode-banner.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/support-mode-workspace.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(banner, /formatJamaicaWallClockTime\(session\.expiresAt\)/);
    assert.doesNotMatch(workspace, /formatJamaicaWallClockTime\(activeSession\.expiresAt\)/);
    assert.match(banner, /SupportModeExpiryDisplay|support-mode-expiry/);
    assert.match(workspace, /SupportModeExpiryDisplay|support-mode-expiry/);
  });

  it("keeps Exit Support Mode hover styling non-white", () => {
    const exitButton = readFileSync(
      new URL("../components/app-shell/support-mode-exit-button.tsx", import.meta.url),
      "utf8",
    );
    assert.match(exitButton, /hover:bg-amber-900/);
    assert.doesNotMatch(exitButton, /hover:bg-white/);
    assert.match(exitButton, /focus-visible:ring/);
  });
});

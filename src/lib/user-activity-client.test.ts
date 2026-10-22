import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  USER_ACTIVITY_FAILURE_BACKOFF_MS,
  USER_ACTIVITY_THROTTLE_MS,
  createUserActivityRecorder,
  readUserActivityRpcRow,
} from "./user-activity-client";

const START = Date.parse("2026-10-22T12:00:00Z");

describe("user activity client throttle", () => {
  it("records once and waits five minutes before another attempt", async () => {
    let now = START;
    let calls = 0;
    let shared: number | null = null;
    const recorder = createUserActivityRecorder({
      now: () => now,
      readSharedLastActiveAt: () => shared,
      writeSharedLastActiveAt: (value) => {
        shared = value;
      },
      record: async () => {
        calls += 1;
        return { recorded: true, last_active_at: new Date(now).toISOString() };
      },
    });

    assert.equal(await recorder.recordIfEligible(), "attempted");
    assert.equal(await recorder.recordIfEligible(), "throttled");
    assert.equal(calls, 1);

    now += USER_ACTIVITY_THROTTLE_MS;
    assert.equal(await recorder.recordIfEligible(), "attempted");
    assert.equal(calls, 2);
  });

  it("uses shared state to coordinate separate browser-tab recorders", async () => {
    let shared: number | null = null;
    let firstCalls = 0;
    let secondCalls = 0;
    const makeRecorder = (record: () => Promise<{ recorded: boolean; last_active_at: string }>) =>
      createUserActivityRecorder({
        now: () => START,
        readSharedLastActiveAt: () => shared,
        writeSharedLastActiveAt: (value) => {
          shared = value;
        },
        record,
      });
    const first = makeRecorder(async () => {
      firstCalls += 1;
      return { recorded: true, last_active_at: new Date(START).toISOString() };
    });
    const second = makeRecorder(async () => {
      secondCalls += 1;
      return { recorded: true, last_active_at: new Date(START).toISOString() };
    });

    assert.equal(await first.recordIfEligible(), "attempted");
    assert.equal(await second.recordIfEligible(), "throttled");
    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 0);
  });

  it("coalesces overlapping activity while a request is in flight", async () => {
    let resolveRequest!: (value: { recorded: boolean; last_active_at: string }) => void;
    const request = new Promise<{ recorded: boolean; last_active_at: string }>(
      (resolve) => {
        resolveRequest = resolve;
      },
    );
    let calls = 0;
    const recorder = createUserActivityRecorder({
      now: () => START,
      readSharedLastActiveAt: () => null,
      writeSharedLastActiveAt: () => undefined,
      record: () => {
        calls += 1;
        return request;
      },
    });

    const first = recorder.recordIfEligible();
    assert.equal(await recorder.recordIfEligible(), "in-flight");
    resolveRequest({ recorded: true, last_active_at: new Date(START).toISOString() });
    assert.equal(await first, "attempted");
    assert.equal(calls, 1);
  });

  it("backs off after failures and recovers without affecting the application", async () => {
    let now = START;
    let calls = 0;
    const recorder = createUserActivityRecorder({
      now: () => now,
      readSharedLastActiveAt: () => null,
      writeSharedLastActiveAt: () => undefined,
      record: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("network unavailable");
        }
        return { recorded: true, last_active_at: new Date(now).toISOString() };
      },
    });

    assert.equal(await recorder.recordIfEligible(), "failed");
    assert.equal(await recorder.recordIfEligible(), "throttled");
    now += USER_ACTIVITY_FAILURE_BACKOFF_MS;
    assert.equal(await recorder.recordIfEligible(), "attempted");
    assert.equal(calls, 2);
  });

  it("rejects malformed RPC rows and ignores impossible future shared values", async () => {
    assert.throws(() => readUserActivityRpcRow([]), /invalid/);
    assert.throws(
      () => readUserActivityRpcRow([{ recorded: true, last_active_at: "bad" }]),
      /invalid/,
    );

    let calls = 0;
    const recorder = createUserActivityRecorder({
      now: () => START,
      readSharedLastActiveAt: () => START + USER_ACTIVITY_THROTTLE_MS,
      writeSharedLastActiveAt: () => undefined,
      record: async () => {
        calls += 1;
        return { recorded: false, last_active_at: new Date(START).toISOString() };
      },
    });
    assert.equal(await recorder.recordIfEligible(), "attempted");
    assert.equal(calls, 1);
  });
});

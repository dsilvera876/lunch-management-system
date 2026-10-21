import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_TIMED_TOAST_DURATION_MS,
  ToastItem,
  createPausableToastTimer,
  resolveToastDurationMs,
  type ToastTimerRuntime,
  type ToastVariant,
} from "../components/ui/toast";

const SURFACE_COLORS: Record<ToastVariant, { className: string; hex: string }> = {
  success: { className: "bg-emerald-700", hex: "#047857" },
  error: { className: "bg-red-700", hex: "#b91c1c" },
  warning: { className: "bg-amber-700", hex: "#b45309" },
  info: { className: "bg-blue-700", hex: "#1d4ed8" },
};

const ACTION_TEXT_COLORS: Record<ToastVariant, string> = {
  success: "#065f46",
  error: "#991b1b",
  warning: "#92400e",
  info: "#1e40af",
};

function renderToast(variant: ToastVariant, title = `${variant} title`) {
  return renderToStaticMarkup(
    createElement(ToastItem, {
      toast: { id: variant, title, body: "Notification details", variant },
      onDismiss: () => undefined,
    }),
  );
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  assert.ok(channels);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; callback: () => void }>();

  const runtime: ToastTimerRuntime = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      scheduled.set(id, { at: now + delayMs, callback });
      return id;
    },
    clearTimeout: (handle) => {
      scheduled.delete(handle as number);
    },
  };

  const advance = (milliseconds: number) => {
    const target = now + milliseconds;
    while (true) {
      const due = [...scheduled.entries()]
        .filter(([, task]) => task.at <= target)
        .sort(([, first], [, second]) => first.at - second.at)[0];
      if (!due) {
        break;
      }
      const [id, task] = due;
      scheduled.delete(id);
      now = task.at;
      task.callback();
    }
    now = target;
  };

  return { runtime, advance, pendingCount: () => scheduled.size };
}

describe("toast presentation", () => {
  it("renders all four high-contrast variants with their status icons", () => {
    for (const variant of ["success", "error", "warning", "info"] as const) {
      const markup = renderToast(variant);
      assert.match(markup, new RegExp(SURFACE_COLORS[variant].className));
      assert.match(markup, new RegExp(`data-toast-variant-icon="${variant}"`));
      assert.match(markup, /text-white/);
      assert.match(markup, /shadow-xl/);
    }
  });

  it("uses surfaces with AA white-text contrast and strong canvas separation", () => {
    const appCanvas = "#f4f6f9";
    for (const [variant, { hex }] of Object.entries(SURFACE_COLORS) as [
      ToastVariant,
      { className: string; hex: string },
    ][]) {
      assert.ok(contrastRatio(hex, "#ffffff") >= 4.5);
      assert.ok(contrastRatio(hex, appCanvas) >= 3);
      assert.ok(contrastRatio(ACTION_TEXT_COLORS[variant], "#ffffff") >= 4.5);
    }
  });

  it("uses assertive errors, polite non-error statuses, and labeled dismiss controls", () => {
    assert.match(renderToast("error"), /role="alert"/);
    for (const variant of ["success", "warning", "info"] as const) {
      assert.match(renderToast(variant), /role="status"/);
    }

    const markup = renderToast("success", "Lunch order saved");
    assert.match(markup, /aria-label="Dismiss Lunch order saved notification"/);
    assert.match(markup, /min-h-10 min-w-10/);
    assert.match(markup, /focus-visible:outline-white/);
    assert.doesNotMatch(markup, /autofocus/i);
  });

  it("keeps action controls persistent by default and visibly focusable", () => {
    assert.equal(
      resolveToastDurationMs({ action: { label: "Review", href: "/review" } }, "success"),
      null,
    );
    assert.equal(
      resolveToastDurationMs(
        { action: { label: "Review", href: "/review" }, durationMs: 3500 },
        "success",
      ),
      3500,
    );

    const markup = renderToStaticMarkup(
      createElement(ToastItem, {
        toast: {
          id: "action",
          title: "Review needed",
          variant: "warning",
          action: { label: "Review", href: "/review" },
        },
        onDismiss: () => undefined,
      }),
    );
    assert.match(markup, /border-white bg-white/);
    assert.match(markup, /focus-visible:outline-white/);
  });
});

describe("toast timing", () => {
  it("times success and info while errors and warnings persist by default", () => {
    assert.equal(resolveToastDurationMs({}, "success"), DEFAULT_TIMED_TOAST_DURATION_MS);
    assert.equal(resolveToastDurationMs({}, "info"), DEFAULT_TIMED_TOAST_DURATION_MS);
    assert.equal(resolveToastDurationMs({}, "error"), null);
    assert.equal(resolveToastDurationMs({}, "warning"), null);
    assert.equal(resolveToastDurationMs({ durationMs: 1200 }, "error"), 1200);
  });

  it("pauses and resumes without losing remaining hover time", () => {
    const clock = createFakeClock();
    let elapsed = 0;
    const timer = createPausableToastTimer({
      durationMs: 1000,
      onElapsed: () => elapsed++,
      runtime: clock.runtime,
    });

    clock.advance(400);
    timer.pause("hover");
    clock.advance(2000);
    assert.equal(elapsed, 0);
    timer.resume("hover");
    clock.advance(599);
    assert.equal(elapsed, 0);
    clock.advance(1);
    assert.equal(elapsed, 1);
  });

  it("waits for focus and hidden-tab pause reasons to clear independently", () => {
    const clock = createFakeClock();
    let elapsed = 0;
    const timer = createPausableToastTimer({
      durationMs: 500,
      onElapsed: () => elapsed++,
      runtime: clock.runtime,
    });

    clock.advance(100);
    timer.pause("focus");
    timer.pause("document-hidden");
    timer.resume("focus");
    clock.advance(1000);
    assert.equal(elapsed, 0);
    timer.resume("document-hidden");
    clock.advance(400);
    assert.equal(elapsed, 1);
  });

  it("cleans up and advances stacked toast timers independently", () => {
    const clock = createFakeClock();
    const elapsed: string[] = [];
    const first = createPausableToastTimer({
      durationMs: 300,
      onElapsed: () => elapsed.push("first"),
      runtime: clock.runtime,
    });
    const second = createPausableToastTimer({
      durationMs: 600,
      onElapsed: () => elapsed.push("second"),
      runtime: clock.runtime,
    });

    second.pause("hover");
    clock.advance(300);
    assert.deepEqual(elapsed, ["first"]);
    first.dispose();
    second.resume("hover");
    clock.advance(599);
    assert.deepEqual(elapsed, ["first"]);
    clock.advance(1);
    assert.deepEqual(elapsed, ["first", "second"]);
    second.dispose();
    assert.equal(clock.pendingCount(), 0);
  });
});

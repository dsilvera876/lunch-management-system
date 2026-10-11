/**
 * Local E2E only: makes "Jamaica today" a chosen weekday so open-ordering UI can
 * be exercised on a weekend without changing any database dates or app settings.
 *
 * Server: NODE_OPTIONS=--require=./tests/accessibility/helpers/simulated-jamaica-today.cjs
 * with E2E_SIMULATED_JAMAICA_TODAY=YYYY-MM-DD for `next start`.
 * Browser: the checkout spec injects `patchJamaicaToday` with addInitScript so
 * server and client render the same date (no hydration mismatch).
 *
 * Only America/Jamaica formatting of instants within a few minutes of the real
 * clock is shifted, by whole days. Date.now() is untouched so auth token expiry,
 * database now(), and real order deadlines keep working.
 */
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- loaded by `node --require`, must be CommonJS */
const fs = require("node:fs");
const path = require("node:path");
/* eslint-enable @typescript-eslint/no-require-imports */

/** Self-contained so it can be serialized into the browser by Playwright. */
function patchJamaicaToday(target) {
  const TIME_ZONE = "America/Jamaica";
  const NEAR_NOW_WINDOW_MS = 10 * 60 * 1000;
  const MAX_OFFSET_DAYS = 7;
  const DAY_MS = 24 * 60 * 60 * 1000;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(target))) {
    throw new Error(`[simulated-jamaica-today] Expected YYYY-MM-DD (got "${target}").`);
  }

  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  if (OriginalDateTimeFormat.__simulatedJamaicaToday) {
    return OriginalDateTimeFormat.__simulatedJamaicaToday;
  }

  const realToday = new OriginalDateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(
    new Date(),
  );
  const offsetDays = Math.round(
    (Date.parse(`${target}T12:00:00Z`) - Date.parse(`${realToday}T12:00:00Z`)) / DAY_MS,
  );

  if (!Number.isFinite(offsetDays) || Math.abs(offsetDays) > MAX_OFFSET_DAYS) {
    throw new Error(
      `[simulated-jamaica-today] ${target} must be within ${MAX_OFFSET_DAYS} days of ${realToday}.`,
    );
  }

  const result = { target, realToday, offsetDays };
  if (offsetDays === 0) {
    return result;
  }

  const offsetMs = offsetDays * DAY_MS;

  function shiftNearNow(value) {
    const ms =
      value === undefined
        ? Date.now()
        : value instanceof Date
          ? value.getTime()
          : Number(value);
    if (!Number.isFinite(ms) || Math.abs(ms - Date.now()) > NEAR_NOW_WINDOW_MS) {
      return value;
    }
    return new Date(ms + offsetMs);
  }

  function SimulatedDateTimeFormat(locales, options) {
    const formatter = new OriginalDateTimeFormat(locales, options);
    if (formatter.resolvedOptions().timeZone !== TIME_ZONE) {
      return formatter;
    }
    return new Proxy(formatter, {
      get(formatterTarget, property) {
        if (property === "format") {
          return (date) => formatterTarget.format(shiftNearNow(date));
        }
        if (property === "formatToParts") {
          return (date) => formatterTarget.formatToParts(shiftNearNow(date));
        }
        const value = Reflect.get(formatterTarget, property, formatterTarget);
        return typeof value === "function" ? value.bind(formatterTarget) : value;
      },
    });
  }
  SimulatedDateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
  SimulatedDateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;
  SimulatedDateTimeFormat.__simulatedJamaicaToday = result;
  Intl.DateTimeFormat = SimulatedDateTimeFormat;

  for (const method of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
    const original = Date.prototype[method];
    Date.prototype[method] = function (locales, options) {
      if (options && options.timeZone === TIME_ZONE) {
        return original.call(shiftNearNow(this), locales, options);
      }
      return original.call(this, locales, options);
    };
  }

  return result;
}

function readEnvFileValue(key) {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) {
      continue;
    }
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && match[1] === key) {
        return match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
  return undefined;
}

function isLoopbackUrl(value) {
  try {
    const host = new URL(value).hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function installForServer() {
  const target = process.env.E2E_SIMULATED_JAMAICA_TODAY;
  if (!target || process.env.E2E_SIMULATED_JAMAICA_TODAY_PRELOAD !== "1") {
    return;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvFileValue("NEXT_PUBLIC_SUPABASE_URL") ?? "";
  if (!isLoopbackUrl(supabaseUrl)) {
    throw new Error(
      "[simulated-jamaica-today] Refusing to run: NEXT_PUBLIC_SUPABASE_URL must be a loopback (local) Supabase URL.",
    );
  }

  const { realToday, offsetDays } = patchJamaicaToday(target);
  if (offsetDays !== 0) {
    process.stderr.write(
      `[simulated-jamaica-today] Jamaica today is simulated as ${target} (real ${realToday}). Local E2E only.\n`,
    );
  }
}

installForServer();

module.exports = { patchJamaicaToday };

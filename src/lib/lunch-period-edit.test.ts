import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadAction(options: { rpcError?: boolean; deny?: boolean } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const revalidated: string[] = [];
  let authorized = 0;
  const exports: Record<string, (data: FormData) => Promise<{ success: boolean }>> = {};
  const source = ts.transpileModule(
    readFileSync(new URL("../app/admin/lunch-periods/actions.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  runInNewContext(source, {
    exports,
    require(id: string) {
      if (id === "next/cache") return { revalidatePath: (path: string) => revalidated.push(path) };
      if (id === "@/lib/auth") return { requireManageLunchPeriods: async () => {
        authorized += 1;
        if (options.deny) throw new Error("Unauthorized");
      } };
      if (id === "@/lib/lunch-periods") return {};
      if (id === "@/lib/supabase/server") return { createClient: async () => ({
        rpc: async (name: string, args: unknown) => {
          calls.push({ name, args });
          return { error: options.rpcError ? { message: "Rejected" } : null };
        },
      }) };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return { action: exports.updateLunchPeriodDetails, calls, revalidated, authorized: () => authorized };
}

function form(label = "Payroll", endDate = "2026-10-31") {
  const data = new FormData();
  data.set("periodId", "a8622222-2222-4222-8222-222222222222");
  data.set("label", label);
  data.set("endDate", endDate);
  return data;
}

describe("unified lunch period Server Action", () => {
  for (const [name, label, endDate] of [
    ["label-only", "Renamed", "2026-10-31"],
    ["date-only", "Payroll", "2026-11-01"],
    ["simultaneous", "Renamed", "2026-11-01"],
    ["unchanged", "Payroll", "2026-10-31"],
  ]) {
    it(`sends ${name} edits through exactly one atomic RPC and refreshes`, async () => {
      const harness = loadAction();
      assert.equal((await harness.action(form(` ${label} `, endDate))).success, true);
      assert.equal(harness.authorized(), 1);
      assert.equal(harness.calls.length, 1);
      assert.equal(harness.calls[0].name, "update_lunch_period_details");
      assert.equal(JSON.stringify(harness.calls[0].args), JSON.stringify({
        p_period_id: "a8622222-2222-4222-8222-222222222222",
        p_label: label,
        p_end_date: endDate,
      }));
      assert.deepEqual(harness.revalidated, ["/admin/lunch-periods", "/home", "/account"]);
    });
  }

  it("fails without refresh or success when the authoritative RPC rejects either field", async () => {
    const harness = loadAction({ rpcError: true });
    assert.equal((await harness.action(form("Invalid edit", "2026-01-01"))).success, false);
    assert.equal(harness.calls.length, 1);
    assert.deepEqual(harness.revalidated, []);
  });

  for (const [name, data] of [
    ["empty label", form("  ")],
    ["malformed date", form("Payroll", "not-a-date")],
    ["missing date", (() => { const data = form(); data.delete("endDate"); return data; })()],
    ["missing period", (() => { const data = form(); data.delete("periodId"); return data; })()],
  ] as const) {
    it(`rejects ${name} before making a database call`, async () => {
      const harness = loadAction();
      assert.equal((await harness.action(data)).success, false);
      assert.equal(harness.calls.length, 0);
      assert.deepEqual(harness.revalidated, []);
    });
  }

  it("requires the existing permanent Accounts guard before any database call", async () => {
    const harness = loadAction({ deny: true });
    await assert.rejects(harness.action(form()), /Unauthorized/);
    assert.equal(harness.calls.length, 0);
    assert.deepEqual(harness.revalidated, []);
  });
});

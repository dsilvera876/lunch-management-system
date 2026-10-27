import assert from "node:assert/strict";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseHrLateOrdersDataSource,
  HR_LATE_ORDERS_PAGE_SIZE,
} from "../../../src/lib/hr-late-orders-page-load";

type LocalSupabaseStatus = {
  API_URL?: string;
  SECRET_KEY?: string;
  SERVICE_ROLE_KEY?: string;
};

function readLocalSupabaseStatus() {
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf8",
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DO_NOT_TRACK: "1" },
    ...(process.platform === "win32"
      ? { shell: process.env.ComSpec ?? "cmd.exe" }
      : {}),
  };
  const output = execSync("npx supabase status -o json --agent no", options);
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Local Supabase status is unavailable.");

  const status = JSON.parse(output.slice(start, end + 1)) as LocalSupabaseStatus;
  const apiUrl = status.API_URL?.trim();
  const secretKey = (status.SECRET_KEY ?? status.SERVICE_ROLE_KEY)?.trim();
  if (apiUrl !== "http://127.0.0.1:55421") {
    throw new Error("Refusing to test HR Late Orders pagination outside local Supabase.");
  }
  if (!secretKey) throw new Error("Local Supabase server credential is unavailable.");
  return { apiUrl, secretKey };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

test("HR Late Orders keyset pagination works through local PostgREST beyond 500 rows", async () => {
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const marker = randomUUID();
  const inserted = Array.from({ length: HR_LATE_ORDERS_PAGE_SIZE + 1 }, (_, index) => ({
    id: randomUUID(),
    name: `Pagination probe ${marker} ${String(index).padStart(4, "0")}`,
    active: false,
  }));
  const insertedIds: string[] = inserted.map((row) => row.id);
  const insertedIdSet = new Set(insertedIds);

  try {
    for (const batch of chunks(inserted, 100)) {
      const { error } = await admin.from("lunch_providers").insert(batch);
      assert.equal(error, null);
    }

    const source = createSupabaseHrLateOrdersDataSource(admin);
    const rows = await source.fetchProviders();
    const probeRows = rows.filter((row) => insertedIdSet.has(row.id));

    assert.equal(probeRows.length, inserted.length);
    assert.equal(new Set(probeRows.map((row) => row.id)).size, inserted.length);
    assert.ok(source.getRequestCount() >= 2);
  } finally {
    for (const batch of chunks(insertedIds, 100)) {
      const { error } = await admin.from("lunch_providers").delete().in("id", batch);
      assert.equal(error, null);
    }
  }
});

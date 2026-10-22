import assert from "node:assert/strict";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { createClient } from "@supabase/supabase-js";

import { runLocalDbExec, runLocalDbQuery } from "./e2e-local-db";

type LocalSupabaseStatus = {
  API_URL?: string;
  DB_URL?: string;
  PUBLISHABLE_KEY?: string;
  ANON_KEY?: string;
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
  if (start < 0 || end <= start) {
    throw new Error("Local Supabase status is unavailable.");
  }

  const status = JSON.parse(output.slice(start, end + 1)) as LocalSupabaseStatus;
  const apiUrl = status.API_URL?.trim();
  const dbUrl = status.DB_URL?.trim();
  const publishableKey = (status.PUBLISHABLE_KEY ?? status.ANON_KEY)?.trim();
  const secretKey = (status.SECRET_KEY ?? status.SERVICE_ROLE_KEY)?.trim();
  if (
    apiUrl !== "http://127.0.0.1:55421" ||
    !dbUrl?.startsWith("postgresql://postgres:postgres@127.0.0.1:55422/")
  ) {
    throw new Error("Refusing to test user activity outside local Supabase.");
  }
  if (!publishableKey || !secretKey) {
    throw new Error("Local Supabase keys are unavailable.");
  }
  return { apiUrl, publishableKey, secretKey };
}

test("concurrent authenticated activity calls create one throttled state update", async () => {
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const email = `last-active-${randomUUID()}@lunch.test`;
  const password = `${randomBytes(24).toString("base64url")}Aa4!`;
  let userId: string | null = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Last Active Integration" },
    });
    assert.equal(created.error, null);
    assert.ok(created.data.user?.id);
    userId = created.data.user.id;

    const clients = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const client = createClient(status.apiUrl, status.publishableKey, {
          auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
        });
        const signedIn = await client.auth.signInWithPassword({ email, password });
        assert.equal(signedIn.error, null);
        return client;
      }),
    );

    const firstWave = await Promise.all(
      clients.map((client) => client.rpc("record_current_user_activity")),
    );
    assert.ok(firstWave.every((result) => result.error === null));
    assert.equal(
      firstWave.filter((result) => result.data?.[0]?.recorded === true).length,
      1,
    );
    assert.equal(
      firstWave.filter((result) => result.data?.[0]?.recorded === false).length,
      5,
    );

    const [state] = runLocalDbQuery(`
      select count(*)::int as row_count, max(last_active_at)::text as last_active_at
      from private.user_activity_state
      where profile_id = '${userId}'::uuid;
    `);
    assert.equal(state?.row_count, 1);
    assert.equal(typeof state?.last_active_at, "string");

    const immediate = await clients[0]!.rpc("record_current_user_activity");
    assert.equal(immediate.error, null);
    assert.equal(immediate.data?.[0]?.recorded, false);

    runLocalDbExec(`
      update private.user_activity_state
      set last_active_at = statement_timestamp() - interval '5 minutes 1 second'
      where profile_id = '${userId}'::uuid
      returning profile_id;
    `);
    const secondWave = await Promise.all(
      clients.slice(0, 2).map((client) => client.rpc("record_current_user_activity")),
    );
    assert.ok(secondWave.every((result) => result.error === null));
    assert.equal(
      secondWave.filter((result) => result.data?.[0]?.recorded === true).length,
      1,
    );
    assert.equal(
      secondWave.filter((result) => result.data?.[0]?.recorded === false).length,
      1,
    );
  } finally {
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      assert.equal(removed.error, null);
    }
  }
});

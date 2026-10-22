import assert from "node:assert/strict";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { createClient } from "@supabase/supabase-js";

import { runLocalDbQuery } from "./e2e-local-db";

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
  if (start < 0 || end <= start) throw new Error("Local Supabase status is unavailable.");

  const status = JSON.parse(output.slice(start, end + 1)) as LocalSupabaseStatus;
  const apiUrl = status.API_URL?.trim();
  const dbUrl = status.DB_URL?.trim();
  const publishableKey = (status.PUBLISHABLE_KEY ?? status.ANON_KEY)?.trim();
  const secretKey = (status.SECRET_KEY ?? status.SERVICE_ROLE_KEY)?.trim();
  if (
    apiUrl !== "http://127.0.0.1:55421" ||
    !dbUrl?.startsWith("postgresql://postgres:postgres@127.0.0.1:55422/")
  ) {
    throw new Error("Refusing to test sign-in timestamps outside local Supabase.");
  }
  if (!publishableKey || !secretKey) throw new Error("Local Supabase keys are unavailable.");
  return { apiUrl, publishableKey, secretKey };
}

test("last_sign_in_at changes only after successful password authentication", async () => {
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const client = createClient(status.apiUrl, status.publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const email = `last-sign-in-${randomUUID()}@lunch.test`;
  const password = `${randomBytes(24).toString("base64url")}Dd4!`;
  let userId: string | null = null;

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Last Sign In Integration" },
    });
    assert.equal(created.error, null);
    assert.ok(created.data.user?.id);
    userId = created.data.user.id;

    const [initial] = runLocalDbQuery(`
      select last_sign_in_at
      from auth.users
      where id = '${userId}'::uuid;
    `);
    assert.equal(initial?.last_sign_in_at, null);

    const failed = await client.auth.signInWithPassword({
      email,
      password: `${password}-wrong`,
    });
    assert.ok(failed.error);
    assert.equal(failed.data.session, null);

    const [afterFailure] = runLocalDbQuery(`
      select last_sign_in_at
      from auth.users
      where id = '${userId}'::uuid;
    `);
    assert.equal(afterFailure?.last_sign_in_at, null);

    const successful = await client.auth.signInWithPassword({ email, password });
    assert.equal(successful.error, null);
    assert.equal(successful.data.user?.id, userId);

    const [afterSuccess] = runLocalDbQuery(`
      select last_sign_in_at is not null as signed_in
      from auth.users
      where id = '${userId}'::uuid;
    `);
    assert.equal(afterSuccess?.signed_in, true);
  } finally {
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      assert.equal(removed.error, null);
    }
  }
});

test("last_sign_in_at remains null until an invitation is accepted", async () => {
  const status = readLocalSupabaseStatus();
  const admin = createClient(status.apiUrl, status.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const invitee = createClient(status.apiUrl, status.publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const email = `last-sign-in-invite-${randomUUID()}@lunch.test`;
  let userId: string | null = null;

  try {
    const invitation = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { full_name: "Last Sign In Invitation Integration" },
        redirectTo: "http://127.0.0.1:3000/account/update-password?invite=1",
      },
    });
    assert.equal(invitation.error, null);
    assert.ok(invitation.data.user?.id);
    assert.ok(invitation.data.properties?.hashed_token);
    assert.equal(invitation.data.properties?.verification_type, "invite");
    userId = invitation.data.user.id;

    const [beforeAcceptance] = runLocalDbQuery(`
      select last_sign_in_at
      from auth.users
      where id = '${userId}'::uuid;
    `);
    assert.equal(beforeAcceptance?.last_sign_in_at, null);

    const accepted = await invitee.auth.verifyOtp({
      type: "invite",
      token_hash: invitation.data.properties.hashed_token,
    });
    assert.equal(accepted.error, null);
    assert.equal(accepted.data.user?.id, userId);
    assert.ok(accepted.data.session);

    const [afterAcceptance] = runLocalDbQuery(`
      select last_sign_in_at
      from auth.users
      where id = '${userId}'::uuid;
    `);
    assert.equal(typeof afterAcceptance?.last_sign_in_at, "string");
    assert.notEqual(afterAcceptance?.last_sign_in_at, beforeAcceptance?.last_sign_in_at);
  } finally {
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      assert.equal(removed.error, null);
    }
  }
});

import assert from "node:assert/strict";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { createClient } from "@supabase/supabase-js";
import { buildSignedAccountSetupRecoveryRedirect } from "../../../src/lib/signup-recovery-purpose";

import { runLocalDbExec, runLocalDbQuery } from "./e2e-local-db";

type LocalSupabaseStatus = {
  API_URL?: string;
  DB_URL?: string;
  PUBLISHABLE_KEY?: string;
  ANON_KEY?: string;
  SECRET_KEY?: string;
  SERVICE_ROLE_KEY?: string;
};

const PURPOSE_SECRET = "local-integration-purpose-secret-at-least-32-bytes";
const APP_ORIGIN = "http://127.0.0.1:3000";

function setupRedirect(input: {
  nonce: string;
  email: string;
  userId: string;
  nowMs?: number;
}): string {
  return buildSignedAccountSetupRecoveryRedirect(
    {
      nonce: input.nonce,
      recipientEmail: input.email,
      expectedAuthUserId: input.userId,
      redirectTo: `${APP_ORIGIN}/account/update-password`,
    },
    { secret: PURPOSE_SECRET, nowMs: input.nowMs },
  );
}

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
    throw new Error("Refusing to run onboarding recovery outside local Supabase.");
  }
  if (!publishableKey || !secretKey) throw new Error("Local Supabase keys are unavailable.");
  return { apiUrl, publishableKey, secretKey };
}

function latestSetupToken(requestId: string): string {
  const [row] = runLocalDbQuery(`
    select text_body
    from private.email_delivery_queue
    where auth_signup_request_id = '${requestId}'::uuid
    order by created_at desc
    limit 1;
  `);
  const token = String(row?.text_body ?? "").match(/[?&]token_hash=([^&\s]+)/)?.[1];
  assert.ok(token, "signed hook did not queue a recovery token");
  return decodeURIComponent(token);
}

function latestOrdinaryRecoveryToken(userId: string): string {
  const [row] = runLocalDbQuery(`
    select text_body
    from private.email_delivery_queue
    where auth_user_id = '${userId}'::uuid
      and auth_action_type = 'recovery'
      and auth_signup_request_id is null
    order by created_at desc
    limit 1;
  `);
  const token = String(row?.text_body ?? "").match(/[?&]token_hash=([^&\s]+)/)?.[1];
  assert.ok(token, "signed hook did not queue an ordinary recovery token");
  return decodeURIComponent(token);
}

async function publicRecoveryResponse(input: {
  apiUrl: string;
  publishableKey: string;
  email: string;
  redirectTo: string;
}): Promise<{ status: number; body: string; contentType: string | null }> {
  const response = await fetch(
    `${input.apiUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(input.redirectTo)}`,
    {
      method: "POST",
      headers: {
        apikey: input.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: input.email }),
    },
  );
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type"),
  };
}

test(
  "standard recovery safely retries and completes an existing external identity",
  { timeout: 90_000 },
  async () => {
    const status = readLocalSupabaseStatus();
    const admin = createClient(status.apiUrl, status.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const recoveryClient = createClient(status.apiUrl, status.publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const email = `prl021-${randomUUID()}@lunch.test`;
    const initialPassword = `${randomBytes(24).toString("base64url")}Aa1!`;
    const replacementPassword = `${randomBytes(24).toString("base64url")}Bb2!`;
    const requestId = randomUUID();
    let userId: string | null = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
        user_metadata: { full_name: "PRL-021 Recovery" },
      });
      assert.equal(created.error, null);
      assert.ok(created.data.user?.id);
      userId = created.data.user.id;
      runLocalDbExec(`select private.apply_profile_role('${userId}'::uuid, 'hr');`);

      runLocalDbExec(`
        insert into private.signup_requests (
          id, email, normalized_email, full_name, status, reviewed_at,
          created_profile_id, onboarding_completed_at
        ) values (
          '${requestId}'::uuid, '${email}', '${email}', 'PRL-021 Recovery',
          'approved', now(), '${userId}'::uuid, null
        );
      `);

      const firstNonce = randomUUID();
      const preparedFirst = await admin.rpc("prepare_signup_account_setup_recovery", {
        p_request_id: requestId,
        p_expected_profile_id: userId,
        p_nonce: firstNonce,
      });
      assert.equal(preparedFirst.error, null);
      assert.equal(preparedFirst.data, "prepared");

      const firstReset = await recoveryClient.auth.resetPasswordForEmail(email, {
        redirectTo: setupRedirect({ nonce: firstNonce, email, userId }),
      });
      assert.equal(firstReset.error, null);
      const firstToken = latestSetupToken(requestId);

      runLocalDbExec(`
        update auth.users set recovery_sent_at = now() - interval '2 hours'
        where id = '${userId}'::uuid;
      `);
      const expiredClient = createClient(status.apiUrl, status.publishableKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
      const expired = await expiredClient.auth.verifyOtp({
        type: "recovery",
        token_hash: firstToken,
      });
      assert.ok(expired.error);
      assert.equal(expired.data.session, null);

      const secondNonce = randomUUID();
      const preparedSecond = await admin.rpc("prepare_signup_account_setup_recovery", {
        p_request_id: requestId,
        p_expected_profile_id: userId,
        p_nonce: secondNonce,
      });
      assert.equal(preparedSecond.error, null);
      const secondReset = await recoveryClient.auth.resetPasswordForEmail(email, {
        redirectTo: setupRedirect({ nonce: secondNonce, email, userId }),
      });
      assert.equal(secondReset.error, null);
      const secondToken = latestSetupToken(requestId);

      const rejectedReplacement = await recoveryClient.auth.resetPasswordForEmail(email, {
        redirectTo: setupRedirect({ nonce: randomUUID(), email, userId }),
      });
      assert.equal(rejectedReplacement.error, null);
      const ordinaryReplacementToken = latestOrdinaryRecoveryToken(userId);
      assert.notEqual(ordinaryReplacementToken, secondToken);

      const thirdNonce = randomUUID();
      await admin.rpc("prepare_signup_account_setup_recovery", {
        p_request_id: requestId,
        p_expected_profile_id: userId,
        p_nonce: thirdNonce,
      });
      const thirdReset = await recoveryClient.auth.resetPasswordForEmail(email, {
        redirectTo: setupRedirect({ nonce: thirdNonce, email, userId }),
      });
      assert.equal(thirdReset.error, null);
      const thirdToken = latestSetupToken(requestId);

      const supersededClient = createClient(status.apiUrl, status.publishableKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
      const superseded = await supersededClient.auth.verifyOtp({
        type: "recovery",
        token_hash: secondToken,
      });
      assert.ok(superseded.error);

      const invalid = await supersededClient.auth.verifyOtp({
        type: "recovery",
        token_hash: "invalid-prl021-token",
      });
      assert.ok(invalid.error);

      const userClient = createClient(status.apiUrl, status.publishableKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
      const verified = await userClient.auth.verifyOtp({
        type: "recovery",
        token_hash: thirdToken,
      });
      assert.equal(verified.error, null);
      assert.equal(verified.data.user?.id, userId);

      const authorized = await admin.rpc("service_authorize_signup_onboarding", {
        p_user_id: userId,
        p_auth_action_type: "recovery",
        p_nonce: thirdNonce,
      });
      assert.equal(authorized.error, null);
      assert.equal(authorized.data, true);

      const passwordUpdate = await userClient.auth.updateUser({ password: replacementPassword });
      assert.equal(passwordUpdate.error, null);
      const completion = await admin.rpc("service_complete_signup_onboarding", {
        p_user_id: userId,
      });
      assert.equal(completion.error, null);
      assert.equal((completion.data as { code?: string })?.code, "completed");

      const [state] = runLocalDbQuery(`
        select sr.onboarding_completed_at is not null as onboarding_complete,
               p.role, p.account_status
        from private.signup_requests sr
        join public.profiles p on p.id = sr.created_profile_id
        where sr.id = '${requestId}'::uuid;
      `);
      assert.equal(state?.onboarding_complete, true);
      assert.equal(state?.role, "hr");
      assert.equal(state?.account_status, "active");

      const replayClient = createClient(status.apiUrl, status.publishableKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
      const replay = await replayClient.auth.verifyOtp({
        type: "recovery",
        token_hash: thirdToken,
      });
      assert.ok(replay.error);
      assert.equal(replay.data.session, null);
    } finally {
      runLocalDbExec(`
        delete from private.email_delivery_queue
        where auth_signup_request_id = '${requestId}'::uuid
           or auth_user_id = ${userId ? `'${userId}'::uuid` : "null"};
      `);
      runLocalDbExec(`delete from private.signup_requests where id = '${requestId}'::uuid;`);
      if (userId) {
        const removed = await admin.auth.admin.deleteUser(userId);
        assert.equal(removed.error, null);
      }
    }
  },
);

test(
  "public recovery responses do not reveal account existence through setup-purpose inputs",
  { timeout: 90_000 },
  async () => {
    const status = readLocalSupabaseStatus();
    const admin = createClient(status.apiUrl, status.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const createdUserIds: string[] = [];
    const requestIds: string[] = [];

    async function createIdentity(label: string) {
      const email = `prl021-enum-${label}-${randomUUID()}@lunch.test`;
      const created = await admin.auth.admin.createUser({
        email,
        password: `${randomBytes(24).toString("base64url")}Aa1!`,
        email_confirm: true,
      });
      assert.equal(created.error, null);
      assert.ok(created.data.user?.id);
      createdUserIds.push(created.data.user.id);
      return { email, userId: created.data.user.id };
    }

    async function assertNeutral(label: string, existingEmail: string, redirectTo: string) {
      const emailLabel = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const unknownEmail = `prl021-unknown-${emailLabel}-${randomUUID()}@lunch.test`;
      const [existing, unknown] = await Promise.all([
        publicRecoveryResponse({
          apiUrl: status.apiUrl,
          publishableKey: status.publishableKey,
          email: existingEmail,
          redirectTo,
        }),
        publicRecoveryResponse({
          apiUrl: status.apiUrl,
          publishableKey: status.publishableKey,
          email: unknownEmail,
          redirectTo,
        }),
      ]);
      assert.deepEqual(existing, unknown, `${label} produced distinguishable public responses`);
      assert.equal(existing.status, 200, `${label} was not publicly neutral`);
    }

    try {
      const missing = await createIdentity("missing");
      await assertNeutral(
        "missing signature",
        missing.email,
        `${APP_ORIGIN}/account/update-password?invite=1&setup_nonce=${randomUUID()}`,
      );

      const malformed = await createIdentity("malformed");
      await assertNeutral(
        "malformed purpose",
        malformed.email,
        `${APP_ORIGIN}/account/update-password?invite=1&setup_nonce=${randomUUID()}&setup_expires=invalid&setup_signature=invalid`,
      );

      const invalid = await createIdentity("invalid");
      const invalidUrl = new URL(setupRedirect({ nonce: randomUUID(), ...invalid }));
      invalidUrl.searchParams.set("setup_signature", "A".repeat(43));
      await assertNeutral("invalid signature", invalid.email, invalidUrl.toString());

      const expired = await createIdentity("expired");
      await assertNeutral(
        "expired purpose",
        expired.email,
        setupRedirect({
          nonce: randomUUID(),
          ...expired,
          nowMs: Date.now() - 20 * 60 * 1000,
        }),
      );

      const tamperedIdentity = await createIdentity("tampered-identity");
      await assertNeutral(
        "tampered identity",
        tamperedIdentity.email,
        setupRedirect({
          nonce: randomUUID(),
          email: tamperedIdentity.email,
          userId: randomUUID(),
        }),
      );

      const tamperedNonce = await createIdentity("tampered-nonce");
      const tamperedNonceUrl = new URL(setupRedirect({ nonce: randomUUID(), ...tamperedNonce }));
      tamperedNonceUrl.searchParams.set("setup_nonce", randomUUID());
      await assertNeutral("tampered nonce", tamperedNonce.email, tamperedNonceUrl.toString());

      const stale = await createIdentity("stale");
      const requestId = randomUUID();
      requestIds.push(requestId);
      runLocalDbExec(`
        insert into private.signup_requests (
          id, email, normalized_email, full_name, status, reviewed_at,
          created_profile_id, onboarding_completed_at
        ) values (
          '${requestId}'::uuid, '${stale.email}', '${stale.email}', 'Enumeration Fixture',
          'approved', now(), '${stale.userId}'::uuid, null
        );
      `);

      const replacedNonce = randomUUID();
      await admin.rpc("prepare_signup_account_setup_recovery", {
        p_request_id: requestId,
        p_expected_profile_id: stale.userId,
        p_nonce: replacedNonce,
      });
      await admin.rpc("prepare_signup_account_setup_recovery", {
        p_request_id: requestId,
        p_expected_profile_id: stale.userId,
        p_nonce: randomUUID(),
      });
      await assertNeutral(
        "replaced nonce",
        stale.email,
        setupRedirect({ nonce: replacedNonce, ...stale }),
      );

      const consumedIdentity = await createIdentity("consumed");
      const consumedRequestId = randomUUID();
      requestIds.push(consumedRequestId);
      runLocalDbExec(`
        insert into private.signup_requests (
          id, email, normalized_email, full_name, status, reviewed_at,
          created_profile_id, onboarding_completed_at
        ) values (
          '${consumedRequestId}'::uuid, '${consumedIdentity.email}', '${consumedIdentity.email}',
          'Consumed Enumeration Fixture', 'approved', now(),
          '${consumedIdentity.userId}'::uuid, null
        );
      `);
      const consumedNonce = randomUUID();
      await admin.rpc("prepare_signup_account_setup_recovery", {
        p_request_id: consumedRequestId,
        p_expected_profile_id: consumedIdentity.userId,
        p_nonce: consumedNonce,
      });
      const consumed = await admin.rpc("service_authorize_signup_onboarding", {
        p_user_id: consumedIdentity.userId,
        p_auth_action_type: "recovery",
        p_nonce: consumedNonce,
      });
      assert.equal(consumed.error, null);
      assert.equal(consumed.data, true);
      await assertNeutral(
        "consumed nonce",
        consumedIdentity.email,
        setupRedirect({ nonce: consumedNonce, ...consumedIdentity }),
      );
    } finally {
      for (const userId of createdUserIds) {
        runLocalDbExec(`delete from private.email_delivery_queue where auth_user_id = '${userId}'::uuid;`);
      }
      for (const requestId of requestIds) {
        runLocalDbExec(`delete from private.signup_requests where id = '${requestId}'::uuid;`);
      }
      for (const userId of createdUserIds) {
        const removed = await admin.auth.admin.deleteUser(userId);
        assert.equal(removed.error, null);
      }
    }
  },
);

test(
  "ordinary password recovery remains usable without onboarding authorization",
  { timeout: 45_000 },
  async () => {
    const status = readLocalSupabaseStatus();
    const admin = createClient(status.apiUrl, status.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const recoveryClient = createClient(status.apiUrl, status.publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const email = `prl021-ordinary-${randomUUID()}@lunch.test`;
    const password = `${randomBytes(24).toString("base64url")}Cc3!`;
    let userId: string | null = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "PRL-021 Ordinary Recovery" },
      });
      assert.equal(created.error, null);
      assert.ok(created.data.user?.id);
      userId = created.data.user.id;

      const reset = await recoveryClient.auth.resetPasswordForEmail(email, {
        redirectTo: "http://127.0.0.1:3000/account/update-password",
      });
      assert.equal(reset.error, null);
      const token = latestOrdinaryRecoveryToken(userId);

      const verified = await recoveryClient.auth.verifyOtp({
        type: "recovery",
        token_hash: token,
      });
      assert.equal(verified.error, null);
      assert.equal(verified.data.user?.id, userId);

      const [requestCount] = runLocalDbQuery(`
        select count(*)::integer as count
        from private.signup_requests
        where created_profile_id = '${userId}'::uuid;
      `);
      assert.equal(requestCount?.count, 0);
    } finally {
      if (userId) {
        runLocalDbExec(`delete from private.email_delivery_queue where auth_user_id = '${userId}'::uuid;`);
        const removed = await admin.auth.admin.deleteUser(userId);
        assert.equal(removed.error, null);
      }
    }
  },
);

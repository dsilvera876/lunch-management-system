import { createHmac, timingSafeEqual } from "node:crypto";

import { getAccountSetupRecoveryPurposeSecret } from "@/lib/env/server";

const PURPOSE = "external-signup-onboarding";
const PURPOSE_VERSION = 1;
const PURPOSE_TTL_SECONDS = 10 * 60;
const MAX_FUTURE_SECONDS = PURPOSE_TTL_SECONDS + 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PURPOSE_PARAMS = new Set([
  "invite",
  "setup_nonce",
  "setup_expires",
  "setup_signature",
]);

type RecoveryPurposeIdentity = {
  nonce: string;
  recipientEmail: string;
  expectedAuthUserId: string;
};

type RecoveryPurposeOptions = {
  secret?: string;
  nowMs?: number;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateSecret(secret: string): string {
  const trimmed = secret.trim();
  if (Buffer.byteLength(trimmed, "utf8") < 32) {
    throw new Error("Recovery-purpose signing secret must contain at least 32 bytes.");
  }
  return trimmed;
}

function canonicalPurpose(input: RecoveryPurposeIdentity & { expiresAt: number }): string {
  return JSON.stringify({
    version: PURPOSE_VERSION,
    purpose: PURPOSE,
    nonce: input.nonce.toLowerCase(),
    recipient: normalizeEmail(input.recipientEmail),
    authUserId: input.expectedAuthUserId.toLowerCase(),
    expiresAt: input.expiresAt,
  });
}

function signPurpose(
  input: RecoveryPurposeIdentity & { expiresAt: number },
  secret: string,
): Buffer {
  return createHmac("sha256", validateSecret(secret))
    .update(canonicalPurpose(input), "utf8")
    .digest();
}

export function buildSignedAccountSetupRecoveryRedirect(
  input: RecoveryPurposeIdentity & { redirectTo: string },
  options: RecoveryPurposeOptions = {},
): string {
  if (!UUID_PATTERN.test(input.nonce) || !UUID_PATTERN.test(input.expectedAuthUserId)) {
    throw new Error("Recovery-purpose identity is invalid.");
  }
  if (!normalizeEmail(input.recipientEmail)) {
    throw new Error("Recovery-purpose recipient is invalid.");
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const expiresAt = nowSeconds + PURPOSE_TTL_SECONDS;
  const secret = options.secret ?? getAccountSetupRecoveryPurposeSecret();
  const signature = signPurpose({ ...input, expiresAt }, secret).toString("base64url");
  const redirect = new URL(input.redirectTo);

  redirect.search = "";
  redirect.hash = "";
  redirect.searchParams.set("invite", "1");
  redirect.searchParams.set("setup_nonce", input.nonce);
  redirect.searchParams.set("setup_expires", String(expiresAt));
  redirect.searchParams.set("setup_signature", signature);
  return redirect.toString();
}

export function verifyAccountSetupRecoveryPurpose(
  input: Omit<RecoveryPurposeIdentity, "nonce"> & {
    redirectTo: string;
    applicationOrigin: string;
  },
  options: RecoveryPurposeOptions = {},
): { nonce: string } | null {
  try {
    const redirect = new URL(input.redirectTo);
    const applicationOrigin = new URL(input.applicationOrigin).origin;
    const nonceValues = redirect.searchParams.getAll("setup_nonce");
    const expiryValues = redirect.searchParams.getAll("setup_expires");
    const signatureValues = redirect.searchParams.getAll("setup_signature");
    const inviteValues = redirect.searchParams.getAll("invite");
    const hasOnlyPurposeParams = [...redirect.searchParams.keys()].every((key) =>
      PURPOSE_PARAMS.has(key),
    );

    if (
      redirect.origin !== applicationOrigin ||
      redirect.pathname !== "/account/update-password" ||
      redirect.hash !== "" ||
      !hasOnlyPurposeParams ||
      inviteValues.length !== 1 ||
      inviteValues[0] !== "1" ||
      nonceValues.length !== 1 ||
      expiryValues.length !== 1 ||
      signatureValues.length !== 1
    ) {
      return null;
    }

    const nonce = nonceValues[0]?.trim() ?? "";
    const signature = signatureValues[0]?.trim() ?? "";
    const expiresAt = Number(expiryValues[0]);
    const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);

    if (
      !UUID_PATTERN.test(nonce) ||
      !UUID_PATTERN.test(input.expectedAuthUserId) ||
      !normalizeEmail(input.recipientEmail) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= nowSeconds ||
      expiresAt > nowSeconds + MAX_FUTURE_SECONDS ||
      !SIGNATURE_PATTERN.test(signature)
    ) {
      return null;
    }

    const providedSignature = Buffer.from(signature, "base64url");
    const expectedSignature = signPurpose(
      {
        nonce,
        recipientEmail: input.recipientEmail,
        expectedAuthUserId: input.expectedAuthUserId,
        expiresAt,
      },
      options.secret ?? getAccountSetupRecoveryPurposeSecret(),
    );

    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      return null;
    }

    return { nonce };
  } catch {
    return null;
  }
}

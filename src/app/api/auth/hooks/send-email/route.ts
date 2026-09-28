import { Webhook } from "standardwebhooks";
import { NextResponse, type NextRequest } from "next/server";

import {
  enqueueAuthSendEmailHook,
  type AuthSendEmailHookPayload,
} from "@/lib/mail/process-auth-send-email-hook";

function getHookSecret(): string | null {
  const raw = process.env.SEND_EMAIL_HOOK_SECRET?.trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/^v1,whsec_/, "");
}

function sanitizeHookError(message: string): string {
  return message
    .replace(/(password|secret|token|apikey|authorization|bearer)[=:][^\s]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

export async function POST(request: NextRequest) {
  const hookSecret = getHookSecret();
  if (!hookSecret) {
    return NextResponse.json(
      { error: { message: "Send email hook is not configured." } },
      { status: 503 },
    );
  }

  const payload = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  let verified: AuthSendEmailHookPayload;
  try {
    const wh = new Webhook(hookSecret);
    verified = wh.verify(payload, headers) as AuthSendEmailHookPayload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid hook signature.";
    return NextResponse.json(
      { error: { message: sanitizeHookError(message) } },
      { status: 401 },
    );
  }

  const enqueueStarted = performance.now();
  const result = await enqueueAuthSendEmailHook(verified);
  const enqueueDurationMs = Math.round(performance.now() - enqueueStarted);

  console.info(
    `auth-send-email-hook enqueue_duration_ms=${enqueueDurationMs} outcome=${result.success ? "ok" : "error"}`,
  );

  if (!result.success) {
    return NextResponse.json(
      { error: { message: sanitizeHookError(result.error) } },
      { status: 503 },
    );
  }

  return NextResponse.json({});
}

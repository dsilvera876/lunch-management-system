import { JAMAICA_TIME_ZONE } from "@/lib/datetime";

export function getSupportSessionRemainingMs(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): number {
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) {
    return 0;
  }
  return Math.max(0, expiresMs - nowMs);
}

export function formatSupportExpiryCountdown(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): string {
  const remainingMs = getSupportSessionRemainingMs(expiresAtIso, nowMs);

  if (remainingMs < 60_000) {
    return "Expires in less than a minute";
  }

  const minutes = Math.floor(remainingMs / 60_000);

  if (minutes === 1) {
    return "Expires in 1 minute";
  }

  return `Expires in ${minutes} minutes`;
}

/** Jamaica-local wall time for an ISO expiry instant, e.g. "11:19 PM". */
export function formatSupportExpiryJamaicaTime(expiresAtIso: string): string {
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: JAMAICA_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(expiresMs));
}

export function buildSupportExpiryAccessibleLabel(input: {
  scopeLabel: string;
  expiresAtIso: string;
  nowMs?: number;
}): string {
  const countdown = formatSupportExpiryCountdown(input.expiresAtIso, input.nowMs);
  const exactTime = formatSupportExpiryJamaicaTime(input.expiresAtIso);
  return `${input.scopeLabel} Support Mode active. ${countdown}. Expires at ${exactTime} Jamaica time.`;
}

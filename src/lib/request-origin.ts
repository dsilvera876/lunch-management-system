import { type NextRequest } from "next/server";

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(",")[0]?.trim();
  return first || null;
}

function normalizeProtocol(value: string | null): "http" | "https" | null {
  if (!value) {
    return null;
  }

  const protocol = value.toLowerCase();

  if (protocol === "http" || protocol === "https") {
    return protocol;
  }

  return null;
}

function normalizeHost(value: string | null): string | null {
  if (!value) {
    return null;
  }

  // Reject values that could alter the origin (open-redirect prevention).
  if (/[/\\@]/.test(value)) {
    return null;
  }

  return value;
}

export function getApplicationOrigin(): string {
  const configuredOrigin = getConfiguredOrigin();

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:3000";
  }

  throw new Error("APP_ORIGIN must be configured for server-side auth redirects");
}

function getConfiguredOrigin(): string | null {
  const configured = process.env.APP_ORIGIN?.trim();

  if (!configured) {
    return null;
  }

  try {
    const url = new URL(configured);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the externally visible request origin.
 * Prefers APP_ORIGIN when configured (recommended behind a reverse proxy).
 * Falls back to forwarded headers, Host, then request.url for local development.
 */
export function getExternalOrigin(request: NextRequest): string {
  const configuredOrigin = getConfiguredOrigin();

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const forwardedProto = normalizeProtocol(
    firstHeaderValue(request.headers.get("x-forwarded-proto")),
  );
  const forwardedHost = normalizeHost(
    firstHeaderValue(request.headers.get("x-forwarded-host")),
  );
  const host = normalizeHost(firstHeaderValue(request.headers.get("host")));

  const requestOrigin = new URL(request.url);

  const protocol =
    forwardedProto ??
    normalizeProtocol(requestOrigin.protocol.replace(":", "")) ??
    "http";

  const hostname = forwardedHost ?? host;

  if (hostname) {
    return `${protocol}://${hostname}`;
  }

  return requestOrigin.origin;
}

export function getExternalUrl(
  request: NextRequest,
  pathname: string,
): URL {
  return new URL(pathname, getExternalOrigin(request));
}

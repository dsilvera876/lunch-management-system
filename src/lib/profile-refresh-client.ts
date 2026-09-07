import {
  parseCurrentRoleResponse,
  shouldRefreshProfileForRole,
} from "@/lib/profile-refresh";

const CURRENT_ROLE_ENDPOINT = "/api/me/role";

/**
 * Fetches the authenticated user's current role from the server.
 * Returns null when unauthenticated or when the request fails.
 */
export async function fetchCurrentUserRole(
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetch(CURRENT_ROLE_ENDPOINT, {
      signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
    return parseCurrentRoleResponse(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }

    return null;
  }
}

/**
 * Compares the rendered role with the server role and refreshes only when they
 * differ. Safe to call after navigation or role-management mutations.
 */
export async function refreshProfileIfRoleChanged(
  renderedRole: string,
  refresh: () => void,
  signal?: AbortSignal,
): Promise<void> {
  const currentRole = await fetchCurrentUserRole(signal);

  if (signal?.aborted) {
    return;
  }

  if (shouldRefreshProfileForRole(renderedRole, currentRole)) {
    refresh();
  }
}

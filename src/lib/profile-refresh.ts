/**
 * Returns true when client navigation moved to a new pathname and a
 * lightweight role check should run.
 */
export function shouldCheckRoleOnNavigation(
  previousPathname: string | null,
  nextPathname: string,
): boolean {
  return previousPathname !== null && previousPathname !== nextPathname;
}

/**
 * Returns true when the server-reported role differs from the role currently
 * rendered in the AppShell and a router.refresh() is warranted.
 */
export function shouldRefreshProfileForRole(
  renderedRole: string,
  currentRole: string | null,
): boolean {
  return currentRole !== null && currentRole !== renderedRole;
}

/**
 * Parses the lightweight /api/me/role response body.
 */
export function parseCurrentRoleResponse(
  payload: unknown,
): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "role" in payload &&
    typeof payload.role === "string"
  ) {
    return payload.role;
  }

  return null;
}

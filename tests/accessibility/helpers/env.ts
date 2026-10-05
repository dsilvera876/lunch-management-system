export function requireStaffCredentials(): { email: string; password: string } {
  const email = process.env.E2E_STAFF_EMAIL?.trim();
  const password = process.env.E2E_STAFF_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Staff E2E credentials missing. Set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD " +
        "(see tests/accessibility/README.md). Do not commit passwords to the repo.",
    );
  }

  return { email, password };
}

export function hasStaffCredentials(): boolean {
  return Boolean(process.env.E2E_STAFF_EMAIL?.trim() && process.env.E2E_STAFF_PASSWORD);
}

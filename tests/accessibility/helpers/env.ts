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

/** Local development seed uses the same password for HR and staff accounts. */
export function requireOwnerCredentials(): { email: string; password: string } {
  const email = process.env.E2E_OWNER_EMAIL?.trim() || "owner@lunch.test";
  const password = process.env.E2E_OWNER_PASSWORD ?? process.env.E2E_STAFF_PASSWORD;

  if (!password) {
    throw new Error(
      "Owner E2E credentials missing. Set E2E_STAFF_PASSWORD (or E2E_OWNER_PASSWORD).",
    );
  }

  return { email, password };
}

export function requireHrCredentials(): { email: string; password: string } {
  const email = process.env.E2E_HR_EMAIL?.trim() || "hr@lunch.test";
  const password = process.env.E2E_HR_PASSWORD ?? process.env.E2E_STAFF_PASSWORD;

  if (!password) {
    throw new Error(
      "HR E2E credentials missing. Set E2E_STAFF_PASSWORD (or E2E_HR_PASSWORD) " +
        "and optionally E2E_HR_EMAIL (see docs/development-seed.md).",
    );
  }

  return { email, password };
}

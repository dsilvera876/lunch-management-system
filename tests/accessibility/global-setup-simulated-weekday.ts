import {
  E2E_STAFF1_OFFICE_LOCATION_ID,
  isLocalSupabaseApiUrl,
  loadLocalEnvFiles,
  probeSelfServiceOrderingState,
} from "./helpers/e2e-ordering-fixture";

/**
 * Checkout a11y on a simulated weekday (see README). Makes no DB changes: it only
 * verifies the simulated date is already open locally, so the app server started
 * with the simulated-jamaica-today preload sees open ordering.
 */
export default async function globalSetup() {
  loadLocalEnvFiles();

  const supabaseApiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!isLocalSupabaseApiUrl(supabaseApiUrl)) {
    throw new Error(
      "[a11y simulated weekday] Refusing to run — NEXT_PUBLIC_SUPABASE_URL must be loopback.",
    );
  }

  const simulatedDate = process.env.E2E_SIMULATED_JAMAICA_TODAY ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(simulatedDate)) {
    throw new Error(
      "[a11y simulated weekday] Set E2E_SIMULATED_JAMAICA_TODAY=YYYY-MM-DD (the weekday the app server simulates).",
    );
  }

  for (const officeLocationId of [E2E_STAFF1_OFFICE_LOCATION_ID, null]) {
    const probe = probeSelfServiceOrderingState(simulatedDate, officeLocationId);
    if (!probe.isOpen) {
      throw new Error(
        `[a11y simulated weekday] Ordering is not open locally for ${simulatedDate} ` +
          `(location ${officeLocationId ?? "none"}, isoWeekday=${probe.isoWeekday}, ` +
          `businessDay=${probe.isBusinessDay}, periodFinalized=${probe.periodFinalized}). ` +
          "Choose an upcoming open weekday.",
      );
    }
  }
}

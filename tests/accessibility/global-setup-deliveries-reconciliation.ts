import {
  loadLocalEnvFiles,
  markPlaywrightOrderingFixtureActive,
} from "./helpers/e2e-ordering-fixture";

/** Deliveries reconciliation E2E: load local env only (no open-ordering calendar mutation). */
export default async function globalSetup() {
  loadLocalEnvFiles();
  markPlaywrightOrderingFixtureActive();
}

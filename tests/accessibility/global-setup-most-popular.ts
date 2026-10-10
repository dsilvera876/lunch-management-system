import { loadLocalEnvFiles, markPlaywrightOrderingFixtureActive } from "./helpers/e2e-ordering-fixture";

/** Most Popular a11y: auth + ratings fixture only (no open-ordering calendar mutation). */
export default async function globalSetup() {
  loadLocalEnvFiles();
  markPlaywrightOrderingFixtureActive();
}

import {
  applyLocalStaffOrderingFixture,
  markPlaywrightOrderingFixtureActive,
} from "./helpers/e2e-ordering-fixture";

export default async function globalSetup() {
  applyLocalStaffOrderingFixture();
  markPlaywrightOrderingFixtureActive();
}

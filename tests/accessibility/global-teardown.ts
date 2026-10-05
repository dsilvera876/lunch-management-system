import { teardownLocalStaffOrderingFixture } from "./helpers/e2e-ordering-fixture";

export default async function globalTeardown() {
  teardownLocalStaffOrderingFixture();
}

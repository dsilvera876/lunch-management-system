import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATIONAL_ORDER_EMPLOYEE_PROFILE_FKEY,
  OPERATIONAL_ORDER_LATE_CREATOR_PROFILE_FKEY,
  OPERATIONAL_ORDERS_SELECT,
} from "./operational-orders-data";

describe("OPERATIONAL_ORDERS_SELECT PostgREST embeds", () => {
  it("uses the profile_id FK for the employee profile relationship", () => {
    assert.equal(OPERATIONAL_ORDER_EMPLOYEE_PROFILE_FKEY, "orders_profile_id_fkey");
    assert.match(
      OPERATIONAL_ORDERS_SELECT,
      new RegExp(`profiles!${OPERATIONAL_ORDER_EMPLOYEE_PROFILE_FKEY}\\s*\\(`),
    );
  });

  it("does not leave an unqualified profiles embed on orders", () => {
    assert.doesNotMatch(OPERATIONAL_ORDERS_SELECT, /\n\s+profiles\s+\(/);
  });

  it("names the late-order creator via its own FK hint", () => {
    assert.equal(
      OPERATIONAL_ORDER_LATE_CREATOR_PROFILE_FKEY,
      "orders_late_order_created_by_fkey",
    );
    assert.match(
      OPERATIONAL_ORDERS_SELECT,
      new RegExp(
        `late_order_creator:profiles!${OPERATIONAL_ORDER_LATE_CREATOR_PROFILE_FKEY}`,
      ),
    );
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  OFFICE_LOCATION_IN_USE_DELETION_MESSAGE,
  PROVIDER_IN_USE_DELETION_MESSAGE,
} from "./unused-record-deletion";

describe("unused record deletion UI", () => {
  it("requires confirmation before permanent deletion", () => {
    const formSource = readFileSync(
      new URL("../components/permanent-delete-form.tsx", import.meta.url),
      "utf8",
    );

    assert.match(formSource, /confirmMessage/);
    assert.match(formSource, /FormSubmitButton/);
    assert.match(formSource, /Delete permanently/);

    const providerDetail = readFileSync(
      new URL("../app/admin/providers/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(providerDetail, /cannot be undone/i);
  });

  it("uses shared FormActionStatus banners for delete outcomes", () => {
    const providerPage = readFileSync(
      new URL("../app/admin/providers/page.tsx", import.meta.url),
      "utf8",
    );
    const providerDetail = readFileSync(
      new URL("../app/admin/providers/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    const locationDetail = readFileSync(
      new URL("../app/admin/locations/[id]/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(providerPage, /deleted permanently/);
    assert.match(providerPage, /Alert variant="success"/);
    assert.match(providerDetail, /PROVIDER_IN_USE_DELETION_MESSAGE/);
    assert.match(providerDetail, /Alert variant="error"/);
    assert.match(locationDetail, /OFFICE_LOCATION_IN_USE_DELETION_MESSAGE/);
  });

  it("calls hardened delete RPCs from server actions", () => {
    const providerActions = readFileSync(
      new URL("../app/admin/providers/actions.ts", import.meta.url),
      "utf8",
    );
    const locationActions = readFileSync(
      new URL("../app/admin/locations/actions.ts", import.meta.url),
      "utf8",
    );

    assert.match(providerActions, /delete_unused_lunch_provider/);
    assert.match(locationActions, /delete_unused_office_location/);
  });

  it("documents dependency-safe error messages", () => {
    assert.match(PROVIDER_IN_USE_DELETION_MESSAGE, /Deactivate it instead/);
    assert.match(OFFICE_LOCATION_IN_USE_DELETION_MESSAGE, /Deactivate it instead/);
  });

  it("keeps inactive records out of new-order selection flows", () => {
    const staffOrdering = readFileSync(
      new URL("./staff-ordering.ts", import.meta.url),
      "utf8",
    );
    const lateOrdersPage = readFileSync(
      new URL("../app/admin/late-orders/page.tsx", import.meta.url),
      "utf8",
    );
    const lunchPage = readFileSync(
      new URL("../app/lunch/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(staffOrdering, /\.eq\("active", true\)/);
    assert.match(lateOrdersPage, /\.eq\("active", true\)/);
    assert.match(lateOrdersPage, /\.eq\("is_active", true\)/);
    assert.match(lunchPage, /\.eq\("is_active", true\)/);
  });
});

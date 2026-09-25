import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_PROVIDER_ICON_KEY,
  PROVIDER_ICON_ASSETS,
  PROVIDER_ICON_DEFINITIONS,
  PROVIDER_ICON_KEYS,
  PROVIDER_ICON_ARTWORK_PX,
  getProviderIconArtworkPx,
  getProviderIconAssetPath,
  getProviderIconLabel,
  parseProviderIconKey,
} from "./provider-icons";

describe("provider icon registry", () => {
  it("exposes a curated set of stable keys with labels", () => {
    assert.ok(PROVIDER_ICON_KEYS.length >= 6);
    assert.ok(PROVIDER_ICON_KEYS.length <= 10);
    assert.deepEqual(
      PROVIDER_ICON_DEFINITIONS.map((row) => row.key),
      [...PROVIDER_ICON_KEYS],
    );
    for (const row of PROVIDER_ICON_DEFINITIONS) {
      assert.ok(row.label.length > 0);
      assert.match(row.assetPath, /^\/provider-icons\/[a-z-]+\.png$/);
    }
  });

  it("maps each key to the correct PNG asset path", () => {
    assert.equal(PROVIDER_ICON_ASSETS.utensils, "/provider-icons/utensils.png");
    assert.equal(PROVIDER_ICON_ASSETS.bowl, "/provider-icons/bowl.png");
    assert.equal(PROVIDER_ICON_ASSETS.fruit, "/provider-icons/fruit.png");
    assert.equal(PROVIDER_ICON_ASSETS.drink, "/provider-icons/drink.png");
    assert.equal(PROVIDER_ICON_ASSETS.pizza, "/provider-icons/pizza.png");
    assert.equal(PROVIDER_ICON_ASSETS.burger, "/provider-icons/burger.png");
    assert.equal(PROVIDER_ICON_ASSETS.leaf, "/provider-icons/leaf.png");
    assert.equal(PROVIDER_ICON_ASSETS["food-bag"], "/provider-icons/food-bag.png");

    for (const key of PROVIDER_ICON_KEYS) {
      assert.equal(getProviderIconAssetPath(key), PROVIDER_ICON_ASSETS[key]);
      assert.equal(getProviderIconLabel(key), PROVIDER_ICON_DEFINITIONS.find((row) => row.key === key)?.label);
    }
  });

  it("defaults and invalid values resolve to utensils", () => {
    assert.equal(DEFAULT_PROVIDER_ICON_KEY, "utensils");
    assert.equal(parseProviderIconKey(null), "utensils");
    assert.equal(parseProviderIconKey(undefined), "utensils");
    assert.equal(parseProviderIconKey(""), "utensils");
    assert.equal(parseProviderIconKey("not-a-real-icon"), "utensils");
    assert.equal(parseProviderIconKey("emoji-🍕"), "utensils");
    assert.equal(getProviderIconAssetPath(parseProviderIconKey("invalid")), "/provider-icons/utensils.png");
  });

  it("accepts each supported key", () => {
    for (const key of PROVIDER_ICON_KEYS) {
      assert.equal(parseProviderIconKey(key), key);
    }
  });

  it("exposes centralized artwork size variants", () => {
    assert.equal(PROVIDER_ICON_ARTWORK_PX.small, 26);
    assert.equal(PROVIDER_ICON_ARTWORK_PX.medium, 34);
    assert.equal(PROVIDER_ICON_ARTWORK_PX.large, 40);
    assert.equal(PROVIDER_ICON_ARTWORK_PX.picker, 36);
    assert.equal(getProviderIconArtworkPx("medium"), 34);
    assert.ok(getProviderIconArtworkPx("picker") >= 34);
    assert.ok(getProviderIconArtworkPx("picker") <= 38);
  });
});

describe("provider icon UI wiring", () => {
  it("overview and manage menu use shared provider icon helpers", () => {
    const overview = readFileSync(
      new URL("../components/admin/lunch-providers/providers-overview.tsx", import.meta.url),
      "utf8",
    );
    const manageMenu = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );
    const addDrawer = readFileSync(
      new URL("../components/admin/lunch-providers/add-provider-drawer.tsx", import.meta.url),
      "utf8",
    );
    const editPage = readFileSync(
      new URL("../app/admin/providers/[id]/edit/page.tsx", import.meta.url),
      "utf8",
    );
    const actions = readFileSync(
      new URL("../app/admin/providers/actions.ts", import.meta.url),
      "utf8",
    );
    const picker = readFileSync(
      new URL("../components/admin/lunch-providers/provider-icon-picker.tsx", import.meta.url),
      "utf8",
    );
    const registry = readFileSync(
      new URL("./provider-icons.tsx", import.meta.url),
      "utf8",
    );

    assert.match(overview, /ProviderIconWell iconKey=\{provider\.iconKey\} size="medium"/);
    assert.match(overview, /IconUtensils/);
    assert.match(overview, /IconPencil/);
    assert.doesNotMatch(overview, /IconSliders/);
    assert.match(overview, /Manage Menu/);
    assert.match(overview, /minmax\(15rem,18rem\)/);

    assert.match(manageMenu, /ProviderIconWell iconKey=\{provider\.iconKey\} size="large"/);
    assert.doesNotMatch(manageMenu, /<IconUtensils aria-hidden \/>/);

    const detailsFields = readFileSync(
      new URL("../components/admin/lunch-providers/provider-details-fields.tsx", import.meta.url),
      "utf8",
    );
    assert.match(addDrawer, /ProviderDetailsFields/);
    assert.match(editPage, /ProviderDetailsFields/);
    assert.match(detailsFields, /ProviderIconPicker/);
    assert.match(actions, /parseProviderIconKey/);
    assert.match(actions, /icon_key/);

    assert.match(picker, /grid-cols-4/);
    assert.match(picker, /PROVIDER_ICON_DEFINITIONS/);
    assert.match(picker, /ProviderIcon iconKey=\{key\} size="picker"/);
    assert.doesNotMatch(picker, /size=\{22\}/);

    assert.match(registry, /PROVIDER_ICON_ASSETS/);
    assert.match(registry, /PROVIDER_ICON_ARTWORK_PX/);
    assert.match(registry, /next\/image/);
    assert.match(registry, /object-contain/);
  });
});

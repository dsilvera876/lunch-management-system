import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildManageMenuSectionsForView,
  buildManageMenuSectionsForWeekday,
  buildProviderMenuCountParts,
  buildProviderMenuMetrics,
  collectActiveProviderWeekdays,
  filterActiveMenuItemsForWeekday,
  filterMenuItemsForWeekday,
  formatLateOrdersOverviewLabel,
  formatProviderMenuCountsLine,
  MANAGE_MENU_ALL_DAYS,
  MANAGE_MENU_WEEKDAYS,
  mergeManageMenuItem,
  type ManageMenuItemRecord,
} from "./lunch-providers-presentation";

describe("lunch providers presentation", () => {
  it("builds compact provider menu count parts without zero categories", () => {
    const parts = buildProviderMenuCountParts([
      { item_type: "main", active: true, display_category: null },
      { item_type: "main", active: true, display_category: null },
      { item_type: "side", active: true, display_category: null },
      { item_type: "standalone", active: true, display_category: "Juices" },
      { item_type: "standalone", active: false, display_category: "Fruit" },
    ]);

    assert.deepEqual(parts, ["2 Mains", "1 Side", "1 Juice"]);
    assert.equal(formatProviderMenuCountsLine(parts), "2 Mains · 1 Side · 1 Juice");
  });

  it("uses display categories and standalone fallback for overview metrics", () => {
    const metrics = buildProviderMenuMetrics([
      { item_type: "standalone", active: true, display_category: "Fruit" },
      { item_type: "standalone", active: true, display_category: "Fruit" },
      { item_type: "standalone", active: true, display_category: null },
      { item_type: "standalone", active: true, display_category: "" },
      { item_type: "standalone", active: true, display_category: "Juices" },
    ]);

    assert.deepEqual(metrics, [
      { value: 2, label: "Fruit items" },
      { value: 1, label: "Juice" },
      { value: 2, label: "Standalone" },
    ]);
  });

  it("omits zero-count menu metrics", () => {
    assert.deepEqual(
      buildProviderMenuMetrics([
        { item_type: "main", active: false, display_category: null },
        { item_type: "side", active: false, display_category: null },
      ]),
      [],
    );
  });

  it("filters recurring menu items by weekday", () => {
    const items = [
      { id: "a", weekdays: [1, 3] },
      { id: "b", weekdays: [2] },
    ] as Array<{ id: string; weekdays: number[] }>;

    const monday = filterMenuItemsForWeekday(items, 1);
    assert.deepEqual(
      monday.map((item) => item.id),
      ["a"],
    );
  });

  it("groups weekday menu into mains, sides, and standalone categories", () => {
    const sections = buildManageMenuSectionsForWeekday(
      [
        {
          id: "1",
          name: "BBQ Chicken",
          description: null,
          price: 850,
          itemType: "main",
          unitLabel: "Each",
          displayCategory: null,
          active: true,
          weekdays: [1, 2, 3, 4, 5],
        },
        {
          id: "2",
          name: "Plain Rice",
          description: null,
          price: 300,
          itemType: "side",
          unitLabel: "Each",
          displayCategory: null,
          active: true,
          weekdays: [1],
        },
        {
          id: "3",
          name: "Orange Juice",
          description: null,
          price: 250,
          itemType: "standalone",
          unitLabel: "Bottle",
          displayCategory: "Juices",
          active: true,
          weekdays: [1],
        },
      ],
      1,
    );

    assert.equal(sections.length, 3);
    assert.equal(sections[0]?.label, "Mains");
    assert.equal(sections[1]?.label, "Sides");
    assert.equal(sections[2]?.label, "Juices");
  });

  it("labels late orders for provider cards", () => {
    assert.equal(formatLateOrdersOverviewLabel(true), "Enabled");
    assert.equal(formatLateOrdersOverviewLabel(false), "Disabled");
  });

  it("shows all recurring items in All Days view and filters weekday tabs", () => {
    const items = [
      {
        id: "a",
        name: "Monday Main",
        description: null,
        price: 100,
        itemType: "main" as const,
        unitLabel: "Each",
        displayCategory: null,
        active: true,
        weekdays: [1],
      },
      {
        id: "b",
        name: "Tuesday Side",
        description: null,
        price: 50,
        itemType: "side" as const,
        unitLabel: "Each",
        displayCategory: null,
        active: false,
        weekdays: [2],
      },
    ];

    const allSections = buildManageMenuSectionsForView(items, MANAGE_MENU_ALL_DAYS);
    assert.equal(allSections.flatMap((section) => section.items).length, 2);

    const tuesdaySections = buildManageMenuSectionsForView(items, 2);
    assert.deepEqual(
      tuesdaySections.flatMap((section) => section.items.map((item) => item.id)),
      [],
    );

    const mondaySections = buildManageMenuSectionsForView(items, 1);
    assert.deepEqual(
      mondaySections.flatMap((section) => section.items.map((item) => item.id)),
      ["a"],
    );
  });

  it("keeps inactive items in All Days but excludes them from weekday tabs", () => {
    const base = [
      {
        id: "tue-item",
        name: "Tuesday Special",
        description: null,
        price: 100,
        itemType: "main" as const,
        unitLabel: "Each",
        displayCategory: null,
        active: true,
        weekdays: [2],
      },
    ];

    let menuItems: ManageMenuItemRecord[] = [...base];

    menuItems = mergeManageMenuItem(menuItems, { ...base[0], active: false });

    assert.deepEqual(
      buildManageMenuSectionsForView(menuItems, MANAGE_MENU_ALL_DAYS)
        .flatMap((section) => section.items.map((item) => item.id)),
      ["tue-item"],
    );
    assert.equal(
      buildManageMenuSectionsForView(menuItems, 2).flatMap((section) => section.items)
        .length,
      0,
    );

    menuItems = mergeManageMenuItem(menuItems, { ...base[0], active: true });

    assert.deepEqual(
      buildManageMenuSectionsForView(menuItems, 2).flatMap((section) => section.items.map(
        (item) => item.id,
      )),
      ["tue-item"],
    );
  });

  it("filters weekday tabs to active items configured for that day", () => {
    const items = [
      { id: "1", weekdays: [1], active: true },
      { id: "2", weekdays: [1], active: false },
      { id: "3", weekdays: [2], active: true },
    ] as Array<{ id: string; weekdays: number[]; active: boolean }>;

    assert.deepEqual(
      filterActiveMenuItemsForWeekday(items, 1).map((item) => item.id),
      ["1"],
    );
    assert.deepEqual(
      filterMenuItemsForWeekday(items, 1).map((item) => item.id),
      ["1", "2"],
    );
  });

  it("merges menu items by id without duplicates", () => {
    const existing = [
      {
        id: "a",
        name: "A",
        description: null,
        price: 1,
        itemType: "main" as const,
        unitLabel: "Each",
        displayCategory: null,
        active: true,
        weekdays: [1],
      },
    ];

    const updated = { ...existing[0], name: "A updated", weekdays: [1, 2] };
    const merged = mergeManageMenuItem(existing, updated);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.name, "A updated");
    assert.deepEqual(merged[0]?.weekdays, [1, 2]);
  });

  it("collects active weekday pills for provider cards", () => {
    assert.deepEqual(
      collectActiveProviderWeekdays([
        { active: true, weekdays: [1, 3] },
        { active: false, weekdays: [2] },
        { active: true, weekdays: [5] },
      ]),
      [1, 3, 5],
    );
    assert.equal(MANAGE_MENU_WEEKDAYS.length, 5);
  });
});

describe("lunch providers UI wiring", () => {
  it("uses overview directory, manage menu workspace, and edit provider route", () => {
    const overviewPage = readFileSync(
      new URL("../app/admin/providers/page.tsx", import.meta.url),
      "utf8",
    );
    const managePage = readFileSync(
      new URL("../app/admin/providers/[id]/page.tsx", import.meta.url),
      "utf8",
    );
    const editPage = readFileSync(
      new URL("../app/admin/providers/[id]/edit/page.tsx", import.meta.url),
      "utf8",
    );
    const overview = readFileSync(
      new URL("../components/admin/lunch-providers/providers-overview.tsx", import.meta.url),
      "utf8",
    );
    const manageMenu = readFileSync(
      new URL("../components/admin/lunch-providers/manage-menu-workspace.tsx", import.meta.url),
      "utf8",
    );
    const editorPanel = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-editor-panel.tsx", import.meta.url),
      "utf8",
    );
    const lateSettings = readFileSync(
      new URL("../components/admin/provider-late-order-settings.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(overviewPage, /CutoffControl/);
    assert.doesNotMatch(overviewPage, /Add provider/);
    assert.match(overview, /Manage Menu/);
    assert.match(overview, /AddProviderDrawer/);
    assert.match(overview, /ProviderIconWell/);

    assert.match(managePage, /ManageMenuWorkspace/);
    assert.doesNotMatch(managePage, /Menu item added/);
    assert.doesNotMatch(managePage, /variant="success"/);
    assert.doesNotMatch(managePage, /ProviderLateOrderSettings/);
    assert.match(manageMenu, /MANAGE_MENU_WEEKDAYS/);
    assert.match(manageMenu, /buildManageMenuSectionsForView/);
    assert.match(manageMenu, /MANAGE_MENU_ALL_DAYS/);
    assert.match(manageMenu, /MenuItemEditorPanel/);
    assert.match(editorPanel, /createProviderMenuItemInline/);
    assert.match(manageMenu, /mergeManageMenuItem/);
    assert.match(manageMenu, /editingItemId/);
    assert.match(manageMenu, /selectItemForEdit/);
    assert.match(manageMenu, /ManageMenuItemWeekdayPills/);
    assert.match(manageMenu, /pageWeekday/);
    assert.doesNotMatch(manageMenu, /ManageMenuItemTypeBadge/);
    assert.doesNotMatch(manageMenu, /<th[^>]*>Type<\/th>/);
    assert.match(manageMenu, /w-\[13rem\]/);
    assert.match(manageMenu, /IconPencil/);
    assert.doesNotMatch(manageMenu, /formatWeekdayList/);
    assert.doesNotMatch(manageMenu, /\+ Add menu item/);
    assert.doesNotMatch(manageMenu, /MenuItemDrawer/);

    assert.match(editorPanel, /MenuItemFormFields/);
    assert.match(editorPanel, /addSession/);

    const menuItemFormFields = readFileSync(
      new URL("../components/admin/lunch-providers/menu-item-form-fields.tsx", import.meta.url),
      "utf8",
    );
    assert.match(menuItemFormFields, /MenuItemTypeFields/);
    assert.match(menuItemFormFields, /WeekdayPicker/);
    assert.doesNotMatch(menuItemFormFields, /Price \(JMD\)/);
    assert.match(manageMenu, /ToastProvider/);
    assert.doesNotMatch(manageMenu, /All providers/);

    assert.match(editorPanel, /MenuItemFormFields/);
    assert.match(editorPanel, /updateProviderMenuItemInline/);
    assert.match(editorPanel, /toggleProviderMenuItemActiveInline/);
    assert.match(editorPanel, /deleteProviderMenuItemInline/);
    assert.match(editorPanel, /Cancel editing/);

    assert.match(editPage, /ProviderLateOrderSettings/);
    assert.match(editPage, /ProviderDangerZone/);
    assert.match(editPage, /max-w-6xl/);
    assert.match(editPage, /ProviderDetailsFields/);
    assert.match(editPage, /ProviderEditWorkspace/);
    assert.doesNotMatch(editPage, /All providers/);
    assert.doesNotMatch(editPage, /variant="success"/);
    assert.match(overview, /ToastProvider/);
    assert.doesNotMatch(
      readFileSync(new URL("../app/admin/providers/page.tsx", import.meta.url), "utf8"),
      /Provider created successfully/,
    );
    assert.match(manageMenu, /MenuCategoryIconWell/);
    assert.match(overview, /collectActiveProviderWeekdays/);
    assert.match(overview, /line-clamp-2/);
    assert.match(overview, /buildProviderMenuMetrics/);
    assert.match(overview, /IconCalendar/);
    assert.match(overview, /IconClock/);
    assert.match(overview, /Edit details and late-order settings/);
    assert.match(overview, /IconPencil/);
    assert.match(overview, /IconUtensils/);
    assert.match(overview, /ProviderIconWell/);
    assert.match(manageMenu, /ProviderIconWell/);
    assert.match(lateSettings, /supplementalDispatchMode/);
    assert.match(lateSettings, /automaticSupplementSendDay/);
  });
});

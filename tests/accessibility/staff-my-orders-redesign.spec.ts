import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoUnintendedHorizontalPageScroll } from "./helpers/layout";
import { applySimulatedJamaicaToday } from "./helpers/simulated-weekday";
import { expectNoAxeViolations } from "./helpers/axe";
import { runLocalDbExec, runLocalDbQuery } from "./helpers/e2e-local-db";

const CANCELLATION_FIXTURE = {
  groupId: "92000001-0001-4001-8001-000000000001",
  firstOrderId: "92000002-0002-4002-8002-000000000002",
  siblingOrderId: "92000003-0003-4003-8003-000000000003",
  sourceFirstOrderId: "60000001-0001-4001-8001-000000000001",
  sourceSiblingOrderId: "60000002-0002-4002-8002-000000000002",
  firstMarker: "E2E cancellation target",
  siblingMarker: "E2E cancellation sibling",
} as const;

const DATE_GROUPING_FIXTURE = {
  firstGroupId: "93000001-0001-4001-8001-000000000001",
  secondGroupId: "93000002-0002-4002-8002-000000000002",
  firstOrderId: "93000003-0003-4003-8003-000000000003",
  secondOrderId: "93000004-0004-4004-8004-000000000004",
  sourceFirstOrderId: CANCELLATION_FIXTURE.sourceFirstOrderId,
  sourceSecondOrderId: CANCELLATION_FIXTURE.sourceSiblingOrderId,
  firstMarker: "E2E same-date first checkout",
  secondMarker: "E2E same-date second checkout",
} as const;

function cleanupDateGroupingFixture() {
  runLocalDbExec(`
    delete from public.orders
    where id in (
      '${DATE_GROUPING_FIXTURE.firstOrderId}'::uuid,
      '${DATE_GROUPING_FIXTURE.secondOrderId}'::uuid
    );
  `);
}

function prepareDateGroupingFixture() {
  cleanupDateGroupingFixture();
  runLocalDbExec(`
    do $fixture$
    begin
      insert into public.orders (
      id,
      profile_id,
      lunch_day_id,
      status,
      delivery_state,
      financial_disposition,
      special_instructions,
      meal_quantity,
      office_location_id,
      office_location_name,
      office_location_address,
      order_group_id,
      is_late_order,
      created_at,
      updated_at
    )
    select
      case o.id
        when '${DATE_GROUPING_FIXTURE.sourceFirstOrderId}'::uuid
          then '${DATE_GROUPING_FIXTURE.firstOrderId}'::uuid
        else '${DATE_GROUPING_FIXTURE.secondOrderId}'::uuid
      end,
      o.profile_id,
      o.lunch_day_id,
      'submitted',
      'pending',
      'chargeable',
      case o.id
        when '${DATE_GROUPING_FIXTURE.sourceFirstOrderId}'::uuid
          then '${DATE_GROUPING_FIXTURE.firstMarker}'
        else '${DATE_GROUPING_FIXTURE.secondMarker}'
      end,
      o.meal_quantity,
      o.office_location_id,
      o.office_location_name,
      o.office_location_address,
      case o.id
        when '${DATE_GROUPING_FIXTURE.sourceFirstOrderId}'::uuid
          then '${DATE_GROUPING_FIXTURE.firstGroupId}'::uuid
        else '${DATE_GROUPING_FIXTURE.secondGroupId}'::uuid
      end,
      false,
      now() + case o.id
        when '${DATE_GROUPING_FIXTURE.sourceFirstOrderId}'::uuid then interval '3 seconds'
        else interval '4 seconds'
      end,
      now()
      from public.orders o
      where o.id in (
        '${DATE_GROUPING_FIXTURE.sourceFirstOrderId}'::uuid,
        '${DATE_GROUPING_FIXTURE.sourceSecondOrderId}'::uuid
      );

      insert into public.order_items (
      order_id,
      menu_item_id,
      lunch_day_id,
      quantity,
      unit_price,
      created_at
    )
    select
      case oi.order_id
        when '${DATE_GROUPING_FIXTURE.sourceFirstOrderId}'::uuid
          then '${DATE_GROUPING_FIXTURE.firstOrderId}'::uuid
        else '${DATE_GROUPING_FIXTURE.secondOrderId}'::uuid
      end,
      oi.menu_item_id,
      oi.lunch_day_id,
      oi.quantity,
      oi.unit_price,
      now()
      from public.order_items oi
      where oi.order_id in (
        '${DATE_GROUPING_FIXTURE.sourceFirstOrderId}'::uuid,
        '${DATE_GROUPING_FIXTURE.sourceSecondOrderId}'::uuid
      );
    end;
    $fixture$;
  `);
}

function cleanupCancellationFixture() {
  runLocalDbExec(`
    do $fixture$
    declare
      v_batch_ids uuid[];
    begin
      select coalesce(array_agg(distinct d.batch_id), '{}'::uuid[])
      into v_batch_ids
      from private.notification_delivery_log d
      where d.order_id in (
        '${CANCELLATION_FIXTURE.firstOrderId}'::uuid,
        '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
      )
        and d.batch_id is not null;

      delete from private.notification_delivery_log
      where order_id in (
        '${CANCELLATION_FIXTURE.firstOrderId}'::uuid,
        '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
      );

      delete from private.notification_delivery_batch b
      where b.id = any(v_batch_ids)
        and not exists (
          select 1 from private.notification_delivery_log d where d.batch_id = b.id
        );

      delete from public.order_delivery_events
      where order_id in (
        '${CANCELLATION_FIXTURE.firstOrderId}'::uuid,
        '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
      );

      delete from public.orders
      where id in (
        '${CANCELLATION_FIXTURE.firstOrderId}'::uuid,
        '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
      );
    end;
    $fixture$;
  `);
}

function prepareCancellationFixture() {
  cleanupCancellationFixture();
  runLocalDbExec(`
    do $fixture$
    begin
      insert into public.orders (
      id,
      profile_id,
      lunch_day_id,
      status,
      delivery_state,
      financial_disposition,
      special_instructions,
      meal_quantity,
      office_location_id,
      office_location_name,
      office_location_address,
      order_group_id,
      is_late_order,
      created_at,
      updated_at
    )
    select
      case o.id
        when '${CANCELLATION_FIXTURE.sourceFirstOrderId}'::uuid
          then '${CANCELLATION_FIXTURE.firstOrderId}'::uuid
        else '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
      end,
      o.profile_id,
      o.lunch_day_id,
      'submitted',
      'pending',
      'chargeable',
      case o.id
        when '${CANCELLATION_FIXTURE.sourceFirstOrderId}'::uuid
          then '${CANCELLATION_FIXTURE.firstMarker}'
        else '${CANCELLATION_FIXTURE.siblingMarker}'
      end,
      o.meal_quantity,
      o.office_location_id,
      o.office_location_name,
      o.office_location_address,
      '${CANCELLATION_FIXTURE.groupId}'::uuid,
      false,
      now() + case o.id
        when '${CANCELLATION_FIXTURE.sourceFirstOrderId}'::uuid then interval '1 second'
        else interval '2 seconds'
      end,
      now()
      from public.orders o
      where o.id in (
        '${CANCELLATION_FIXTURE.sourceFirstOrderId}'::uuid,
        '${CANCELLATION_FIXTURE.sourceSiblingOrderId}'::uuid
      );

      insert into public.order_items (
      order_id,
      menu_item_id,
      lunch_day_id,
      quantity,
      unit_price,
      created_at
    )
    select
      case oi.order_id
        when '${CANCELLATION_FIXTURE.sourceFirstOrderId}'::uuid
          then '${CANCELLATION_FIXTURE.firstOrderId}'::uuid
        else '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
      end,
      oi.menu_item_id,
      oi.lunch_day_id,
      oi.quantity,
      oi.unit_price,
      now()
      from public.order_items oi
      where oi.order_id in (
        '${CANCELLATION_FIXTURE.sourceFirstOrderId}'::uuid,
        '${CANCELLATION_FIXTURE.sourceSiblingOrderId}'::uuid
      );
    end;
    $fixture$;
  `);

  const created = runLocalDbQuery(`
    select count(*)::integer as count
    from public.orders
    where order_group_id = '${CANCELLATION_FIXTURE.groupId}'::uuid
  `);
  expect(Number(created[0]?.count)).toBe(2);
}

test.beforeEach(async ({ context, page }) => {
  await applySimulatedJamaicaToday(context);
  await page.goto("/my-orders");
  await expect(page.getByRole("heading", { name: "My Orders" })).toBeVisible();
});

function firstExpandedCheckout(page: Page): Locator {
  return page.getByTestId("delivery-date-group").filter({
    has: page.getByTestId("provider-order-card"),
  }).first();
}

/** Navigation is idempotent; retry only until the client-owned tab survives hydration. */
async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();
}

test.describe("Staff My Orders redesign", () => {
  test.describe.configure({ mode: "serial" });
  test("groups provider cards under one delivery date and preserves authoritative summaries and actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const checkout = firstExpandedCheckout(page);
    const providerCards = checkout.getByTestId("provider-order-card");
    const summary = checkout.getByTestId("checkout-financial-summary");

    await expect(providerCards).toHaveCount(2);
    await expect(summary).toBeVisible();
    await expect(checkout.getByRole("link", { name: "View order" })).toHaveCount(0);
    await expect(checkout.getByRole("link", { name: /^Edit order from / })).toHaveCount(2);
    await expect(checkout.getByRole("button", { name: /^Cancel order from / })).toHaveCount(2);
    await expect(checkout.locator('[data-testid="checkout-subgroup"] > p')).toHaveCount(0);
    await expect(checkout.locator('[data-testid="checkout-subgroup"] > footer')).toHaveCount(0);

    for (const [index, card] of (await providerCards.all()).entries()) {
      const providerName = (await card.getByRole("heading", { level: 4 }).textContent())?.trim();
      expect(providerName).toBeTruthy();
      await expect(card).toHaveAccessibleName(providerName!);
      await expect(card.getByText(/Order \d+ of 2/)).toBeVisible();
      await expect(card.getByText("Submitted", { exact: true })).toBeVisible();
      await expect(card.getByText("Order total", { exact: true })).toBeVisible();
      const metadata = card.getByTestId("provider-order-metadata");
      await expect(metadata).toContainText("Ordered");
      await expect(metadata).toContainText("Delivery to");
      await expect(card.getByTestId("provider-icon")).toHaveAttribute(
        "data-provider-icon-key",
        /^(utensils|bowl|fruit|drink|pizza|burger|leaf|food-bag)$/,
      );
      await expect(card.getByTestId("provider-icon")).toHaveAttribute("aria-hidden", "true");
      await expect(card.getByTestId("provider-icon").locator("img")).toBeVisible();
      await expect(card.getByRole("link", { name: `Edit order from ${providerName}`, exact: true })).toBeVisible();
      await expect(card.getByRole("button", { name: `Cancel order from ${providerName}`, exact: true })).toBeVisible();
      await expect(card.getByTestId("order-price-leader").first()).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      await expect(card.getByText("Price:", { exact: true }).first()).toBeAttached();

      const cardTotal = (await card.locator("footer strong").textContent())?.trim();
      expect(cardTotal).toBeTruthy();
      await expect(summary.getByRole("listitem").nth(index)).toContainText(cardTotal!);
    }

    await expect(summary).toContainText("You Pay");
    await expect(summary).toContainText("2 orders from 2 providers");
    await expect(summary.getByText("Subtotal", { exact: true })).toBeVisible();
    await expect(summary.getByText("Lunch subsidy", { exact: true })).toBeVisible();

    const firstCardBox = await providerCards.first().boundingBox();
    const summaryBox = await summary.boundingBox();
    expect(firstCardBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();
    expect(summaryBox!.x).toBeGreaterThanOrEqual(firstCardBox!.x + firstCardBox!.width - 2);

    await expect(page.getByRole("tab", { name: "Upcoming" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Past Orders" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Cancelled" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Late order submissions" })).toBeVisible();
    await expectNoAxeViolations(page, "My Orders redesigned checkout", { mainContentOnly: true });

    const firstProviderName = (await providerCards.first().getByRole("heading", { level: 4 }).textContent())!.trim();
    const cancel = providerCards.first().getByRole("button", {
      name: `Cancel order from ${firstProviderName}`,
      exact: true,
    });
    const cancelContrast = await cancel.evaluate((element) => {
      const parseRgb = (value: string) =>
        value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      const luminance = (rgb: number[]) => {
        const channels = rgb.map((value) => {
          const normalized = value / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
      };
      const styles = getComputedStyle(element);
      const foreground = luminance(parseRgb(styles.color));
      const background = luminance(parseRgb(styles.backgroundColor));
      return {
        ratio: (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05),
        background: styles.backgroundColor,
      };
    });
    expect(cancelContrast.ratio).toBeGreaterThanOrEqual(4.5);
    expect(cancelContrast.background).not.toBe("rgb(220, 38, 38)");
    await cancel.hover();
    await expect.poll(
      () => cancel.evaluate((element) => getComputedStyle(element).color),
    ).toBe("rgb(255, 255, 255)");
    const hoverContrast = await cancel.evaluate((element) => {
      const toRgb = (value: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
      };
      const luminance = (rgb: number[]) => {
        const channels = rgb.map((value) => {
          const normalized = value / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
      };
      const styles = getComputedStyle(element);
      const foreground = toRgb(styles.color);
      const background = toRgb(styles.backgroundColor);
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return {
        foregroundCss: styles.color,
        backgroundCss: styles.backgroundColor,
        foreground,
        background,
        ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
      };
    });
    expect(hoverContrast.foregroundCss).toBe("rgb(255, 255, 255)");
    expect(hoverContrast.backgroundCss).not.toBe(cancelContrast.background);
    expect(hoverContrast.foreground).toEqual([255, 255, 255]);
    expect(hoverContrast.background[0]).toBeGreaterThan(hoverContrast.background[1]!);
    expect(hoverContrast.ratio).toBeGreaterThanOrEqual(4.5);
    await page.mouse.move(0, 0);
    let confirmationMessage = "";
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      confirmationMessage = dialog.message();
      await dialog.dismiss();
    });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Enter");
    expect(confirmationMessage).toContain(firstProviderName);
    expect(confirmationMessage).toContain("order 1 of 2");
    await expect(page).toHaveURL(/\/my-orders(?:\?|$)/);

    await providerCards.first().getByRole("link", {
      name: `Edit order from ${firstProviderName}`,
      exact: true,
    }).click();
    await expect(page).toHaveURL(/\/lunch\/orders\/.+\?edit=1$/);
  });

  test("renders separate same-date checkouts beneath one heading and one daily summary", async ({
    page,
  }) => {
    prepareDateGroupingFixture();
    try {
      await page.goto("/my-orders");
      const deliveryGroup = page
        .getByTestId("delivery-date-group")
        .filter({ hasText: DATE_GROUPING_FIXTURE.firstMarker })
        .filter({ hasText: DATE_GROUPING_FIXTURE.secondMarker });

      await expect(deliveryGroup).toHaveCount(1);
      await expect(deliveryGroup.getByRole("heading", { level: 3 })).toHaveCount(1);
      await expect(deliveryGroup.getByTestId("checkout-financial-summary")).toHaveCount(1);
      const firstCheckout = deliveryGroup.locator(
        `[data-testid="checkout-subgroup"][data-checkout-id="${DATE_GROUPING_FIXTURE.firstGroupId}"]`,
      );
      const secondCheckout = deliveryGroup.locator(
        `[data-testid="checkout-subgroup"][data-checkout-id="${DATE_GROUPING_FIXTURE.secondGroupId}"]`,
      );
      await expect(firstCheckout).toContainText(DATE_GROUPING_FIXTURE.firstMarker);
      await expect(firstCheckout.locator(":scope > p")).toHaveCount(0);
      await expect(firstCheckout.locator(":scope > footer")).toHaveCount(0);
      await expect(firstCheckout.getByTestId("provider-order-metadata")).toContainText("Ordered");
      await expect(firstCheckout.getByTestId("provider-order-metadata")).toContainText("Delivery to");
      await expect(secondCheckout).toContainText(DATE_GROUPING_FIXTURE.secondMarker);
      await expect(secondCheckout.locator(":scope > p")).toHaveCount(0);
      await expect(secondCheckout.locator(":scope > footer")).toHaveCount(0);
      await expect(secondCheckout.getByTestId("provider-order-metadata")).toContainText("Ordered");
      await expect(secondCheckout.getByTestId("provider-order-metadata")).toContainText("Delivery to");
      const checkoutNames = await Promise.all([
        firstCheckout.getAttribute("aria-label"),
        secondCheckout.getAttribute("aria-label"),
      ]);
      for (const checkoutName of checkoutNames) {
        expect(checkoutName).toMatch(
          /^Checkout \d+ of \d+, ordered .+, with 1 order$/,
        );
      }
      expect(checkoutNames[0]).not.toBe(checkoutNames[1]);
      await expectNoAxeViolations(page, "My Orders same-date checkouts", {
        mainContentOnly: true,
      });
    } finally {
      cleanupDateGroupingFixture();
    }
  });

  test("past orders keep full details and omit self-service mutation actions", async ({ page }) => {
    await selectTab(page, "Past Orders");

    const checkout = firstExpandedCheckout(page);
    await expect(checkout.getByTestId("provider-order-card").first()).toBeVisible();
    await expect(checkout.getByText("Order total", { exact: true }).first()).toBeVisible();
    await expect(checkout.getByRole("link", { name: "Edit order" })).toHaveCount(0);
    await expect(checkout.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
    await expect(checkout.getByTestId("provider-order-metadata").first()).toContainText("Ordered");
    await expect(checkout.getByTestId("provider-order-metadata").first()).toContainText("Delivery to");
    await expect(checkout.getByText("You Paid", { exact: true })).toHaveCount(0);
    await expect(checkout.getByText("Your cost", { exact: true }).first()).toBeVisible();
    await expectNoAxeViolations(page, "My Orders historical view", { mainContentOnly: true });
  });

  test("all existing order tabs remain navigable", async ({ page }) => {
    for (const tabName of [
      "Past Orders",
      "Cancelled",
      "Late order submissions",
      "Upcoming",
    ]) {
      await selectTab(page, tabName);
      if (tabName === "Cancelled") {
        await expectNoAxeViolations(page, "My Orders cancelled view", { mainContentOnly: true });
      }
    }
  });

  test("320px and 375px stack the summary beneath compact provider cards without page overflow", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      const checkout = firstExpandedCheckout(page);
      const providerCards = checkout.getByTestId("provider-order-card");
      const summary = checkout.getByTestId("checkout-financial-summary");

      await expect(providerCards).toHaveCount(2);
      await expect(summary).toBeVisible();
      await expectNoUnintendedHorizontalPageScroll(page);

      const lastCardBox = await providerCards.last().boundingBox();
      const summaryBox = await summary.boundingBox();
      expect(lastCardBox).not.toBeNull();
      expect(summaryBox).not.toBeNull();
      expect(summaryBox!.y).toBeGreaterThanOrEqual(
        lastCardBox!.y + lastCardBox!.height - 2,
      );

      await expect(providerCards.first().getByRole("link", { name: /^Edit order from / })).toBeVisible();
      await expect(providerCards.first().getByRole("button", { name: /^Cancel order from / })).toBeVisible();
      await expectNoAxeViolations(page, `My Orders ${viewport.width}px view`, {
        mainContentOnly: true,
      });
    }
  });

  test("long provider, item, note, and price content wraps without clipping", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const card = firstExpandedCheckout(page).getByTestId("provider-order-card").first();
    await card.getByRole("heading", { level: 4 }).evaluate((element) => {
      element.textContent = "A Very Long Hyphenated-Provider-Name for Responsive Lunch Service";
    });
    await card.getByTestId("order-price-leader").first().locator("xpath=preceding-sibling::span[1]").evaluate((element) => {
      element.textContent = "Extra-long escovitch meal description with vegetables and festival portions";
    });
    const note = card.getByText(/Note to kitchen:/).first();
    await note.evaluate((element) => {
      element.textContent = "Note to kitchen: Please package every component separately and include a deliberately long preparation note.";
    });
    await card.locator("footer strong").evaluate((element) => {
      element.textContent = "$1,234,567.89";
    });

    await expectNoUnintendedHorizontalPageScroll(page);
    expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(card.getByRole("heading", { level: 4 })).toBeVisible();
    await expect(note).toBeVisible();
    await expect(card.locator("footer strong")).toBeVisible();
  });

  test("shows a delivery timestamp only on the provider order that was delivered", async ({
    page,
  }) => {
    prepareCancellationFixture();
    try {
      runLocalDbExec(`
        do $fixture$
        begin
          update public.orders
          set status = 'fulfilled', delivery_state = 'delivered'
          where id = '${CANCELLATION_FIXTURE.firstOrderId}'::uuid;

          update public.orders
          set status = 'fulfilled', delivery_state = 'issue_open', financial_disposition = 'on_hold'
          where id = '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid;

          insert into public.order_delivery_events (order_id, event_type, payload, created_at)
          values
            (
              '${CANCELLATION_FIXTURE.firstOrderId}'::uuid,
              'marked_delivered',
              '{}'::jsonb,
              now() - interval '2 minutes'
            ),
            (
              '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid,
              'marked_delivered',
              '{}'::jsonb,
              now() - interval '1 minute'
            );
        end;
        $fixture$;
      `);

      await page.goto("/my-orders");
      const deliveryGroup = page
        .getByRole("tabpanel", { name: "Upcoming" })
        .getByTestId("delivery-date-group")
        .filter({ hasText: CANCELLATION_FIXTURE.firstMarker });
      const deliveredCard = deliveryGroup.getByTestId("provider-order-card").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      const issueCard = deliveryGroup.getByTestId("provider-order-card").filter({
        hasText: CANCELLATION_FIXTURE.siblingMarker,
      });

      await expect(deliveredCard.getByTestId("provider-order-metadata")).toContainText(
        "Delivered",
      );
      await expect(issueCard.getByTestId("provider-order-metadata")).not.toContainText(
        "Delivered",
      );
      const issueBadge = issueCard.locator("header").getByText("Issue Reported", {
        exact: true,
      });
      await expect(issueBadge).toBeVisible();
      await expect(issueBadge).toHaveClass(/bg-rose-50/);

      runLocalDbExec(`
        update public.orders
        set delivery_state = 'resolved', financial_disposition = 'waived'
        where id = '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
      `);
      await page.goto("/my-orders?tab=past");

      const resolvedCard = page
        .getByRole("tabpanel", { name: "Past Orders" })
        .getByTestId("provider-order-card")
        .filter({ hasText: CANCELLATION_FIXTURE.siblingMarker });
      const resolvedBadge = resolvedCard.locator("header").getByText("Issue Resolved", {
        exact: true,
      });
      await expect(resolvedBadge).toBeVisible();
      await expect(resolvedBadge).toHaveClass(/bg-teal-50/);
      await expect(resolvedCard.getByTestId("provider-order-metadata")).not.toContainText(
        "Delivered",
      );
    } finally {
      cleanupCancellationFixture();
    }
  });

  test("successful cancellation persists after reload and preserves its sibling provider order", async ({
    page,
  }) => {
    prepareCancellationFixture();
    try {
      await page.goto("/my-orders");
      const checkout = page.getByTestId("delivery-date-group").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      const targetCard = checkout.getByTestId("provider-order-card").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      const activeCardCountBeforeCancellation = await checkout
        .getByTestId("provider-order-card")
        .count();
      const providerName = (await targetCard.getByRole("heading", { level: 4 }).textContent())!.trim();

      page.once("dialog", (dialog) => dialog.accept());
      await targetCard.getByRole("button", {
        name: `Cancel order from ${providerName}`,
        exact: true,
      }).click();
      await expect(page).toHaveURL(/\/my-orders(?:\?|$)/);
      await expect(
        page.getByRole("status").getByText(
          "Order cancelled successfully. Your other orders were not affected.",
          { exact: true },
        ),
      ).toBeVisible();

      const refreshedUpcoming = page.getByTestId("delivery-date-group").filter({
        hasText: CANCELLATION_FIXTURE.siblingMarker,
      });
      await expect(refreshedUpcoming).not.toContainText(CANCELLATION_FIXTURE.firstMarker);
      await expect(refreshedUpcoming).toContainText(CANCELLATION_FIXTURE.siblingMarker);
      const activeCardCountAfterCancellation = activeCardCountBeforeCancellation - 1;
      await expect(refreshedUpcoming.getByTestId("provider-order-card")).toHaveCount(
        activeCardCountAfterCancellation,
      );
      await expect(
        refreshedUpcoming.getByTestId("checkout-financial-summary"),
      ).toContainText(
        `${activeCardCountAfterCancellation} ${activeCardCountAfterCancellation === 1 ? "order" : "orders"}`,
      );

      await selectTab(page, "Cancelled");
      const cancelledGroup = page.getByTestId("delivery-date-group").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      await expect(cancelledGroup).toContainText(CANCELLATION_FIXTURE.firstMarker);
      await expect(cancelledGroup).not.toContainText(CANCELLATION_FIXTURE.siblingMarker);
      await expect(cancelledGroup.getByText("Cancelled", { exact: true }).first()).toBeVisible();
      await expect(
        cancelledGroup.getByTestId("provider-order-metadata").first(),
      ).toContainText("Cancelled");
      await expect(cancelledGroup.locator('[data-testid="checkout-subgroup"] > footer')).toHaveCount(0);
      await expect(
        cancelledGroup.getByText("Original order value", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        cancelledGroup.getByTestId("checkout-financial-summary"),
      ).toContainText("No amount due");

      await page.reload();
      await expect(page.getByRole("tab", { name: "Cancelled" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(
        page
          .getByRole("tabpanel", { name: "Cancelled" })
          .getByTestId("delivery-date-group")
          .filter({ hasText: CANCELLATION_FIXTURE.firstMarker }),
      ).toBeVisible();

      const state = runLocalDbQuery(`
        select id::text, status
        from public.orders
        where id in (
          '${CANCELLATION_FIXTURE.firstOrderId}'::uuid,
          '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
        )
        order by id
      `);
      expect(state).toEqual([
        { id: CANCELLATION_FIXTURE.firstOrderId, status: "cancelled" },
        { id: CANCELLATION_FIXTURE.siblingOrderId, status: "submitted" },
      ]);

    } finally {
      cleanupCancellationFixture();
    }
  });

  test("a stale cancellation is rejected without a false success response", async ({ page }) => {
    prepareCancellationFixture();
    try {
      await page.goto("/my-orders");
      const checkout = page.getByTestId("delivery-date-group").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      const targetCard = checkout.getByTestId("provider-order-card").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      const providerName = (await targetCard.getByRole("heading", { level: 4 }).textContent())!.trim();

      runLocalDbQuery(`
        update public.orders
        set status = 'cancelled'
        where id = '${CANCELLATION_FIXTURE.firstOrderId}'::uuid
        returning id
      `);

      page.once("dialog", (dialog) => dialog.accept());
      await targetCard.getByRole("button", {
        name: `Cancel order from ${providerName}`,
        exact: true,
      }).click();
      await expect(page).toHaveURL(/\/my-orders(?:\?|$)/);
      await expect(
        page.getByRole("alert").getByText(
          "This order can no longer be cancelled.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Order cancelled successfully. Your other orders were not affected.",
          { exact: true },
        ),
      ).toHaveCount(0);
      await expect(
        page.getByTestId("delivery-date-group").filter({
          hasText: CANCELLATION_FIXTURE.siblingMarker,
        }),
      ).not.toContainText(CANCELLATION_FIXTURE.firstMarker);
      await selectTab(page, "Cancelled");
      await expect(
        page.getByTestId("delivery-date-group").filter({
          hasText: CANCELLATION_FIXTURE.firstMarker,
        }),
      ).toBeVisible();
      await expect(page).not.toHaveURL(/cancelled=1/);

      const state = runLocalDbQuery(`
        select id::text, status
        from public.orders
        where id in (
          '${CANCELLATION_FIXTURE.firstOrderId}'::uuid,
          '${CANCELLATION_FIXTURE.siblingOrderId}'::uuid
        )
        order by id
      `);
      expect(state).toEqual([
        { id: CANCELLATION_FIXTURE.firstOrderId, status: "cancelled" },
        { id: CANCELLATION_FIXTURE.siblingOrderId, status: "submitted" },
      ]);
    } finally {
      cleanupCancellationFixture();
    }
  });
});

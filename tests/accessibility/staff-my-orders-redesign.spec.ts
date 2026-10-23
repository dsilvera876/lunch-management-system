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
  return page.getByTestId("checkout-group").filter({
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
  test("groups provider cards inside one checkout and preserves authoritative summaries and actions", async ({
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

    for (const [index, card] of (await providerCards.all()).entries()) {
      const providerName = (await card.getByRole("heading", { level: 4 }).textContent())?.trim();
      expect(providerName).toBeTruthy();
      await expect(card).toHaveAccessibleName(providerName!);
      await expect(card.getByText(/Order \d+ of 2/)).toBeVisible();
      await expect(card.getByText("Submitted", { exact: true })).toBeVisible();
      await expect(card.getByText("Order total", { exact: true })).toBeVisible();
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
    let confirmationMessage = "";
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      confirmationMessage = dialog.message();
      await dialog.dismiss();
    });
    await cancel.click();
    expect(confirmationMessage).toContain(firstProviderName);
    expect(confirmationMessage).toContain("order 1 of 2");
    await expect(page).toHaveURL(/\/my-orders(?:\?|$)/);

    await providerCards.first().getByRole("link", {
      name: `Edit order from ${firstProviderName}`,
      exact: true,
    }).click();
    await expect(page).toHaveURL(/\/lunch\/orders\/.+\?edit=1$/);
  });

  test("past orders keep full details and omit self-service mutation actions", async ({ page }) => {
    await selectTab(page, "Past Orders");

    const checkout = firstExpandedCheckout(page);
    await expect(checkout.getByTestId("provider-order-card").first()).toBeVisible();
    await expect(checkout.getByText("Order total", { exact: true }).first()).toBeVisible();
    await expect(checkout.getByRole("link", { name: "Edit order" })).toHaveCount(0);
    await expect(checkout.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
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

  test("successful cancellation persists after reload and preserves its sibling provider order", async ({
    page,
  }) => {
    prepareCancellationFixture();
    try {
      await page.goto("/my-orders");
      const checkout = page.getByTestId("checkout-group").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      const targetCard = checkout.getByTestId("provider-order-card").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      const providerName = (await targetCard.getByRole("heading", { level: 4 }).textContent())!.trim();

      page.once("dialog", (dialog) => dialog.accept());
      await targetCard.getByRole("button", {
        name: `Cancel order from ${providerName}`,
        exact: true,
      }).click();
      await expect(page).toHaveURL(
        new RegExp(`/lunch/orders/${CANCELLATION_FIXTURE.firstOrderId}\\?cancelled=1$`),
      );

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

      await page.reload();
      await page.goto("/my-orders");
      const refreshedCheckout = page.getByTestId("checkout-group").filter({
        hasText: CANCELLATION_FIXTURE.firstMarker,
      });
      await expect(
        refreshedCheckout.getByTestId("provider-order-card").filter({
          hasText: CANCELLATION_FIXTURE.firstMarker,
        }).getByText("Cancelled", { exact: true }),
      ).toBeVisible();
      await expect(
        refreshedCheckout.getByTestId("provider-order-card").filter({
          hasText: CANCELLATION_FIXTURE.siblingMarker,
        }).getByText("Submitted", { exact: true }),
      ).toBeVisible();
    } finally {
      cleanupCancellationFixture();
    }
  });

  test("a stale cancellation is rejected without a false success response", async ({ page }) => {
    prepareCancellationFixture();
    try {
      await page.goto("/my-orders");
      const checkout = page.getByTestId("checkout-group").filter({
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
      await expect(page).toHaveURL(
        new RegExp(`/lunch/orders/${CANCELLATION_FIXTURE.firstOrderId}\\?error=`),
      );
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

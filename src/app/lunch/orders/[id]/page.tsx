import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelLunchOrder, updateLunchOrder } from "../../actions";
import { getRelated, formatDeadline, formatCurrency } from "@/lib/format";
import { formatDisplayDate } from "@/lib/ordering-ui";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeader } from "@/components/ui/section-header";
import { ProviderOrderForm } from "@/components/provider-order-form";
import { formatMenuItemLabel, formatOrderLineLabel, groupMenuItemsByType, type MenuItemType } from "@/lib/menu-items";
import { formatMealBundleLabel } from "@/lib/order-payload";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
    ordered?: string;
    updated?: string;
    cancelled?: string;
    edit?: string;
  }>;
};

function getErrorMessage(code: string) {
  switch (code) {
    case "empty":
      return "Select at least one menu item before submitting.";
    case "deadline":
      return "The ordering deadline has passed.";
    case "closed":
      return "Ordering is no longer open for this lunch.";
    case "unavailable-item":
      return "One of the selected menu items is no longer available.";
    case "locked":
      return "This order can no longer be changed.";
    case "composition":
      return "This order combination is not valid. Choose one main with at least one side, or standalone items only.";
    case "instructions":
      return "Special instructions must be 500 characters or fewer.";
    case "unauthorized":
      return "You are not authorized to perform this action.";
    default:
      return "Unable to complete the request. Please try again.";
  }
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: Props) {
  const profile = await requireProfile();
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      created_at,
      special_instructions,
      meal_quantity,
      lunch_days (
        id,
        lunch_date,
        order_date,
        order_deadline,
        status,
        notes,
        provider_id,
        lunch_providers (
          name
        ),
        menu_items (
          id,
          name,
          description,
          price,
          item_type,
          unit_label,
          is_active
        )
      ),
      order_items (
        id,
        menu_item_id,
        quantity,
        unit_price,
        menu_items (
          name,
          item_type,
          unit_label
        )
      )
    `)
    .eq("id", id)
    .eq("profile_id", profile.id)
    .single();

  if (error || !order) {
    notFound();
  }

  const lunchDay = getRelated(order.lunch_days);

  if (!lunchDay) {
    notFound();
  }

  const { data: effectiveDeadline } = lunchDay.provider_id && lunchDay.order_date
    ? await supabase.rpc("effective_order_deadline", {
        p_lunch_day_id: lunchDay.id,
      })
    : { data: lunchDay.order_deadline };

  const orderingOpen =
    lunchDay.status === "open" &&
    effectiveDeadline !== null &&
    new Date() <= new Date(effectiveDeadline);

  const provider = getRelated(lunchDay.lunch_providers);
  const activeItems = lunchDay.menu_items.filter((item) => item.is_active);

  const isEditing =
    query.edit === "1" &&
    order.status === "submitted";

  const selectedMainId =
    order.order_items.find((item) => {
      const menuItem = getRelated(item.menu_items);
      return menuItem?.item_type === "main";
    })?.menu_item_id ?? null;

  const defaultSelectedSideIds = order.order_items
    .filter((item) => {
      const menuItem = getRelated(item.menu_items);
      return menuItem?.item_type === "side";
    })
    .map((item) => item.menu_item_id);

  const defaultStandaloneQuantities = Object.fromEntries(
    order.order_items
      .filter((item) => {
        const menuItem = getRelated(item.menu_items);
        return menuItem?.item_type === "standalone";
      })
      .map((item) => [item.menu_item_id, item.quantity]),
  );

  const defaultMealQuantity = order.meal_quantity ?? 1;

  const groupedOrderItems = groupMenuItemsByType(
    order.order_items.map((item) => {
      const menuItem = getRelated(item.menu_items);
      return {
        name: menuItem?.name ?? "Menu item",
        quantity: item.quantity,
        itemType: (menuItem?.item_type ?? "standalone") as MenuItemType,
        unitLabel: menuItem?.unit_label ?? "Each",
        unitPrice: item.unit_price,
      };
    }),
  );

  return (
    <>
      <PageHeader
        title={`${provider?.name ? `${provider.name} · ` : ""}Delivery ${formatDisplayDate(lunchDay.lunch_date)}`}
        description={
          lunchDay.order_date
            ? `Ordered ${formatDisplayDate(lunchDay.order_date)} for delivery ${formatDisplayDate(lunchDay.lunch_date)}.`
            : undefined
        }
        actions={
          <Link href="/my-orders" className={linkButtonClass("ghost")}>
            My orders
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <span className="text-sm text-muted">
          Deadline:{" "}
          {effectiveDeadline
            ? formatDeadline(effectiveDeadline)
            : formatDeadline(lunchDay.order_deadline)}
        </span>
      </div>

      {query.ordered && (
        <Alert variant="success" className="mb-6">
          Your order was placed successfully. You can place another order while
          ordering remains open.
        </Alert>
      )}

      {query.updated && (
        <Alert variant="success" className="mb-6">
          Your order was updated successfully.
        </Alert>
      )}

      {query.cancelled && (
        <Alert variant="info" className="mb-6">
          This order was cancelled. You may place another order while ordering
          remains open.
        </Alert>
      )}

      {query.error && (
        <Alert variant="error" className="mb-6">
          {getErrorMessage(query.error)}
        </Alert>
      )}

      {order.status !== "cancelled" && !isEditing ? (
        <section>
          <SectionHeader title="Order items" />

          {order.meal_quantity && groupedOrderItems.main.length > 0 && (
            <div className="mb-4">
              <Card padding="sm">
                <p className="font-semibold">
                  {formatMealBundleLabel(order.meal_quantity)}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {[...groupedOrderItems.main, ...groupedOrderItems.side].map(
                    (item) => (
                      <li key={item.name}>{formatMenuItemLabel(item.name, item.unitLabel)}</li>
                    ),
                  )}
                </ul>
                <p className="mt-2 text-sm text-muted">
                  Subtotal{" "}
                  {formatCurrency(
                    [...groupedOrderItems.main, ...groupedOrderItems.side].reduce(
                      (sum, item) => sum + Number(item.unitPrice) * item.quantity,
                      0,
                    ),
                  )}
                </p>
              </Card>
            </div>
          )}

          {groupedOrderItems.standalone.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {order.meal_quantity ? "Optional items" : "Items"}
              </h3>
              <div className="space-y-3">
                {order.order_items
                  .filter((item) => {
                    const menuItem = getRelated(item.menu_items);
                    return menuItem?.item_type === "standalone";
                  })
                  .map((item) => {
                    const menuItem = getRelated(item.menu_items);

                    return (
                      <Card key={item.id} padding="sm">
                        <p className="font-semibold">
                          {formatOrderLineLabel(
                            menuItem?.name ?? "Menu item",
                            menuItem?.unit_label ?? "Each",
                            item.quantity,
                          )}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {formatCurrency(item.unit_price)} per{" "}
                          {(menuItem?.unit_label ?? "Each").toLowerCase()} · Subtotal{" "}
                          {formatCurrency(Number(item.unit_price) * item.quantity)}
                        </p>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}

          {order.special_instructions && (
            <Card className="mt-4" padding="sm">
              <h3 className="text-sm font-semibold">Special instructions</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {order.special_instructions}
              </p>
            </Card>
          )}

          {order.status === "submitted" && orderingOpen && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/lunch/orders/${order.id}?edit=1`}
                className={linkButtonClass("secondary")}
              >
                Edit order
              </Link>

              <form action={cancelLunchOrder}>
                <input type="hidden" name="orderId" value={order.id} />
                <FormSubmitButton
                  pendingText="Cancelling..."
                  confirmMessage="Cancel this order? Your other orders for this delivery date will not be affected."
                  variant="danger"
                >
                  Cancel order
                </FormSubmitButton>
              </form>
            </div>
          )}
        </section>
      ) : order.status === "cancelled" ? (
        <Alert variant="info">This order has been cancelled.</Alert>
      ) : order.status === "fulfilled" ? (
        <Alert variant="info">This order has been fulfilled.</Alert>
      ) : isEditing ? (
        <ProviderOrderForm
          providerId=""
          providerName={provider?.name ?? "Provider"}
          orderDate={lunchDay.order_date ?? lunchDay.lunch_date}
          deliveryDate={lunchDay.lunch_date}
          menuItems={activeItems.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            itemType: item.item_type as MenuItemType,
            unitLabel: item.unit_label,
          }))}
          quantityFieldPrefix="quantity"
          mainFieldName="mainMenuItemId"
          hiddenFields={<input type="hidden" name="orderId" value={order.id} />}
          defaultSelectedMainId={selectedMainId}
          defaultSelectedSideIds={defaultSelectedSideIds}
          defaultMealQuantity={defaultMealQuantity}
          defaultStandaloneQuantities={defaultStandaloneQuantities}
          defaultSpecialInstructions={order.special_instructions ?? ""}
          formAction={updateLunchOrder}
          submitLabel="Save changes"
          pendingLabel="Saving..."
        />
      ) : null}

      {lunchDay.provider_id && lunchDay.status === "open" && orderingOpen && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/lunch/providers/${lunchDay.provider_id}`}
            className={linkButtonClass("primary")}
          >
            Place another order from {provider?.name ?? "this provider"}
          </Link>
          <Link href="/lunch" className={linkButtonClass("secondary")}>
            Choose a different provider
          </Link>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cancelLunchOrder, updateLunchOrder } from "../../actions";
import { getRelated, formatDeadline, formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionHeader } from "@/components/ui/section-header";
import { inputClassName } from "@/components/ui/form-field";
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
      lunch_day_id,
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
          is_active
        )
      ),
      order_items (
        id,
        menu_item_id,
        quantity,
        unit_price,
        menu_items (
          name
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

  const quantities = new Map(
    order.order_items.map((item) => [item.menu_item_id, item.quantity]),
  );

  return (
    <>
      <PageHeader
        title={`${provider?.name ? `${provider.name} · ` : ""}Delivery ${lunchDay.lunch_date}`}
        description={
          lunchDay.order_date
            ? `Ordered on ${lunchDay.order_date} for delivery on ${lunchDay.lunch_date}.`
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
          Your order was submitted successfully.
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

          <div className="space-y-3">
            {order.order_items.map((item) => {
              const menuItem = getRelated(item.menu_items);

              return (
                <Card key={item.id} padding="sm">
                  <p className="font-semibold">{menuItem?.name ?? "Menu item"}</p>
                  <p className="mt-1 text-sm text-muted">
                    Quantity {item.quantity} · ${formatCurrency(item.unit_price)} each
                  </p>
                </Card>
              );
            })}
          </div>

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
        <form action={updateLunchOrder}>
          <input type="hidden" name="orderId" value={order.id} />
          <SectionHeader title="Edit your order" />

          <div className="space-y-3">
            {activeItems.map((item) => (
              <Card key={item.id} padding="sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted">{item.description}</p>
                    )}
                    <p className="mt-1 text-sm">${formatCurrency(item.price)}</p>
                  </div>
                  <div>
                    <label htmlFor={`quantity:${item.id}`} className="block text-sm font-medium">
                      Qty
                    </label>
                    <input
                      id={`quantity:${item.id}`}
                      name={`quantity:${item.id}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={quantities.get(item.id) ?? 0}
                      className={`${inputClassName} mt-1 w-24`}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <FormSubmitButton pendingText="Saving..." variant="primary">
              Save changes
            </FormSubmitButton>
            <Link
              href={`/lunch/orders/${order.id}`}
              className={linkButtonClass("ghost")}
            >
              Cancel editing
            </Link>
          </div>
        </form>
      ) : null}

      {lunchDay.provider_id && lunchDay.status === "open" && orderingOpen && (
        <div className="mt-8">
          <Link
            href={`/lunch/providers/${lunchDay.provider_id}`}
            className={linkButtonClass("primary")}
          >
            Place another order from {provider?.name ?? "this provider"}
          </Link>
        </div>
      )}
    </>
  );
}

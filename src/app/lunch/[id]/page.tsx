import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { submitLunchOrder } from "../actions";
import { getRelated, formatDeadline, formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClassName } from "@/components/ui/form-field";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
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
    default:
      return "Unable to complete the request. Please try again.";
  }
}

export default async function LegacyLunchOrderPage({
  params,
  searchParams,
}: Props) {
  const profile = await requireProfile();
  const { id } = await params;
  const query = await searchParams;

  const supabase = await createClient();

  const { data: lunchDay, error } = await supabase
    .from("lunch_days")
    .select(`
      id,
      lunch_date,
      order_deadline,
      status,
      notes,
      provider_id,
      menu_items (
        id,
        name,
        description,
        price,
        is_active
      )
    `)
    .eq("id", id)
    .is("provider_id", null)
    .single();

  if (error || !lunchDay) {
    notFound();
  }

  const { data: existingOrders } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      order_items (
        quantity,
        menu_items (
          name
        )
      )
    `)
    .eq("profile_id", profile.id)
    .eq("lunch_day_id", id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  const activeItems = lunchDay.menu_items.filter((item) => item.is_active);

  return (
    <>
      <PageHeader
        title={`Legacy lunch · ${lunchDay.lunch_date}`}
        description="Manual lunch day ordering (legacy workflow)."
        actions={
          <Link href="/lunch" className={linkButtonClass("ghost")}>
            Order lunch
          </Link>
        }
      />

      <p className="mb-6 text-sm text-muted">
        Ordering deadline: {formatDeadline(lunchDay.order_deadline)}
      </p>

      {lunchDay.notes && (
        <Alert variant="info" className="mb-6">
          {lunchDay.notes}
        </Alert>
      )}

      {query.error && (
        <Alert variant="error" className="mb-6">
          {getErrorMessage(query.error)}
        </Alert>
      )}

      {existingOrders && existingOrders.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Your orders" />

          <div className="space-y-3">
            {existingOrders.map((order) => (
              <Card key={order.id} padding="sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusBadge status={order.status} />
                  <Link
                    href={`/lunch/orders/${order.id}`}
                    className={linkButtonClass("ghost")}
                  >
                    View order
                  </Link>
                </div>

                <ul className="mt-3 space-y-1 text-sm">
                  {order.order_items.map((item) => {
                    const menuItem = getRelated(item.menu_items);

                    return (
                      <li key={`${order.id}-${menuItem?.name ?? "item"}`}>
                        {menuItem?.name ?? "Menu item"} × {item.quantity}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      )}

      {lunchDay.status !== "open" ? (
        <EmptyState
          title="Ordering closed"
          description="Ordering is closed for this lunch."
        />
      ) : activeItems.length === 0 ? (
        <EmptyState
          title="No menu items"
          description="No menu items are currently available."
        />
      ) : (
        <form action={submitLunchOrder}>
          <input type="hidden" name="lunchDayId" value={lunchDay.id} />
          <SectionHeader title="Place an order" />

          <div className="space-y-3">
            {activeItems.map((item) => (
              <Card key={item.id} padding="sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted">{item.description}</p>
                    )}
                    <p className="mt-1 text-sm">{formatCurrency(item.price)}</p>
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
                      defaultValue={0}
                      className={`${inputClassName} mt-1 w-24`}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-6">
            <FormSubmitButton pendingText="Submitting..." variant="primary">
              Submit order
            </FormSubmitButton>
          </div>
        </form>
      )}
    </>
  );
}

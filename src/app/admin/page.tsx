import Link from "next/link";
import { requireAdminOrOwner } from "@/lib/auth";
import { getJamaicaTodayDate, getJamaicaIsoWeekday, getDeliveryDateForOrderDate } from "@/lib/datetime";
import {
  cutoffTimeToFormValue,
  DEFAULT_ORDER_CUTOFF_TIME,
  formatJamaicaWallClockTime,
} from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { updateOrderCutoff } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button, linkButtonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDeadline } from "@/lib/format";

type Props = {
  searchParams: Promise<{
    error?: string;
    "cutoff-updated"?: string;
  }>;
};

export default async function AdminPage({ searchParams }: Props) {
  const profile = await requireAdminOrOwner();
  const params = await searchParams;
  const supabase = await createClient();
  const orderDate = getJamaicaTodayDate();
  const orderWeekday = getJamaicaIsoWeekday(orderDate);
  const deliveryDate = orderWeekday
    ? getDeliveryDateForOrderDate(orderDate)
    : null;

  const [
    { count: submittedOrders },
    { count: fulfilledOrders },
    { count: activeProviders },
    { data: settings },
    { data: orderDeadline },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "fulfilled"),
    supabase
      .from("lunch_providers")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase.from("app_settings").select("order_cutoff_time").eq("id", 1).single(),
    orderWeekday
      ? supabase.rpc("order_deadline_for_order_date", { p_order_date: orderDate })
      : Promise.resolve({ data: null }),
  ]);

  const cutoffTime = settings?.order_cutoff_time ?? DEFAULT_ORDER_CUTOFF_TIME;
  const cutoffInputValue = cutoffTimeToFormValue(cutoffTime);
  const orderingOpen =
    orderWeekday !== null &&
    orderDeadline !== null &&
    new Date() <= new Date(orderDeadline);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${profile.full_name ?? "Administrator"}.`}
      />

      {params["cutoff-updated"] && (
        <Alert variant="success" className="mb-6">
          Order cutoff updated successfully.
        </Alert>
      )}

      {params.error && (
        <Alert variant="error" className="mb-6">
          Unable to update order cutoff.
        </Alert>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card padding="sm">
          <p className="text-sm text-muted">Today&apos;s ordering</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-semibold">
              {orderWeekday ? (orderingOpen ? "Open" : "Closed") : "Weekend"}
            </p>
            {orderWeekday && (
              <StatusBadge status={orderingOpen ? "open" : "closed"} />
            )}
          </div>
        </Card>
        <Card padding="sm">
          <p className="text-sm text-muted">Delivery date</p>
          <p className="mt-2 text-2xl font-semibold">
            {deliveryDate ?? "—"}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-sm text-muted">Submitted orders</p>
          <p className="mt-2 text-2xl font-semibold">{submittedOrders ?? 0}</p>
        </Card>
        <Card padding="sm">
          <p className="text-sm text-muted">Active providers</p>
          <p className="mt-2 text-2xl font-semibold">{activeProviders ?? 0}</p>
        </Card>
      </div>

      <div className="grid gap-8 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <SectionHeader
            title="Order cutoff"
            description="Global daily cutoff for Jamaica-time ordering."
          />
          <p className="mb-4 text-sm text-muted">
            Current: {formatJamaicaWallClockTime(cutoffTime)} Jamaica time
            {orderDeadline ? ` (${formatDeadline(orderDeadline)} today)` : ""}
          </p>
          <form action={updateOrderCutoff} className="space-y-4">
            <FormField
              label="Daily cutoff"
              htmlFor="orderCutoffTime"
              description="Applies to all provider ordering for the active order day."
            >
              <input
                id="orderCutoffTime"
                name="orderCutoffTime"
                type="time"
                required
                defaultValue={cutoffInputValue}
                className={inputClassName}
              />
            </FormField>
            <Button type="submit" variant="primary">
              Save cutoff
            </Button>
          </form>
        </Card>

        <Card className="xl:col-span-2">
          <SectionHeader title="Quick actions" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/admin/providers" className={linkButtonClass("secondary")}>
              Manage lunch providers
            </Link>
            <Link href="/admin/orders" className={linkButtonClass("secondary")}>
              View orders ({submittedOrders ?? 0} submitted)
            </Link>
            <Link href="/lunch" className={linkButtonClass("secondary")}>
              Staff ordering view
            </Link>
            <Link href="/admin/users" className={linkButtonClass("secondary")}>
              User / role management
            </Link>
            <Link href="/admin/lunch-days" className={linkButtonClass("ghost")}>
              Legacy lunch days
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            Fulfilled orders: {fulfilledOrders ?? 0}. Provider menus drive the
            normal workflow; legacy lunch days remain for compatibility only.
          </p>
        </Card>
      </div>
    </>
  );
}

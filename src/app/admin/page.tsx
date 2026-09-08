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
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatHumanDate } from "@/lib/format";

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
    { data: ordersData },
    { count: activeProviders },
    { data: settings },
    { data: orderDeadline },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("office_location_name")
      .eq("status", "submitted"),
    supabase
      .from("lunch_providers")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase.from("app_settings").select("order_cutoff_time").eq("id", 1).single(),
    orderWeekday
      ? supabase.rpc("order_deadline_for_order_date", { p_order_date: orderDate })
      : Promise.resolve({ data: null }),
  ]);

  const submittedOrders = ordersData?.length ?? 0;
  const ordersByLocation = ordersData?.reduce((acc, order) => {
    const loc = order.office_location_name ?? "Unspecified";
    acc[loc] = (acc[loc] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card padding="md" className="flex flex-col">
          <h2 className="text-lg font-semibold mb-4">Today&apos;s Operations</h2>
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Ordering status</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {orderWeekday ? (orderingOpen ? "Open" : "Closed") : "Weekend"}
                </span>
                {orderWeekday && (
                  <StatusBadge status={orderingOpen ? "open" : "closed"} />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Delivery date</span>
              <span className="text-sm font-medium">{deliveryDate ? formatHumanDate(deliveryDate) : "N/A"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Active providers</span>
              <span className="text-sm font-medium">{activeProviders ?? 0}</span>
            </div>
          </div>
        </Card>

        <Card padding="md" className="flex flex-col">
          <h2 className="text-lg font-semibold mb-4">Submitted Orders</h2>
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Total submitted</span>
              <span className="text-sm font-medium">{submittedOrders}</span>
            </div>
            {Object.entries(ordersByLocation).map(([loc, count]) => (
              <div key={loc} className="flex items-center justify-between pl-4 border-l-2 border-border">
                <span className="text-sm text-muted">{loc}</span>
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="md" className="flex flex-col">
          <h2 className="text-lg font-semibold mb-4">Order Cutoff</h2>
          <div className="flex-1">
            <p className="mb-4 text-sm text-muted">
              Current cutoff: {formatJamaicaWallClockTime(cutoffTime)}
            </p>
            <form action={updateOrderCutoff} className="space-y-4">
              <FormField
                label="Daily cutoff"
                htmlFor="orderCutoffTime"
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
              <Button type="submit" variant="primary" className="w-full justify-center">
                Save cutoff
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}

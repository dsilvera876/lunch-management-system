import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireProfile } from "@/lib/auth";
import {
  getDeliveryDateForOrderDate,
  getJamaicaIsoWeekday,
  getJamaicaTodayDate,
} from "@/lib/datetime";
import {
  DEFAULT_ORDER_CUTOFF_TIME,
  formatJamaicaWallClockTime,
} from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { submitProviderOrder } from "../../actions";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SectionHeader } from "@/components/ui/section-header";
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

type SnapshotMenuItem = {
  id: string;
  provider_menu_item_id: string | null;
  name: string;
  description: string | null;
  price: number | string;
  is_active: boolean;
};

function getErrorMessage(code: string) {
  switch (code) {
    case "empty":
      return "Select at least one menu item before submitting.";
    case "deadline":
      return "The ordering deadline has passed.";
    case "closed":
      return "Ordering is not available right now.";
    case "finalized":
      return "Ordering is unavailable because this lunch period has been finalized.";
    case "unavailable-item":
      return "One of the selected menu items is no longer available.";
    case "unauthorized":
      return "You are not authorized to perform this action.";
    default:
      return "Unable to complete the request. Please try again.";
  }
}

export default async function ProviderOrderPage({
  params,
  searchParams,
}: Props) {
  await requireProfile();

  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const orderDate = getJamaicaTodayDate();
  const orderWeekday = getJamaicaIsoWeekday(orderDate);
  const deliveryDate = orderWeekday
    ? getDeliveryDateForOrderDate(orderDate)
    : null;

  if (!orderWeekday || !deliveryDate) {
    notFound();
  }

  const [
    { data: provider, error: providerError },
    { data: settings },
    { data: orderDeadline },
    { data: periodFinalized },
    { data: existingCycle },
  ] = await Promise.all([
    supabase
      .from("lunch_providers")
      .select(`
        id,
        name,
        description,
        active,
        provider_menu_items (
          id,
          name,
          description,
          price,
          active,
          provider_menu_item_weekdays (
            weekday
          )
        )
      `)
      .eq("id", id)
      .eq("active", true)
      .single(),

    supabase
      .from("app_settings")
      .select("order_cutoff_time")
      .eq("id", 1)
      .single(),

    supabase.rpc("order_deadline_for_order_date", {
      p_order_date: orderDate,
    }),

    supabase.rpc("is_order_date_in_finalized_period", {
      p_order_date: orderDate,
    }),

    supabase
      .from("lunch_days")
      .select(`
        id,
        menu_items (
          id,
          provider_menu_item_id,
          name,
          description,
          price,
          is_active
        )
      `)
      .eq("provider_id", id)
      .eq("order_date", orderDate)
      .maybeSingle(),
  ]);

  if (providerError || !provider) {
    notFound();
  }

  const cutoffTime = settings?.order_cutoff_time ?? DEFAULT_ORDER_CUTOFF_TIME;
  const orderingOpen =
    !periodFinalized &&
    orderDeadline !== null &&
    new Date() <= new Date(orderDeadline);

  const snapshotItems =
    existingCycle?.menu_items.filter(
      (item: SnapshotMenuItem) => item.is_active,
    ) ?? [];

  const recurringItems = provider.provider_menu_items.filter(
    (item) =>
      item.active &&
      item.provider_menu_item_weekdays.some(
        (day) => day.weekday === orderWeekday,
      ),
  );

  const usingSnapshot = snapshotItems.length > 0;

  const menuItems = usingSnapshot
    ? snapshotItems.map((item: SnapshotMenuItem) => ({
        id: item.provider_menu_item_id ?? item.id,
        name: item.name,
        description: item.description,
        price: item.price,
      }))
    : recurringItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
      }));

  return (
    <>
      <PageHeader
        title={provider.name}
        description={provider.description ?? undefined}
        actions={
          <Link href="/lunch" className={linkButtonClass("ghost")}>
            All providers
          </Link>
        }
      />

      <Card className="mb-6">
        <p className="text-sm">
          Order today ({orderDate}) for delivery on{" "}
          <strong>{deliveryDate}</strong>.
        </p>
        <p className="mt-1 text-sm text-muted">
          Order by {formatJamaicaWallClockTime(cutoffTime)}.
        </p>
        {usingSnapshot && (
          <p className="mt-2 text-sm text-muted">
            Showing today&apos;s established menu snapshot for this provider.
          </p>
        )}
      </Card>

      {query.error && (
        <Alert variant="error" className="mb-6">
          {getErrorMessage(query.error)}
        </Alert>
      )}

      {periodFinalized ? (
        <EmptyState
          title="Ordering unavailable"
          description="Ordering is unavailable because this lunch period has been finalized."
        />
      ) : !orderingOpen ? (
        <EmptyState
          title="Ordering closed"
          description="Today's ordering window has closed."
        />
      ) : menuItems.length === 0 ? (
        <EmptyState
          title="No menu items"
          description="No menu items are available from this provider today."
        />
      ) : (
        <form action={submitProviderOrder}>
          <input type="hidden" name="providerId" value={provider.id} />
          <input type="hidden" name="orderDate" value={orderDate} />

          <SectionHeader title="Place your order" />

          <div className="space-y-3">
            {menuItems.map((item) => (
              <Card key={item.id} padding="sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted">{item.description}</p>
                    )}
                    <p className="mt-1 text-sm font-medium">
                      ${formatCurrency(item.price)}
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor={`provider-quantity:${item.id}`}
                      className="block text-sm font-medium"
                    >
                      Qty
                    </label>
                    <input
                      id={`provider-quantity:${item.id}`}
                      name={`provider-quantity:${item.id}`}
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

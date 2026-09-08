import Link from "next/link";
import { notFound } from "next/navigation";
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
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";
import { ProviderOrderForm } from "@/components/provider-order-form";
import type { MenuItemType } from "@/lib/menu-items";
import {
  formatDisplayDate,
  formatOrderDeliveryHeadline,
} from "@/lib/ordering-ui";

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
  item_type: string;
  unit_label: string;
  is_active: boolean;
};

function getErrorMessage(code: string) {
  switch (code) {
    case "empty":
      return "Select at least one menu item with quantity 1 or more.";
    case "deadline":
      return "The ordering deadline has passed.";
    case "closed":
      return "Ordering is not available right now.";
    case "finalized":
      return "Ordering is unavailable because this lunch period has been finalized.";
    case "unavailable-item":
      return "One of the selected menu items is no longer available.";
    case "composition":
      return "This order combination is not valid. Choose one main with at least one side, or standalone items only.";
    case "instructions":
      return "Special instructions must be 500 characters or fewer.";
    case "location":
      return "Choose an active delivery location before placing your order.";
    default:
      return "Unable to complete the request. Please try again.";
  }
}

export default async function ProviderOrderPage({
  params,
  searchParams,
}: Props) {
  const profile = await requireProfile();

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
    { data: officeLocations },
    { data: profileRow },
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
          item_type,
          unit_label,
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
          item_type,
          unit_label,
          is_active
        )
      `)
      .eq("provider_id", id)
      .eq("order_date", orderDate)
      .maybeSingle(),

    supabase
      .from("office_locations")
      .select("id, name, address, description")
      .eq("is_active", true)
      .order("name", { ascending: true }),

    supabase
      .from("profiles")
      .select(`
        default_office_location_id,
        office_locations:default_office_location_id (
          id,
          name,
          is_active
        )
      `)
      .eq("id", profile.id)
      .single(),
  ]);

  const defaultLocation = profileRow?.office_locations
    ? Array.isArray(profileRow.office_locations)
      ? profileRow.office_locations[0]
      : profileRow.office_locations
    : null;

  const defaultOfficeLocationInactive = Boolean(
    defaultLocation && defaultLocation.is_active === false,
  );

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
        itemType: item.item_type as MenuItemType,
        unitLabel: item.unit_label,
      }))
    : recurringItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        itemType: item.item_type as MenuItemType,
        unitLabel: item.unit_label,
      }));

  const closedReason = periodFinalized
    ? "Ordering is unavailable because this lunch period has been finalized."
    : !orderingOpen
      ? "Today's ordering window has closed."
      : null;

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

      <Card className="mb-6" padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {formatOrderDeliveryHeadline(deliveryDate)}
          </p>
          <StatusBadge status={orderingOpen ? "open" : "closed"} />
        </div>
        <p className="mt-2 text-sm text-muted">
          Order by {formatJamaicaWallClockTime(cutoffTime)} today (
          {formatDisplayDate(orderDate)}).
        </p>
      </Card>

      {query.error && (
        <Alert variant="error" className="mb-6">
          {getErrorMessage(query.error)}
        </Alert>
      )}

      {closedReason ? (
        <EmptyState title="Ordering closed" description={closedReason} />
      ) : menuItems.length === 0 ? (
        <EmptyState
          title="No menu items available"
          description="This provider has no menu items available for ordering today."
        />
      ) : (
        <ProviderOrderForm
          providerId={provider.id}
          providerName={provider.name}
          orderDate={orderDate}
          deliveryDate={deliveryDate}
          menuItems={menuItems}
          formAction={submitProviderOrder}
          officeLocations={officeLocations ?? []}
          defaultOfficeLocationId={profileRow?.default_office_location_id ?? null}
          defaultOfficeLocationName={defaultLocation?.name ?? null}
          defaultOfficeLocationInactive={defaultOfficeLocationInactive}
        />
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { FormSubmitButton } from "@/components/form-submit-button";
import { requireProfile } from "@/lib/auth";
import {
  getDeliveryDateForOrderDate,
  getJamaicaIsoWeekday,
  getJamaicaTodayDate,
} from "@/lib/datetime";
import { DEFAULT_ORDER_CUTOFF_TIME } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { submitProviderOrder } from "../../actions";

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

function formatCutoffTime(value: string) {
  const [hours, minutes] = value.split(":");

  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    timeStyle: "short",
  }).format(date);
}

function getErrorMessage(code: string) {
  switch (code) {
    case "empty":
      return "Select at least one menu item before submitting.";
    case "deadline":
      return "The ordering deadline has passed.";
    case "closed":
      return "Ordering is not available right now.";
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
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/lunch" className="underline">
        Back to lunch
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">
        {provider.name}
      </h1>

      {provider.description && (
        <p className="mt-2">{provider.description}</p>
      )}

      <p className="mt-4">
        Order today ({orderDate}) for delivery on{" "}
        <strong>{deliveryDate}</strong>.
      </p>

      <p className="mt-1">
        Order by {formatCutoffTime(cutoffTime)} Jamaica time.
      </p>

      {usingSnapshot && (
        <p className="mt-2 text-sm">
          Showing today&apos;s established menu snapshot for this provider.
        </p>
      )}

      {query.error && (
        <p className="mt-6 rounded border p-3">
          {getErrorMessage(query.error)}
        </p>
      )}

      {!orderingOpen ? (
        <p className="mt-8">
          Today&apos;s ordering window has closed.
        </p>
      ) : menuItems.length === 0 ? (
        <p className="mt-8">
          No menu items are available from this provider today.
        </p>
      ) : (
        <form action={submitProviderOrder} className="mt-8">
          <input type="hidden" name="providerId" value={provider.id} />
          <input type="hidden" name="orderDate" value={orderDate} />

          <h2 className="text-xl font-semibold">Place your order</h2>

          <div className="mt-4 space-y-4">
            {menuItems.map((item) => (
              <div key={item.id} className="rounded border p-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-semibold">{item.name}</p>

                    {item.description && (
                      <p className="mt-1">{item.description}</p>
                    )}

                    <p className="mt-1">
                      ${Number(item.price).toFixed(2)}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor={`provider-quantity:${item.id}`}
                      className="block"
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
                      className="w-20 rounded border p-2"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <FormSubmitButton
              pendingText="Submitting..."
              className="rounded border px-4 py-2 disabled:opacity-50"
            >
              Submit order
            </FormSubmitButton>
          </div>
        </form>
      )}
    </main>
  );
}

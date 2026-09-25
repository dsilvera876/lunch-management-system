import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProvidersOverview } from "@/components/admin/lunch-providers/providers-overview";
import { Alert } from "@/components/ui/alert";

type Props = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    deleted?: string;
  }>;
};

type ProviderRow = {
  id: string;
  name: string;
  description: string | null;
  icon_key: string | null;
  active: boolean;
  accepts_late_orders: boolean;
  provider_menu_items: Array<{
    item_type: string;
    active: boolean;
    display_category: string | null;
    provider_menu_item_weekdays: Array<{ weekday: number }>;
  }>;
};

export default async function ProvidersPage({ searchParams }: Props) {
  await requireHrAdminOrOwner();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: providers, error } = await supabase
    .from("lunch_providers")
    .select(`
      id,
      name,
      description,
      icon_key,
      active,
      accepts_late_orders,
      provider_menu_items (
        item_type,
        active,
        display_category,
        provider_menu_item_weekdays (
          weekday
        )
      )
    `)
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Unable to load lunch providers.");
  }

  const providerRows = (providers ?? []) as ProviderRow[];

  return (
    <>
      {params.error === "duplicate" && (
        <Alert variant="error" className="mb-6">
          A provider with that name already exists.
        </Alert>
      )}

      {params.error && params.error !== "duplicate" && (
        <Alert variant="error" className="mb-6">
          Unable to complete that action.
        </Alert>
      )}

      <ProvidersOverview
        flashCreated={Boolean(params.created)}
        flashDeleted={Boolean(params.deleted)}
        providers={providerRows.map((provider) => ({
          id: provider.id,
          name: provider.name,
          description: provider.description,
          iconKey: provider.icon_key,
          active: provider.active,
          acceptsLateOrders: provider.accepts_late_orders,
          menuItems: provider.provider_menu_items.map((item) => ({
            item_type: item.item_type,
            active: item.active,
            display_category: item.display_category,
            weekdays: item.provider_menu_item_weekdays.map((row) => row.weekday),
          })),
        }))}
      />
    </>
  );
}

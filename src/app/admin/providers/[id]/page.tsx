import { notFound } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ManageMenuWorkspace } from "@/components/admin/lunch-providers/manage-menu-workspace";
import type { MenuItemType } from "@/lib/menu-items";
import { Alert } from "@/components/ui/alert";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    menuCreated?: string;
    menuUpdated?: string;
    menuToggled?: string;
  }>;
};

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  item_type: string;
  unit_label: string;
  display_category: string | null;
  active: boolean;
  provider_menu_item_weekdays: Array<{ weekday: number }>;
};

export default async function ProviderManageMenuPage({
  params,
  searchParams,
}: Props) {
  await requireHrAdminOrOwner();

  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: provider, error } = await supabase
    .from("lunch_providers")
    .select("id, name, active, icon_key")
    .eq("id", id)
    .single();

  if (error || !provider) {
    notFound();
  }

  const { data: menuItems, error: menuError } = await supabase
    .from("provider_menu_items")
    .select(`
      id,
      name,
      description,
      price,
      item_type,
      unit_label,
      display_category,
      active,
      provider_menu_item_weekdays (
        weekday
      )
    `)
    .eq("provider_id", id)
    .order("name", { ascending: true });

  if (menuError) {
    throw new Error("Unable to load provider menu items.");
  }

  const items = (menuItems ?? []) as MenuItemRow[];

  const providerMenuItemIds = items.map((item) => item.id);
  let usedProviderMenuItemIds: string[] = [];

  if (providerMenuItemIds.length > 0) {
    const { data: usedRows, error: usedError } = await supabase
      .from("menu_items")
      .select("provider_menu_item_id")
      .in("provider_menu_item_id", providerMenuItemIds);

    if (usedError) {
      throw new Error("Unable to load provider menu item history.");
    }

    usedProviderMenuItemIds = [
      ...new Set(
        (usedRows ?? [])
          .map((row) => row.provider_menu_item_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    ];
  }

  const flashSuccess = query.menuCreated
    ? ("menuCreated" as const)
    : query.menuUpdated
      ? ("menuUpdated" as const)
      : query.menuToggled
        ? ("menuToggled" as const)
        : undefined;

  return (
    <>
      {query.error === "duplicate" && (
        <Alert variant="error" className="mb-6">
          A menu item with that name already exists for this provider.
        </Alert>
      )}

      {query.error === "no-weekdays" && (
        <Alert variant="error" className="mb-6">
          Select at least one weekday. Menu items must be available on one or more order
          days (Mon–Fri).
        </Alert>
      )}

      {query.error &&
        query.error !== "duplicate" &&
        query.error !== "no-weekdays" && (
          <Alert variant="error" className="mb-6">
            Unable to complete that action.
          </Alert>
        )}

      <ManageMenuWorkspace
        flashSuccess={flashSuccess}
        usedProviderMenuItemIds={usedProviderMenuItemIds}
        provider={{
          id: provider.id,
          name: provider.name,
          active: provider.active,
          iconKey: provider.icon_key,
        }}
        menuItems={items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          itemType: item.item_type as MenuItemType,
          unitLabel: item.unit_label,
          displayCategory: item.display_category,
          active: item.active,
          weekdays: item.provider_menu_item_weekdays.map((row) => row.weekday),
        }))}
      />
    </>
  );
}

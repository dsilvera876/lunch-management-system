import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  toggleProviderActive,
  updateProvider,
} from "../actions";
import {
  createProviderMenuItem,
} from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  FormField,
  inputClassName,
  textareaClassName,
} from "@/components/ui/form-field";
import { linkButtonClass } from "@/components/ui/button";
import { WeekdayPicker } from "@/components/weekday-picker";
import { MenuItemTypeFields } from "@/components/menu-item-type-fields";
import { MenuItemAdminCard } from "@/components/menu-item-admin-card";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
    menuCreated?: string;
    menuUpdated?: string;
    menuToggled?: string;
    statusUpdated?: string;
  }>;
};

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  item_type: string;
  unit_label: string;
  active: boolean;
  provider_menu_item_weekdays: Array<{ weekday: number }>;
};

export default async function ProviderDetailPage({
  params,
  searchParams,
}: Props) {
  await requireHrAdminOrOwner();

  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: provider, error } = await supabase
    .from("lunch_providers")
    .select("id, name, description, active")
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

  return (
    <>
      <PageHeader
        title={provider.name}
        description="Manage provider settings and recurring menu items."
        actions={
          <Link href="/admin/providers" className={linkButtonClass("ghost")}>
            All providers
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={provider.active ? "active" : "inactive"} />
        <span className="text-sm text-muted">
          {provider.active
            ? "Visible to staff when menu items are available."
            : "Hidden from staff ordering."}
        </span>
      </div>

      {query.updated && (
        <Alert variant="success" className="mb-6">
          Provider settings saved.
        </Alert>
      )}

      {query.menuCreated && (
        <Alert variant="success" className="mb-6">
          Menu item added.
        </Alert>
      )}

      {query.menuUpdated && (
        <Alert variant="success" className="mb-6">
          Menu item updated.
        </Alert>
      )}

      {query.menuToggled && (
        <Alert variant="success" className="mb-6">
          Menu item status updated.
        </Alert>
      )}

      {query.statusUpdated && (
        <Alert variant="success" className="mb-6">
          Provider status updated.
        </Alert>
      )}

      {query.error === "duplicate" && (
        <Alert variant="error" className="mb-6">
          A menu item with that name already exists for this provider.
        </Alert>
      )}

      {query.error === "no-weekdays" && (
        <Alert variant="error" className="mb-6">
          Select at least one weekday. Menu items must be available on one or
          more order days (Mon–Fri).
        </Alert>
      )}

      {query.error &&
        query.error !== "duplicate" &&
        query.error !== "no-weekdays" && (
          <Alert variant="error" className="mb-6">
            Unable to complete that action.
          </Alert>
        )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section>
          <SectionHeader
            title="Provider settings"
            description="Name, description, and availability."
          />

          <Card>
            <form action={updateProvider} className="grid gap-4">
              <input type="hidden" name="id" value={provider.id} />

              <FormField label="Name" htmlFor="name">
                <input
                  id="name"
                  name="name"
                  defaultValue={provider.name}
                  required
                  className={inputClassName}
                />
              </FormField>

              <FormField label="Description" htmlFor="description">
                <textarea
                  id="description"
                  name="description"
                  rows={3}
                  defaultValue={provider.description ?? ""}
                  className={textareaClassName}
                />
              </FormField>

              <button type="submit" className={linkButtonClass("primary")}>
                Save settings
              </button>
            </form>

            <form
              action={toggleProviderActive}
              className="mt-6 border-t border-border pt-6"
            >
              <input type="hidden" name="id" value={provider.id} />
              <input
                type="hidden"
                name="active"
                value={String(provider.active)}
              />
              <p className="mb-3 text-sm text-muted">
                {provider.active
                  ? "Deactivating hides this provider from staff ordering."
                  : "Activating makes this provider visible when menu items are available."}
              </p>
              <button
                type="submit"
                className={linkButtonClass(provider.active ? "danger" : "secondary")}
              >
                {provider.active ? "Deactivate provider" : "Activate provider"}
              </button>
            </form>
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Recurring menu"
            description="Menu items staff can order on selected weekdays."
          />

          <Card className="mb-6">
            <SectionHeader title="Add menu item" />
            <form action={createProviderMenuItem} className="grid gap-4">
              <input type="hidden" name="providerId" value={provider.id} />

              <FormField label="Name" htmlFor="itemName">
                <input id="itemName" name="name" required className={inputClassName} />
              </FormField>

              <FormField label="Description" htmlFor="itemDescription">
                <textarea
                  id="itemDescription"
                  name="description"
                  rows={2}
                  className={textareaClassName}
                />
              </FormField>

              <FormField label="Price" htmlFor="itemPrice">
                <input
                  id="itemPrice"
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className={inputClassName}
                />
              </FormField>

              <MenuItemTypeFields />

              <WeekdayPicker />

              <button type="submit" className={linkButtonClass("primary")}>
                Add menu item
              </button>
            </form>
          </Card>

          {items.length === 0 ? (
            <EmptyState
              title="No menu items yet"
              description="Add a recurring menu item above to make this provider available for ordering."
            />
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const weekdays = item.provider_menu_item_weekdays.map(
                  (row) => row.weekday,
                );

                return (
                  <MenuItemAdminCard
                    key={item.id}
                    providerId={provider.id}
                    item={{
                      id: item.id,
                      name: item.name,
                      description: item.description,
                      price: item.price,
                      itemType: item.item_type,
                      unitLabel: item.unit_label,
                      active: item.active,
                      weekdays,
                    }}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { formatWeekdayList, WEEKDAYS } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import {
  toggleProviderActive,
  updateProvider,
} from "../actions";
import {
  createProviderMenuItem,
  toggleProviderMenuItemActive,
  updateProviderMenuItem,
} from "./actions";
import { formatCurrency } from "@/lib/format";
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

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
    menuCreated?: string;
    menuUpdated?: string;
  }>;
};

type MenuItemRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
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
        description="Recurring weekly menu (order weekdays). Delivery is the next business day (Friday orders deliver Monday)."
        actions={
          <Link href="/admin/providers" className={linkButtonClass("ghost")}>
            All providers
          </Link>
        }
      />

      <div className="mb-6">
        <StatusBadge status={provider.active ? "active" : "inactive"} />
      </div>

      {query.updated && (
        <Alert variant="success" className="mb-6">
          Provider updated.
        </Alert>
      )}

      {query.menuCreated && (
        <Alert variant="success" className="mb-6">
          Menu item created.
        </Alert>
      )}

      {query.menuUpdated && (
        <Alert variant="success" className="mb-6">
          Menu item updated.
        </Alert>
      )}

      {query.error === "duplicate" && (
        <Alert variant="error" className="mb-6">
          A menu item with that name already exists for this provider.
        </Alert>
      )}

      {query.error && query.error !== "duplicate" && (
        <Alert variant="error" className="mb-6">
          Unable to complete that action.
        </Alert>
      )}

      <section className="mb-10">
        <SectionHeader title="Provider details" />

        <Card className="max-w-xl">
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
              Save provider
            </button>
          </form>

          <form action={toggleProviderActive} className="mt-4 border-t border-border pt-4">
            <input type="hidden" name="id" value={provider.id} />
            <input
              type="hidden"
              name="active"
              value={String(provider.active)}
            />
            <button
              type="submit"
              className={linkButtonClass(provider.active ? "danger" : "secondary")}
            >
              {provider.active ? "Deactivate provider" : "Activate provider"}
            </button>
          </form>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeader
          title="Add recurring menu item"
          description="Weekday is when staff place the order, not delivery day."
        />

        <Card className="max-w-xl">
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

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Order weekdays</legend>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="allWeekdays"
                  value="true"
                  defaultChecked
                  className="size-4 rounded border-border"
                />
                All weekdays (Mon–Fri)
              </label>

              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={`weekday:${day.value}`}
                      defaultChecked
                      className="size-4 rounded border-border"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <button type="submit" className={linkButtonClass("primary")}>
              Add menu item
            </button>
          </form>
        </Card>
      </section>

      <section>
        <SectionHeader title="Recurring menu" />

        {items.length === 0 ? (
          <EmptyState
            title="No menu items yet"
            description="Add recurring menu items above to make this provider available for ordering."
          />
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const weekdays = item.provider_menu_item_weekdays.map(
                (row) => row.weekday,
              );

              return (
                <Card key={item.id} padding="md">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        <StatusBadge status={item.active ? "active" : "inactive"} />
                      </div>
                      {item.description && (
                        <p className="mt-1 text-sm text-muted">{item.description}</p>
                      )}
                      <p className="mt-2 text-sm">
                        ${formatCurrency(item.price)} ·{" "}
                        <span className="font-medium">{formatWeekdayList(weekdays)}</span>
                      </p>
                    </div>

                    <form action={toggleProviderMenuItemActive}>
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="menuItemId" value={item.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(item.active)}
                      />
                      <button
                        type="submit"
                        className={linkButtonClass(item.active ? "danger" : "secondary")}
                      >
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>

                  <form
                    action={updateProviderMenuItem}
                    className="mt-4 grid max-w-xl gap-3 border-t border-border pt-4"
                  >
                    <input type="hidden" name="providerId" value={provider.id} />
                    <input type="hidden" name="menuItemId" value={item.id} />

                    <FormField label="Name" htmlFor={`name-${item.id}`}>
                      <input
                        id={`name-${item.id}`}
                        name="name"
                        defaultValue={item.name}
                        required
                        className={inputClassName}
                      />
                    </FormField>

                    <FormField label="Description" htmlFor={`description-${item.id}`}>
                      <textarea
                        id={`description-${item.id}`}
                        name="description"
                        rows={2}
                        defaultValue={item.description ?? ""}
                        className={textareaClassName}
                      />
                    </FormField>

                    <FormField label="Price" htmlFor={`price-${item.id}`}>
                      <input
                        id={`price-${item.id}`}
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={Number(item.price)}
                        required
                        className={inputClassName}
                      />
                    </FormField>

                    <fieldset className="space-y-3">
                      <legend className="text-sm font-medium">Order weekdays</legend>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="allWeekdays"
                          value="true"
                          defaultChecked={weekdays.length === 5}
                          className="size-4 rounded border-border"
                        />
                        All weekdays (Mon–Fri)
                      </label>

                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {WEEKDAYS.map((day) => (
                          <label
                            key={day.value}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              name={`weekday:${day.value}`}
                              defaultChecked={weekdays.includes(day.value)}
                              className="size-4 rounded border-border"
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <button type="submit" className={linkButtonClass("secondary")}>
                      Save menu item
                    </button>
                  </form>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
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
  await requireAdmin();

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
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{provider.name}</h1>
          <p className="mt-2 text-sm">
            Recurring weekly menu (order weekdays). Delivery is the next
            business day (Friday orders deliver Monday).
          </p>
        </div>

        <Link href="/admin/providers" className="underline">
          Back to providers
        </Link>
      </div>

      {query.updated && (
        <p className="mt-4 rounded border p-3">Provider updated.</p>
      )}

      {query.menuCreated && (
        <p className="mt-4 rounded border p-3">Menu item created.</p>
      )}

      {query.menuUpdated && (
        <p className="mt-4 rounded border p-3">Menu item updated.</p>
      )}

      {query.error === "duplicate" && (
        <p className="mt-4 rounded border p-3">
          A menu item with that name already exists for this provider.
        </p>
      )}

      {query.error && query.error !== "duplicate" && (
        <p className="mt-4 rounded border p-3">
          Unable to complete that action.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Provider details</h2>

        <form action={updateProvider} className="mt-4 grid max-w-xl gap-4">
          <input type="hidden" name="id" value={provider.id} />

          <div>
            <label htmlFor="name" className="block">
              Name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={provider.name}
              required
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="description" className="block">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={provider.description ?? ""}
              className="w-full rounded border p-2"
            />
          </div>

          <button type="submit" className="w-fit rounded border px-4 py-2">
            Save provider
          </button>
        </form>

        <form action={toggleProviderActive} className="mt-4">
          <input type="hidden" name="id" value={provider.id} />
          <input
            type="hidden"
            name="active"
            value={String(provider.active)}
          />

          <button type="submit" className="rounded border px-4 py-2">
            {provider.active ? "Deactivate provider" : "Activate provider"}
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Add recurring menu item</h2>

        <form action={createProviderMenuItem} className="mt-4 grid max-w-xl gap-4">
          <input type="hidden" name="providerId" value={provider.id} />

          <div>
            <label htmlFor="itemName" className="block">
              Name
            </label>
            <input
              id="itemName"
              name="name"
              required
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="itemDescription" className="block">
              Description
            </label>
            <textarea
              id="itemDescription"
              name="description"
              rows={2}
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="itemPrice" className="block">
              Price
            </label>
            <input
              id="itemPrice"
              name="price"
              type="number"
              min="0"
              step="0.01"
              required
              className="w-full rounded border p-2"
            />
          </div>

          <fieldset>
            <legend className="font-semibold">Order weekdays</legend>
            <p className="mt-1 text-sm">
              Weekday is when staff place the order, not delivery day.
            </p>

            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                name="allWeekdays"
                value="true"
                defaultChecked
              />
              All weekdays (Mon–Fri)
            </label>

            <div className="mt-3 flex flex-wrap gap-4">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={`weekday:${day.value}`}
                    defaultChecked
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="w-fit rounded border px-4 py-2">
            Add menu item
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Recurring menu</h2>

        {items.length === 0 ? (
          <p className="mt-4">No menu items yet.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {items.map((item) => {
              const weekdays = item.provider_menu_item_weekdays.map(
                (row) => row.weekday,
              );

              return (
                <article key={item.id} className="rounded border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      {item.description && <p>{item.description}</p>}
                      <p className="mt-1">
                        ${Number(item.price).toFixed(2)} ·{" "}
                        <strong>{formatWeekdayList(weekdays)}</strong> ·{" "}
                        {item.active ? "Active" : "Inactive"}
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

                      <button type="submit" className="rounded border px-3 py-2">
                        {item.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>

                  <form
                    action={updateProviderMenuItem}
                    className="mt-4 grid max-w-xl gap-3 border-t pt-4"
                  >
                    <input type="hidden" name="providerId" value={provider.id} />
                    <input type="hidden" name="menuItemId" value={item.id} />

                    <div>
                      <label htmlFor={`name-${item.id}`} className="block">
                        Name
                      </label>
                      <input
                        id={`name-${item.id}`}
                        name="name"
                        defaultValue={item.name}
                        required
                        className="w-full rounded border p-2"
                      />
                    </div>

                    <div>
                      <label htmlFor={`description-${item.id}`} className="block">
                        Description
                      </label>
                      <textarea
                        id={`description-${item.id}`}
                        name="description"
                        rows={2}
                        defaultValue={item.description ?? ""}
                        className="w-full rounded border p-2"
                      />
                    </div>

                    <div>
                      <label htmlFor={`price-${item.id}`} className="block">
                        Price
                      </label>
                      <input
                        id={`price-${item.id}`}
                        name="price"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={Number(item.price)}
                        required
                        className="w-full rounded border p-2"
                      />
                    </div>

                    <fieldset>
                      <legend className="font-semibold">Order weekdays</legend>

                      <label className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="allWeekdays"
                          value="true"
                          defaultChecked={weekdays.length === 5}
                        />
                        All weekdays (Mon–Fri)
                      </label>

                      <div className="mt-3 flex flex-wrap gap-4">
                        {WEEKDAYS.map((day) => (
                          <label
                            key={day.value}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              name={`weekday:${day.value}`}
                              defaultChecked={weekdays.includes(day.value)}
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <button type="submit" className="w-fit rounded border px-4 py-2">
                      Save menu item
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconCalendar, IconPencil } from "@/components/icons/line-icons";
import { ProviderIconWell } from "@/lib/provider-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { MenuCategoryIconWell } from "@/components/admin/lunch-providers/menu-category-icon";
import { MenuItemEditorPanel } from "@/components/admin/lunch-providers/menu-item-editor-panel";
import {
  MANAGE_MENU_ALL_DAYS,
  MANAGE_MENU_WEEKDAYS,
  buildManageMenuSectionsForView,
  getManageMenuViewContext,
  mergeManageMenuItem,
  removeManageMenuItem,
  type ManageMenuItemRecord,
  type ManageMenuView,
} from "@/lib/lunch-providers-presentation";
import { type Weekday } from "@/lib/datetime";
import { formatCurrency } from "@/lib/format";
import { normalizeDisplayCategory } from "@/lib/menu-items";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { linkButtonClass } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
  manageMenuFlashToastTitle,
} from "@/lib/manage-menu-form";

type Props = {
  provider: {
    id: string;
    name: string;
    active: boolean;
    iconKey: string | null;
  };
  menuItems: ManageMenuItemRecord[];
  usedProviderMenuItemIds: string[];
  flashSuccess?: "menuCreated" | "menuUpdated" | "menuToggled";
};

const compactEditButtonClass =
  "!min-h-0 h-8 shrink-0 whitespace-nowrap px-2.5 py-0 text-xs leading-none";

function ManageMenuItemWeekdayPills({
  weekdays,
  pageWeekday,
}: {
  weekdays: number[];
  pageWeekday: Weekday | null;
}) {
  const configured = MANAGE_MENU_WEEKDAYS.filter((day) => weekdays.includes(day.value));

  if (configured.length === 0) {
    return <span className="text-muted">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center justify-start gap-1">
      {configured.map((day) => {
        const isPageWeekday = pageWeekday !== null && day.value === pageWeekday;
        return (
          <span
            key={day.value}
            className={`inline-flex min-w-[2rem] justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
              isPageWeekday
                ? "bg-primary text-white ring-1 ring-inset ring-primary/35"
                : "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15"
            }`}
          >
            {isPageWeekday ? day.short.toUpperCase() : day.short}
          </span>
        );
      })}
    </div>
  );
}

function ManageMenuWorkspaceContent({
  provider,
  menuItems: initialMenuItems,
  usedProviderMenuItemIds,
  flashSuccess,
}: Props) {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const flashHandled = useRef(false);

  useEffect(() => {
    if (!flashSuccess || flashHandled.current) {
      return;
    }

    flashHandled.current = true;
    showToast({
      title: manageMenuFlashToastTitle(flashSuccess),
      durationMs: MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
    });
    router.replace(pathname, { scroll: false });
  }, [flashSuccess, pathname, router, showToast]);

  const [menuItems, setMenuItems] = useState(initialMenuItems);
  const usedMenuItemIds = useMemo(
    () => new Set(usedProviderMenuItemIds),
    [usedProviderMenuItemIds],
  );
  const [menuView, setMenuView] = useState<ManageMenuView>(MANAGE_MENU_ALL_DAYS);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const editingItem = useMemo(
    () =>
      editingItemId === null
        ? null
        : (menuItems.find((item) => item.id === editingItemId) ?? null),
    [editingItemId, menuItems],
  );

  const sections = useMemo(
    () => buildManageMenuSectionsForView(menuItems, menuView),
    [menuItems, menuView],
  );

  const viewContext = getManageMenuViewContext(menuView);
  const pageWeekday = menuView === MANAGE_MENU_ALL_DAYS ? null : menuView;

  function handleMenuItemSaved(item: ManageMenuItemRecord) {
    setMenuItems((current) => mergeManageMenuItem(current, item));
  }

  function handleMenuItemDeleted(menuItemId: string) {
    setMenuItems((current) => removeManageMenuItem(current, menuItemId));
    if (editingItemId === menuItemId) {
      setEditingItemId(null);
    }
  }

  function selectItemForEdit(item: ManageMenuItemRecord) {
    setEditingItemId(item.id);
  }

  function cancelEditing() {
    setEditingItemId(null);
  }

  const menuBrowse = (
    <>
      <div className="mb-4 flex w-full overflow-hidden rounded-xl border border-border bg-slate-100/80 p-1">
        <button
          type="button"
          onClick={() => setMenuView(MANAGE_MENU_ALL_DAYS)}
          className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors ${
            menuView === MANAGE_MENU_ALL_DAYS
              ? "bg-primary text-white shadow-sm"
              : "text-muted hover:bg-white/70 hover:text-foreground"
          }`}
        >
          <span className="hidden sm:inline">All Days</span>
          <span className="sm:hidden">All</span>
        </button>
        {MANAGE_MENU_WEEKDAYS.map((day) => {
          const selected = menuView === day.value;
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => setMenuView(day.value)}
              className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors ${
                selected
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:bg-white/70 hover:text-foreground"
              }`}
            >
              <span className="hidden sm:inline">{day.label}</span>
              <span className="sm:hidden">{day.short}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.06] px-4 py-3">
        <TealIconWell size="sm" className="mt-0.5 shrink-0 rounded-lg">
          <IconCalendar aria-hidden />
        </TealIconWell>
        <div>
          <p className="text-sm font-semibold text-foreground">{viewContext.title}</p>
          <p className="text-sm text-muted">{viewContext.description}</p>
        </div>
      </div>

      {menuItems.length === 0 ? (
        <EmptyState
          title="No menu items yet"
          description="Add a recurring menu item to make this provider available for ordering."
        />
      ) : sections.length === 0 ? (
        <EmptyState
          title="No items for this view"
          description="Select All Days or another weekday, or add menu items for this day."
        />
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section
              key={section.key}
              className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
            >
              <div className="flex items-center gap-3 border-b border-border/80 bg-slate-50/70 px-4 py-3">
                <MenuCategoryIconWell sectionKey={section.key} label={section.label} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                    {section.label}
                  </h2>
                  <p className="text-xs text-muted">
                    {section.items.length}{" "}
                    {section.items.length === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] table-fixed text-sm">
                  <colgroup>
                    <col />
                    <col className="w-[5.25rem]" />
                    <col className="w-[13rem]" />
                    <col className="w-[4.25rem]" />
                    <col className="w-[6rem]" />
                    <col className="w-[5.25rem]" />
                  </colgroup>
                  <thead className="border-b border-border bg-slate-50/50 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-2 py-2">Price</th>
                      <th className="hidden px-2 py-2 md:table-cell">Weekdays</th>
                      <th className="hidden px-2 py-2 sm:table-cell">Unit</th>
                      <th className="hidden px-2 py-2 lg:table-cell">Category</th>
                      <th className="px-2 py-2 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80">
                    {section.items.map((item) => {
                      const category =
                        item.itemType === "standalone"
                          ? normalizeDisplayCategory(item.displayCategory) ?? "—"
                          : "—";

                      const isSelectedForEdit = editingItemId === item.id;

                      return (
                        <tr
                          key={item.id}
                          className={
                            isSelectedForEdit
                              ? "bg-primary/[0.06] ring-1 ring-inset ring-primary/25"
                              : item.active
                                ? "bg-surface"
                                : "bg-slate-50/60 text-muted"
                          }
                        >
                          <td className="px-3 py-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="truncate font-medium text-foreground">
                                {item.name}
                              </span>
                              {!item.active ? <StatusBadge status="inactive" /> : null}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-sm font-medium tabular-nums text-foreground">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="hidden px-2 py-2 md:table-cell">
                            <ManageMenuItemWeekdayPills
                              weekdays={item.weekdays}
                              pageWeekday={pageWeekday}
                            />
                          </td>
                          <td className="hidden truncate px-2 py-2 text-sm sm:table-cell">
                            {item.unitLabel}
                          </td>
                          <td className="hidden truncate px-2 py-2 text-sm text-muted lg:table-cell">
                            {category}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => selectItemForEdit(item)}
                              aria-pressed={isSelectedForEdit}
                              className={`${linkButtonClass("secondary")} ${compactEditButtonClass} inline-flex items-center justify-center gap-1`}
                            >
                              <IconPencil size={13} aria-hidden />
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <ProviderIconWell iconKey={provider.iconKey} size="large" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-foreground">{provider.name}</h1>
                <StatusBadge status={provider.active ? "active" : "inactive"} />
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">Manage menu</p>
              <p className="text-sm text-muted">
                View and manage recurring menu items by weekday.
              </p>
            </div>
          </div>
          <Link
            href={`/admin/providers/${provider.id}/edit`}
            className={linkButtonClass("secondary")}
          >
            Edit provider
          </Link>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
        <div className="order-2 min-w-0 lg:order-1">{menuBrowse}</div>
        <aside className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
          <MenuItemEditorPanel
            key={editingItemId ?? "add"}
            providerId={provider.id}
            editingItem={editingItem}
            canDeletePermanently={
              editingItem !== null && !usedMenuItemIds.has(editingItem.id)
            }
            onCancelEdit={cancelEditing}
            onItemCreated={handleMenuItemSaved}
            onItemUpdated={handleMenuItemSaved}
            onItemDeleted={handleMenuItemDeleted}
          />
        </aside>
      </div>
    </>
  );
}

export function ManageMenuWorkspace(props: Props) {
  return (
    <ToastProvider>
      <ManageMenuWorkspaceContent {...props} />
    </ToastProvider>
  );
}

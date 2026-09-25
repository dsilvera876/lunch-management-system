"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconCalendar,
  IconClock,
  IconPencil,
  IconUtensils,
} from "@/components/icons/line-icons";
import { AddProviderDrawer } from "@/components/admin/lunch-providers/add-provider-drawer";
import {
  MANAGE_MENU_WEEKDAYS,
  buildProviderMenuMetrics,
  collectActiveProviderWeekdays,
  formatLateOrdersOverviewLabel,
} from "@/lib/lunch-providers-presentation";
import { ProviderIconWell } from "@/lib/provider-icons";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button, linkButtonClass } from "@/components/ui/button";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  PROVIDER_SUCCESS_TOAST,
  PROVIDER_SUCCESS_TOAST_DURATION_MS,
} from "@/lib/provider-form";

export type ProviderOverviewRecord = {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  active: boolean;
  acceptsLateOrders: boolean;
  menuItems: Array<{
    item_type: string;
    active: boolean;
    display_category: string | null;
    weekdays: number[];
  }>;
};

type Props = {
  providers: ProviderOverviewRecord[];
  flashCreated?: boolean;
  flashDeleted?: boolean;
};

const CARD_GRID =
  "lg:grid-cols-[minmax(15rem,18rem)_15rem_minmax(17rem,1fr)_13.5rem]";

const compactOverviewLinkClass =
  "!min-h-0 h-[38px] shrink-0 whitespace-nowrap px-3 py-0 text-sm leading-none";

function ProvidersOverviewFlashToasts({
  flashCreated,
  flashDeleted,
}: Pick<Props, "flashCreated" | "flashDeleted">) {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) {
      return;
    }

    if (flashCreated) {
      handled.current = true;
      showToast({
        title: PROVIDER_SUCCESS_TOAST.created,
        durationMs: PROVIDER_SUCCESS_TOAST_DURATION_MS,
      });
      router.replace(pathname, { scroll: false });
      return;
    }

    if (flashDeleted) {
      handled.current = true;
      showToast({
        title: PROVIDER_SUCCESS_TOAST.deleted,
        durationMs: PROVIDER_SUCCESS_TOAST_DURATION_MS,
      });
      router.replace(pathname, { scroll: false });
    }
  }, [flashCreated, flashDeleted, pathname, router, showToast]);

  return null;
}

function ProvidersOverviewContent({ providers, flashCreated, flashDeleted }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <ProvidersOverviewFlashToasts flashCreated={flashCreated} flashDeleted={flashDeleted} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Lunch Providers</h1>
          <p className="mt-1 text-sm text-muted">Manage provider menus and settings.</p>
        </div>
        <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
          + Add provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          title="No providers yet"
          description="Add a lunch provider to configure recurring menus."
        />
      ) : (
        <div className="space-y-2.5">
          {providers.map((provider) => {
            const metrics = buildProviderMenuMetrics(
              provider.menuItems.map((item) => ({
                item_type: item.item_type,
                active: item.active,
                display_category: item.display_category,
              })),
            );
            const availableWeekdays = collectActiveProviderWeekdays(
              provider.menuItems.map((item) => ({
                active: item.active,
                weekdays: item.weekdays,
              })),
            );
            const lateOrdersLabel = formatLateOrdersOverviewLabel(provider.acceptsLateOrders);
            const description = provider.description?.trim();

            return (
              <article
                key={provider.id}
                className={`overflow-hidden rounded-xl border border-border bg-surface shadow-sm border-t-4 border-t-primary/45 ${
                  provider.active ? "" : "opacity-90"
                }`}
              >
                <div
                  className={`grid grid-cols-1 gap-3 p-3 md:grid-cols-2 md:items-center md:gap-x-4 md:gap-y-2.5 lg:grid lg:items-center lg:gap-x-0 lg:py-2.5 lg:pl-3 lg:pr-2 ${CARD_GRID}`}
                >
                  <div className="flex min-w-0 max-w-[18rem] items-center gap-2.5 lg:max-w-none lg:pr-2">
                    <ProviderIconWell iconKey={provider.iconKey} size="medium" />
                    <div className={`min-w-0 ${description ? "max-w-[17rem]" : ""}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <h2 className="text-base font-semibold leading-tight text-foreground">
                          {provider.name}
                        </h2>
                        <StatusBadge status={provider.active ? "active" : "inactive"} />
                      </div>
                      {description ? (
                        <p className="mt-0.5 line-clamp-2 max-w-[17rem] text-sm leading-snug text-muted">
                          {description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center md:justify-end lg:min-w-[15rem] lg:max-w-[15rem] lg:justify-start lg:border-l lg:border-border lg:pl-3 lg:pr-2">
                    {metrics.length > 0 ? (
                      <div className="flex items-stretch justify-start divide-x divide-border/70">
                        {metrics.map((metric) => (
                          <div
                            key={`${metric.label}-${metric.value}`}
                            className="min-w-[3.25rem] shrink-0 px-2.5 first:pl-0 last:pr-0 text-left"
                          >
                            <p className="text-lg font-semibold leading-none text-foreground">
                              {metric.value}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium leading-tight text-muted">
                              {metric.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No active menu items</p>
                    )}
                  </div>

                  <div className="min-w-0 lg:border-l lg:border-border lg:px-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted lg:gap-2 lg:text-sm">
                      <IconCalendar size={15} aria-hidden className="text-primary/80" />
                      Available
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-start gap-1 lg:mt-2 lg:gap-1.5">
                      {MANAGE_MENU_WEEKDAYS.map((day) => {
                        const isAvailable = availableWeekdays.includes(day.value);
                        return (
                          <span
                            key={day.value}
                            className={`inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none lg:min-w-[2.5rem] lg:px-2.5 lg:py-1 lg:text-[11px] ${
                              isAvailable
                                ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {day.short}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-sm leading-snug lg:mt-2.5">
                      <IconClock size={15} aria-hidden className="shrink-0 text-muted" />
                      <span
                        className={
                          provider.acceptsLateOrders
                            ? "font-medium text-primary"
                            : "font-medium text-muted"
                        }
                      >
                        Late orders: {lateOrdersLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex w-full flex-col justify-center gap-1.5 self-center md:col-span-2 lg:col-span-1 lg:min-w-0 lg:w-full lg:border-l lg:border-border lg:pl-3 lg:pr-2">
                    <Link
                      href={`/admin/providers/${provider.id}`}
                      className={`${linkButtonClass("primary")} ${compactOverviewLinkClass} inline-flex w-full items-center justify-center gap-1.5 lg:w-full`}
                    >
                      <IconUtensils size={14} aria-hidden className="shrink-0" />
                      Manage Menu
                    </Link>
                    <Link
                      href={`/admin/providers/${provider.id}/edit`}
                      className={`${linkButtonClass("secondary")} ${compactOverviewLinkClass} inline-flex w-full items-center justify-center gap-1.5 lg:w-full`}
                    >
                      <IconPencil size={14} aria-hidden className="shrink-0" />
                      Edit
                    </Link>
                    <p className="mt-0.5 text-center text-xs leading-none text-muted lg:text-left lg:whitespace-nowrap">
                      Edit details and late-order settings
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <AddProviderDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

export function ProvidersOverview(props: Props) {
  return (
    <ToastProvider>
      <ProvidersOverviewContent {...props} />
    </ToastProvider>
  );
}

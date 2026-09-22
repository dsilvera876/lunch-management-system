import Link from "next/link";
import type { ProviderOperationalGroup } from "@/lib/operational-orders";
import {
  buildProviderPrintHref,
  countProviderEmployeeOrders,
  flattenProviderOrders,
  formatProviderLocationSubtitle,
  providerHasMultipleLocations,
  resolveProviderPrintDeliveryDate,
} from "@/lib/todays-orders-presentation";
import { TodaysPreparationSummary } from "@/components/admin/todays-orders/todays-preparation-summary";
import { TodaysEmployeeOrdersTable } from "@/components/admin/todays-orders/todays-employee-orders-table";
import { IconDownload, IconUtensils } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  provider: ProviderOperationalGroup;
};

export function TodaysProviderOrdersCard({ provider }: Props) {
  const employeeOrders = flattenProviderOrders(provider);
  const employeeCount = countProviderEmployeeOrders(provider);
  const showLocation = providerHasMultipleLocations(provider);
  const printDeliveryDate = resolveProviderPrintDeliveryDate(provider);

  return (
    <article className="overflow-hidden rounded-xl border border-border border-t-4 border-t-primary/50 bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 gap-3">
          <TealIconWell className="mt-0.5 shrink-0">
            <IconUtensils aria-hidden />
          </TealIconWell>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-900">{provider.providerName}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {formatProviderLocationSubtitle(provider.officeSummaries)}
            </p>
          </div>
        </div>
        <Link
          href={buildProviderPrintHref(provider.providerId, printDeliveryDate)}
          className={`${linkButtonClass("secondary")} w-full justify-center gap-2 border-primary/30 text-primary hover:bg-primary/5 sm:w-auto print:hidden`}
        >
          <IconDownload size={16} aria-hidden />
          Print Delivery Sheet
        </Link>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <TodaysPreparationSummary sections={provider.preparationSections} />

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Employee Orders ({employeeCount})
          </h3>
          <TodaysEmployeeOrdersTable orders={employeeOrders} showLocation={showLocation} />
        </div>
      </div>
    </article>
  );
}

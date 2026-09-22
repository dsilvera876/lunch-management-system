import type { ReactNode } from "react";
import type { TodaysOrdersSummaryMetrics } from "@/lib/todays-orders-presentation";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { IconClipboard, IconStorefront, IconUsers } from "@/components/icons/line-icons";

type Props = {
  metrics: TodaysOrdersSummaryMetrics;
};

function SummaryChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-slate-50/80 px-3 py-2">
      <TealIconWell size="sm">{icon}</TealIconWell>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="text-base font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

export function TodaysOrdersSummary({ metrics }: Props) {
  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      <SummaryChip
        icon={<IconClipboard aria-hidden />}
        label="Orders"
        value={metrics.orderCount}
      />
      <SummaryChip
        icon={<IconStorefront aria-hidden />}
        label="Providers"
        value={metrics.providerCount}
      />
      {metrics.locationCount > 1 ? (
        <SummaryChip
          icon={<IconUsers aria-hidden />}
          label="Locations"
          value={metrics.locationCount}
        />
      ) : null}
      {metrics.pendingCount > 0 ? (
        <SummaryChip
          icon={<IconClipboard aria-hidden />}
          label="Pending"
          value={metrics.pendingCount}
        />
      ) : null}
      {metrics.issueCount > 0 ? (
        <SummaryChip
          icon={<IconClipboard aria-hidden />}
          label="Issues"
          value={metrics.issueCount}
        />
      ) : null}
    </div>
  );
}

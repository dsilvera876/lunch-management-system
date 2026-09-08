import { formatJamaicaWallClockTime } from "@/lib/settings";
import type { StaffOrderingContext } from "@/lib/staff-ordering";
import { formatDisplayDate, getOrderingClosedReason } from "@/lib/ordering-ui";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";

type Props = Pick<
  StaffOrderingContext,
  | "orderDate"
  | "deliveryDate"
  | "cutoffTime"
  | "orderingOpen"
  | "orderWeekday"
  | "periodFinalized"
> & {
  defaultLocationName?: string | null;
};

export function OrderingStatusBanner({
  deliveryDate,
  cutoffTime,
  orderingOpen,
  orderWeekday,
  periodFinalized,
  defaultLocationName,
}: Props) {
  const closedReason = getOrderingClosedReason({
    orderWeekday,
    periodFinalized,
    orderingOpen,
  });

  if (!orderWeekday || !deliveryDate) {
    return (
      <Card className="mb-8" padding="sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Ordering closed</h2>
          <StatusBadge status="closed" />
        </div>
        <p className="mt-2 text-sm text-muted">
          {closedReason?.description ??
            "Lunch ordering is closed on weekends. Ordering resumes Monday for Tuesday delivery."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-8" padding="sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">
              Ordering today for delivery {formatDisplayDate(deliveryDate)}
            </h2>
            <StatusBadge status={orderingOpen ? "open" : "closed"} />
          </div>
          {orderingOpen && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>Cutoff: {formatJamaicaWallClockTime(cutoffTime)}</span>
              <span className="hidden sm:inline">·</span>
              <span>
                Deliver to: {defaultLocationName ?? "Select at checkout"}{" "}
                <Link href="/account" className="text-primary hover:underline ml-1">
                  Change
                </Link>
              </span>
            </div>
          )}
        </div>

        {closedReason && (
          <p className="text-sm text-amber-900">
            <span className="font-medium">{closedReason.title}.</span>{" "}
            {closedReason.description}
          </p>
        )}
      </div>
    </Card>
  );
}

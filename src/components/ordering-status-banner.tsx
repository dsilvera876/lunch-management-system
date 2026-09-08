import { formatJamaicaWallClockTime } from "@/lib/settings";
import type { StaffOrderingContext } from "@/lib/staff-ordering";
import {
  formatDisplayDate,
  formatOrderDeliveryHeadline,
  getOrderingClosedReason,
} from "@/lib/ordering-ui";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type Props = Pick<
  StaffOrderingContext,
  | "orderDate"
  | "deliveryDate"
  | "cutoffTime"
  | "orderingOpen"
  | "orderWeekday"
  | "periodFinalized"
>;

export function OrderingStatusBanner({
  orderDate,
  deliveryDate,
  cutoffTime,
  orderingOpen,
  orderWeekday,
  periodFinalized,
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">
            {formatOrderDeliveryHeadline(deliveryDate)}
          </h2>
          <StatusBadge status={orderingOpen ? "open" : "closed"} />
        </div>

        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Order date</dt>
            <dd className="mt-1 font-medium">{formatDisplayDate(orderDate)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Delivery date</dt>
            <dd className="mt-1 font-medium">
              {formatDisplayDate(deliveryDate)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Order by</dt>
            <dd className="mt-1 font-medium">
              {formatJamaicaWallClockTime(cutoffTime)} today
            </dd>
          </div>
        </dl>

        {closedReason && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            <span className="font-medium">{closedReason.title}.</span>{" "}
            {closedReason.description}
          </p>
        )}

        {orderingOpen && (
          <p className="text-sm text-muted">
            You may place unlimited separate orders from any provider before
            the cutoff. Each order is submitted individually.
          </p>
        )}
      </div>
    </Card>
  );
}

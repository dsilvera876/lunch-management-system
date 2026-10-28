import Link from "next/link";
import { requireViewAllOrders, canFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadHrFinalizationBlockerOrders } from "@/lib/lunch-period-finalization-blockers";
import { formatLunchPeriodCompactAdminRange } from "@/lib/lunch-periods";
import { OperationalOrderCard } from "@/components/admin/operational-orders";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { linkButtonClass } from "@/components/ui/button";

type Props = {
  searchParams: Promise<{ periodId?: string; error?: string }>;
};

export default async function FinancialFinalizationBlockerOrdersPage({
  searchParams,
}: Props) {
  const profile = await requireViewAllOrders();
  const params = await searchParams;

  if (!params.periodId) {
    return (
      <>
        <PageHeader
          title="Financial finalization blockers"
          description="Review operational orders that HR must reconcile before Accounts can finalize a period."
        />
        <EmptyState
          title="No financial period selected"
          description="Open this view from a valid period-specific reconciliation link."
          action={
            <Link href="/admin/orders" className={linkButtonClass("secondary")}>
              Return to Order History
            </Link>
          }
        />
      </>
    );
  }

  const supabase = await createClient();
  const result = await loadHrFinalizationBlockerOrders(supabase, params.periodId);
  const canReconcile = canFulfillOrders(profile.role);
  const returnTo = `/admin/orders/finalization-blockers?periodId=${encodeURIComponent(
    result.period.id,
  )}`;

  return (
    <>
      <PageHeader
        title="Financial finalization blockers"
        description={`${result.period.label} - ${formatLunchPeriodCompactAdminRange(
          result.period.startDate,
          result.period.endDate,
        )}`}
        actions={
          <Link href="/admin/orders" className={linkButtonClass("secondary")}>
            Order History
          </Link>
        }
      />

      {params.error ? (
        <Alert variant="error" className="mb-6">
          The reconciliation change was not completed. Reloaded blocker data is shown below.
        </Alert>
      ) : null}

      {!canReconcile ? (
        <Alert variant="info" className="mb-6">
          Support Mode is read-only. You can inspect current blockers, but only permanent HR can
          reconcile orders.
        </Alert>
      ) : null}

      {result.orders.length === 0 ? (
        <EmptyState
          title="No outstanding blockers"
          description="All operational orders in this period are currently reconciled. Accounts can reload the Financial Reports page to finalize the period when it is eligible."
        />
      ) : (
        <section aria-labelledby="period-blocker-orders-heading" className="space-y-4">
          <div>
            <h2 id="period-blocker-orders-heading" className="text-xl font-semibold">
              {result.orders.length} outstanding {result.orders.length === 1 ? "order" : "orders"}
            </h2>
            <p className="mt-1 text-sm text-foreground/80">
              This period-scoped list is retrieved from the same authoritative blocker predicate
              used by financial finalization.
            </p>
          </div>

          {result.orders.map(({ order, reasons, snapshotMenuItems }) => {
            const reasonLabels = [
              reasons.pendingDelivery ? "Delivery confirmation pending" : null,
              reasons.openIssue ? "Open delivery issue" : null,
              reasons.financialHold ? "Employee charge is on hold" : null,
            ].filter((reason): reason is string => reason !== null);

            return (
              <div key={order.id} className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {order.providerName}
                </h3>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <p className="font-semibold">Why this order blocks finalization</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {reasonLabels.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <OperationalOrderCard
                  order={order}
                  canReconcile={canReconcile}
                  returnTo={returnTo}
                  snapshotMenuItems={snapshotMenuItems}
                />
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

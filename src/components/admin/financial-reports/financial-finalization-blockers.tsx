import { formatHumanDate } from "@/lib/format";
import {
  getDeliveryIssueLabel,
  getDeliveryResolutionLabel,
} from "@/lib/delivery-reconciliation";
import type {
  FinancialFinalizationBlocker,
  FinancialFinalizationBlockerSummary,
  FinalizationBlockerCategory,
} from "@/lib/lunch-period-finalization-blockers";

const CATEGORY_LABELS: Record<FinalizationBlockerCategory, string> = {
  pending_delivery: "Pending delivery",
  open_issue: "Open issue",
  financial_hold: "Financial hold",
};

function blockerReasons(blocker: FinancialFinalizationBlocker): string[] {
  const reasons: string[] = [];
  if (blocker.reasons.pendingDelivery) reasons.push("Delivery confirmation pending");
  if (blocker.reasons.openIssue) {
    reasons.push(`Open delivery issue: ${getDeliveryIssueLabel(blocker.deliveryIssueType)}`);
  }
  if (blocker.reasons.financialHold) reasons.push("Employee charge is on hold");
  if (blocker.deliveryResolutionType) {
    reasons.push(`Resolution plan: ${getDeliveryResolutionLabel(blocker.deliveryResolutionType)}`);
  }
  return reasons;
}

export function FinancialFinalizationBlockers({
  summary,
}: {
  summary: FinancialFinalizationBlockerSummary;
}) {
  if (summary.counts.total === 0) {
    return null;
  }

  return (
    <section aria-labelledby="financial-finalization-blockers-heading" className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["Outstanding orders", summary.counts.total],
            ["Pending delivery", summary.counts.pending_delivery],
            ["Open issue", summary.counts.open_issue],
            ["Financial hold", summary.counts.financial_hold],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <h3 id="financial-finalization-blockers-heading" className="text-lg font-semibold">
          Orders HR must reconcile
        </h3>
        <p className="mt-1 text-sm text-muted">
          HR must resolve every order below before Accounts can finalize this period.
          This list is current each time the report loads.
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide text-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5">Employee</th>
              <th scope="col" className="px-3 py-2.5">Provider</th>
              <th scope="col" className="px-3 py-2.5">Delivery date</th>
              <th scope="col" className="px-3 py-2.5">Location</th>
              <th scope="col" className="px-3 py-2.5">Primary blocker</th>
              <th scope="col" className="px-3 py-2.5">Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {summary.blockers.map((blocker) => (
              <tr key={blocker.orderId}>
                <td className="px-3 py-3 font-medium text-foreground">
                  {blocker.employeeName}
                </td>
                <td className="px-3 py-3">{blocker.providerName}</td>
                <td className="px-3 py-3">{formatHumanDate(blocker.deliveryDate)}</td>
                <td className="px-3 py-3">{blocker.officeLocationName}</td>
                <td className="px-3 py-3">{CATEGORY_LABELS[blocker.category]}</td>
                <td className="px-3 py-3">
                  <ul className="space-y-1">
                    {blockerReasons(blocker).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

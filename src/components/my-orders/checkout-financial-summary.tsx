import { formatCurrency, formatDeadline } from "@/lib/format";
import {
  getOrderFinancialStatusLabel,
  isFinanciallyChargeableOrder,
  type DeliveryDateOrderGroup,
} from "@/lib/staff-my-orders";

type Props = {
  deliveryGroup: DeliveryDateOrderGroup;
};

const providerMarkers = ["bg-teal-700", "bg-indigo-700", "bg-amber-600", "bg-sky-700"];

export function CheckoutFinancialSummary({ deliveryGroup }: Props) {
  return (
    <aside
      className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-4"
      aria-label={`${deliveryGroup.payLabel} summary for this delivery date`}
      data-testid="checkout-financial-summary"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {deliveryGroup.payLabel}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-staff-teal-strong">
        {formatCurrency(deliveryGroup.youPay)}
      </p>
      <p className="mt-2 text-sm text-muted">
        {deliveryGroup.orderCount} {deliveryGroup.orderCount === 1 ? "order" : "orders"} from{" "}
        {deliveryGroup.providerCount} {deliveryGroup.providerCount === 1 ? "provider" : "providers"}
      </p>
      <ul className="mt-5 space-y-2.5" aria-label="Provider order totals">
        {deliveryGroup.financialProviderOrders.map((order, index) => (
          <li key={order.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-start gap-2 text-muted">
              <span
                className={`mt-1 size-2.5 shrink-0 rounded-sm ${providerMarkers[index % providerMarkers.length]}`}
                aria-hidden
              />
              <span className="min-w-0 break-words">
                {order.providerName}
                <span className="sr-only">
                  , order {order.indexInGroup} of {order.groupOrderCount}, ordered{" "}
                  {formatDeadline(order.createdAt)}
                </span>
              </span>
            </span>
            {isFinanciallyChargeableOrder(order) ? (
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {formatCurrency(order.orderTotal)}
              </span>
            ) : (
              <span className="min-w-0 max-w-[58%] text-right">
                <span className="block break-words font-semibold text-muted">
                  {getOrderFinancialStatusLabel(order)}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-muted">
                  Original value {formatCurrency(order.orderTotal)}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>

      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
        {deliveryGroup.originalSubtotal !== deliveryGroup.chargeableSubtotal ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Original order value</dt>
            <dd className="font-medium tabular-nums text-muted">
              {formatCurrency(deliveryGroup.originalSubtotal)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">
            {deliveryGroup.originalSubtotal === deliveryGroup.chargeableSubtotal
              ? "Subtotal"
              : "Chargeable subtotal"}
          </dt>
          <dd className="font-medium tabular-nums text-foreground">
            {formatCurrency(deliveryGroup.chargeableSubtotal)}
          </dd>
        </div>
        {deliveryGroup.chargeableSubtotal > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Lunch subsidy</dt>
            <dd className="font-medium tabular-nums text-muted">
              {deliveryGroup.lunchSubsidy > 0
                ? `-${formatCurrency(deliveryGroup.lunchSubsidy)}`
                : formatCurrency(0)}
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

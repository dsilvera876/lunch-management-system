import { formatCurrency } from "@/lib/format";
import {
  getOrderFinancialStatusLabel,
  isFinanciallyChargeableOrder,
  type GroupedCheckout,
} from "@/lib/staff-my-orders";

type Props = {
  checkout: GroupedCheckout;
};

const providerMarkers = ["bg-teal-700", "bg-indigo-700", "bg-amber-600", "bg-sky-700"];

export function CheckoutFinancialSummary({ checkout }: Props) {
  return (
    <aside
      className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:sticky lg:top-4"
      aria-label={`${checkout.payLabel} summary`}
      data-testid="checkout-financial-summary"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {checkout.payLabel}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-staff-teal-strong">
        {formatCurrency(checkout.youPay)}
      </p>
      <p className="mt-2 text-sm text-muted">
        {checkout.orderCount} {checkout.orderCount === 1 ? "order" : "orders"} from{" "}
        {checkout.providerCount} {checkout.providerCount === 1 ? "provider" : "providers"}
      </p>

      <ul className="mt-5 space-y-2.5" aria-label="Provider order totals">
        {checkout.providerOrders.map((order, index) => (
          <li key={order.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-start gap-2 text-muted">
              <span
                className={`mt-1 size-2.5 shrink-0 rounded-sm ${providerMarkers[index % providerMarkers.length]}`}
                aria-hidden
              />
              <span className="min-w-0 break-words">
                {order.providerName}
                {checkout.providerOrders.length > 1 ? (
                  <span className="sr-only">, order {order.indexInGroup}</span>
                ) : null}
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
        {checkout.originalSubtotal !== checkout.chargeableSubtotal ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Original order value</dt>
            <dd className="font-medium tabular-nums text-muted">
              {formatCurrency(checkout.originalSubtotal)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">
            {checkout.originalSubtotal === checkout.chargeableSubtotal
              ? "Subtotal"
              : "Chargeable subtotal"}
          </dt>
          <dd className="font-medium tabular-nums text-foreground">
            {formatCurrency(checkout.chargeableSubtotal)}
          </dd>
        </div>
        {checkout.chargeableSubtotal > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Lunch subsidy</dt>
            <dd className="font-medium tabular-nums text-muted">
              {checkout.lunchSubsidy > 0
                ? `-${formatCurrency(checkout.lunchSubsidy)}`
                : formatCurrency(0)}
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

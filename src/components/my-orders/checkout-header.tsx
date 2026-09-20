import { formatCurrency, formatDeadline, formatHumanDate } from "@/lib/format";
import type { GroupedCheckout } from "@/lib/staff-my-orders";
import { CheckoutStatusBadge } from "@/components/my-orders/checkout-status-badge";
import { NavIcon } from "@/components/icons/line-icons";

type Props = {
  checkout: GroupedCheckout;
  expanded?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
};

export function CheckoutHeader({
  checkout,
  expanded = true,
  onToggle,
  collapsible = false,
}: Props) {
  const orderCountLabel = `${checkout.orderCount} ${checkout.orderCount === 1 ? "order" : "orders"}`;
  const providerCountLabel = `${checkout.providerCount} ${checkout.providerCount === 1 ? "provider" : "providers"}`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <NavIcon id="calendar" size={18} />
          </span>
          <h3 className="text-lg font-semibold text-slate-900 sm:text-xl">
            {formatHumanDate(checkout.deliveryDate)}
          </h3>
          <CheckoutStatusBadge
            label={checkout.checkoutStatusLabel}
            kind={checkout.checkoutStatusKind}
          />
        </div>
        <p className="mt-2 text-sm text-muted">
          Ordered {formatDeadline(checkout.placedAt)}
          {checkout.officeLocationName
            ? ` · Delivery to ${checkout.officeLocationName}`
            : ""}
        </p>
        {checkout.deliveredAt ? (
          <p className="mt-1 text-sm text-muted">
            Delivered {formatDeadline(checkout.deliveredAt)}
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-3">
        <div className="text-right text-sm">
          <p className="text-muted">
            {orderCountLabel} from {providerCountLabel}
          </p>
          <p className="mt-1 font-semibold tabular-nums text-slate-900">
            Total: {formatCurrency(checkout.subtotal)}
          </p>
        </div>
        {collapsible && onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-foreground"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

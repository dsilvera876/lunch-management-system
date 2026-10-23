import { formatHumanDate } from "@/lib/format";
import type { DeliveryDateOrderGroup } from "@/lib/staff-my-orders";
import { CheckoutStatusBadge } from "@/components/my-orders/checkout-status-badge";
import { NavIcon } from "@/components/icons/line-icons";

type Props = {
  deliveryGroup: DeliveryDateOrderGroup;
  expanded?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  headingId?: string;
  detailsId?: string;
};

export function CheckoutHeader({
  deliveryGroup,
  expanded = true,
  onToggle,
  collapsible = false,
  headingId,
  detailsId,
}: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-staff-teal"
            aria-hidden
          >
            <NavIcon id="calendar" size={18} />
          </span>
          <h3 id={headingId} className="text-lg font-semibold text-slate-900 sm:text-xl">
            {formatHumanDate(deliveryGroup.deliveryDate)}
          </h3>
          <CheckoutStatusBadge
            label={deliveryGroup.checkoutStatusLabel}
            kind={deliveryGroup.checkoutStatusKind}
          />
        </div>
      </div>

      <div className="flex items-start gap-3">
        {collapsible && onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? "Collapse orders for this delivery date" : "Expand orders for this delivery date"}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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

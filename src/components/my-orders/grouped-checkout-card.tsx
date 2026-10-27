"use client";

import { useEffect, useRef, useState } from "react";
import { formatDeadline } from "@/lib/format";
import type { DeliveryDateOrderGroup } from "@/lib/staff-my-orders";
import { CheckoutHeader } from "@/components/my-orders/checkout-header";
import { ProviderOrderSection } from "@/components/my-orders/provider-order-section";
import { CheckoutFinancialSummary } from "@/components/my-orders/checkout-financial-summary";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";

type Props = {
  deliveryGroup: DeliveryDateOrderGroup;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  showFinancialSummary?: boolean;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
  highlightedOrderGroupId?: string | null;
};

export function GroupedCheckoutCard({
  deliveryGroup,
  defaultExpanded = true,
  collapsible = false,
  showFinancialSummary = true,
  ratingSummaries,
  ratingsLoadFailed,
  highlightedOrderGroupId = null,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const containsHighlightedCheckout = deliveryGroup.checkouts.some(
    (checkout) => checkout.orderGroupId === highlightedOrderGroupId,
  );
  const [showNewOrderHighlight, setShowNewOrderHighlight] = useState(
    containsHighlightedCheckout,
  );
  const highlightedCheckoutRef = useRef<HTMLElement>(null);
  const headingId = `delivery-date-heading-${deliveryGroup.deliveryDate}`;
  const detailsId = `delivery-date-details-${deliveryGroup.deliveryDate}`;

  useEffect(() => {
    if (!containsHighlightedCheckout) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      highlightedCheckoutRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    });
    const timeout = window.setTimeout(() => setShowNewOrderHighlight(false), 2_500);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [containsHighlightedCheckout]);

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4"
      data-testid="delivery-date-group"
    >
      <CheckoutHeader
        deliveryGroup={deliveryGroup}
        expanded={expanded}
        collapsible={collapsible}
        onToggle={() => setExpanded((value) => !value)}
        headingId={headingId}
        detailsId={detailsId}
      />

      {expanded ? (
        <div id={detailsId} className="space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)]">
            <div className="min-w-0 space-y-4" data-testid="provider-order-list">
              {deliveryGroup.checkouts.map((checkout, checkoutIndex) => (
                <section
                  key={checkout.orderGroupId}
                  ref={
                    checkout.orderGroupId === highlightedOrderGroupId
                      ? highlightedCheckoutRef
                      : undefined
                  }
                  aria-label={`Checkout ${checkoutIndex + 1} of ${deliveryGroup.checkouts.length}, ordered ${formatDeadline(checkout.placedAt)}, with ${checkout.orderCount} ${checkout.orderCount === 1 ? "order" : "orders"}`}
                  className="space-y-4"
                  data-testid="checkout-subgroup"
                  data-checkout-id={checkout.orderGroupId}
                >
                  {checkout.orderGroupId === highlightedOrderGroupId && showNewOrderHighlight ? (
                    <p className="sr-only" role="status">
                      Your newly placed order is shown below.
                    </p>
                  ) : null}
                  {checkout.providerOrders.map((order) => (
                    <ProviderOrderSection
                      key={order.id}
                      order={order}
                      checkoutMetadata={{
                        placedAt: checkout.placedAt,
                        officeLocationName: checkout.officeLocationName,
                        cancellationSummary: checkout.cancellationSummary,
                      }}
                      ratingSummaries={ratingSummaries}
                      ratingsLoadFailed={ratingsLoadFailed}
                      highlighted={
                        checkout.orderGroupId === highlightedOrderGroupId &&
                        showNewOrderHighlight
                      }
                    />
                  ))}
                </section>
              ))}
            </div>

            {showFinancialSummary ? (
              <CheckoutFinancialSummary deliveryGroup={deliveryGroup} />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
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
};

export function GroupedCheckoutCard({
  deliveryGroup,
  defaultExpanded = true,
  collapsible = false,
  showFinancialSummary = true,
  ratingSummaries,
  ratingsLoadFailed,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const headingId = `delivery-date-heading-${deliveryGroup.deliveryDate}`;
  const detailsId = `delivery-date-details-${deliveryGroup.deliveryDate}`;

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
              {deliveryGroup.checkouts.map((checkout) => (
                <section
                  key={checkout.orderGroupId}
                  aria-label={`Checkout ordered ${formatDeadline(checkout.placedAt)}`}
                  className="space-y-3"
                  data-testid="checkout-subgroup"
                  data-checkout-id={checkout.orderGroupId}
                >
                  <p className="text-sm text-slate-700">
                    Ordered {formatDeadline(checkout.placedAt)}
                    {checkout.officeLocationName
                      ? ` · Delivery to ${checkout.officeLocationName}`
                      : ""}
                  </p>
                  {checkout.deliveredAt ? (
                    <p className="-mt-2 text-sm text-slate-700">
                      Delivered {formatDeadline(checkout.deliveredAt)}
                    </p>
                  ) : null}
                  {checkout.providerOrders.map((order) => (
                    <ProviderOrderSection
                      key={order.id}
                      order={order}
                      ratingSummaries={ratingSummaries}
                      ratingsLoadFailed={ratingsLoadFailed}
                    />
                  ))}
                  {checkout.cancellationSummary ? (
                    <footer className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">
                      <p>{checkout.cancellationSummary}</p>
                      {checkout.cancelledAt ? (
                        <p className="mt-1 text-xs">
                          Cancelled {formatDeadline(checkout.cancelledAt)}
                        </p>
                      ) : null}
                    </footer>
                  ) : null}
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

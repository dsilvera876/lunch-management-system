"use client";

import { useState } from "react";
import { formatDeadline } from "@/lib/format";
import type { GroupedCheckout } from "@/lib/staff-my-orders";
import { CheckoutHeader } from "@/components/my-orders/checkout-header";
import { ProviderOrderSection } from "@/components/my-orders/provider-order-section";
import { CheckoutFinancialSummary } from "@/components/my-orders/checkout-financial-summary";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";

type Props = {
  checkout: GroupedCheckout;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  showFinancialSummary?: boolean;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
};

export function GroupedCheckoutCard({
  checkout,
  defaultExpanded = true,
  collapsible = false,
  showFinancialSummary = true,
  ratingSummaries,
  ratingsLoadFailed,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const headingId = `checkout-heading-${checkout.orderGroupId}`;
  const detailsId = `checkout-details-${checkout.orderGroupId}`;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4"
      data-testid="checkout-group"
    >
      <CheckoutHeader
        checkout={checkout}
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
              {checkout.providerOrders.map((order) => (
                <ProviderOrderSection
                  key={order.id}
                  order={order}
                  ratingSummaries={ratingSummaries}
                  ratingsLoadFailed={ratingsLoadFailed}
                />
              ))}
            </div>

            {showFinancialSummary ? (
              <CheckoutFinancialSummary checkout={checkout} />
            ) : null}
          </div>

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
        </div>
      ) : null}
    </section>
  );
}

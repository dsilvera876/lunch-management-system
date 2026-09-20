"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { formatDeadline } from "@/lib/format";
import type { GroupedCheckout } from "@/lib/staff-my-orders";
import { CheckoutHeader } from "@/components/my-orders/checkout-header";
import { ProviderOrderSection } from "@/components/my-orders/provider-order-section";
import { CheckoutFinancialSummary } from "@/components/my-orders/checkout-financial-summary";

type Props = {
  checkout: GroupedCheckout;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  showFinancialSummary?: boolean;
  showViewLinks?: boolean;
};

export function GroupedCheckoutCard({
  checkout,
  defaultExpanded = true,
  collapsible = false,
  showFinancialSummary = true,
  showViewLinks = true,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card padding="md" className="shadow-sm">
      <CheckoutHeader
        checkout={checkout}
        expanded={expanded}
        collapsible={collapsible}
        onToggle={() => setExpanded((value) => !value)}
      />

      {expanded ? (
        <div className="mt-5 space-y-5">
          {checkout.providerOrders.map((order) => (
            <ProviderOrderSection
              key={order.id}
              order={order}
              showViewLink={showViewLinks}
            />
          ))}

          {showFinancialSummary ? (
            <CheckoutFinancialSummary checkout={checkout} />
          ) : null}

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
    </Card>
  );
}

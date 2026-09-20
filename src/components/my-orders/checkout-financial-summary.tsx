import { formatCurrency } from "@/lib/format";
import type { GroupedCheckout } from "@/lib/staff-my-orders";

type Props = {
  checkout: Pick<
    GroupedCheckout,
    "subtotal" | "lunchSubsidy" | "youPay" | "payLabel"
  >;
};

export function CheckoutFinancialSummary({ checkout }: Props) {
  if (checkout.subtotal <= 0) {
    return null;
  }

  return (
    <dl className="space-y-2 border-t border-border pt-4 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted">Subtotal</dt>
        <dd className="font-medium tabular-nums text-foreground">
          {formatCurrency(checkout.subtotal)}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-muted">Lunch Subsidy</dt>
        <dd className="font-medium tabular-nums text-muted">
          {checkout.lunchSubsidy > 0
            ? `-${formatCurrency(checkout.lunchSubsidy)}`
            : formatCurrency(0)}
        </dd>
      </div>
      <div className="flex justify-between gap-4 pt-1 text-base">
        <dt className="font-semibold text-slate-900">{checkout.payLabel}</dt>
        <dd className="font-semibold tabular-nums text-primary">
          {formatCurrency(checkout.youPay)}
        </dd>
      </div>
    </dl>
  );
}

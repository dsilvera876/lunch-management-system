import { formatCurrency } from "@/lib/format";
import {
  formatMenuItemLabel,
  formatOrderLineLabel,
} from "@/lib/menu-items";
import { formatMealBundleLabel } from "@/lib/order-payload";
import { calculateLineSubtotal, formatDisplayDate } from "@/lib/ordering-ui";

type MenuItem = {
  id: string;
  name: string;
  unitLabel: string;
  price: number | string;
};

type Props = {
  providerName: string;
  deliveryDate: string;
  mealQuantity: number;
  mealSubtotal: number;
  selectedMain: MenuItem | null;
  selectedSides: MenuItem[];
  selectedStandalone: Array<MenuItem & { quantity: number }>;
  specialInstructions: string;
  orderTotal: number;
  loading?: boolean;
  loadingLabel?: string;
};

export function LateOrderSummaryPanel({
  providerName,
  deliveryDate,
  mealQuantity,
  mealSubtotal,
  selectedMain,
  selectedSides,
  selectedStandalone,
  specialInstructions,
  orderTotal,
  loading = false,
  loadingLabel = "Loading menu…",
}: Props) {
  const showMealLines =
    !loading && selectedMain !== null && selectedSides.length > 0;
  const hasScrollableLines =
    !loading &&
    (showMealLines || selectedStandalone.length > 0 || specialInstructions.trim().length > 0);

  return (
    <div className="flex h-full min-h-[17rem] flex-col rounded-lg border border-border/80 bg-muted/20 p-3 sm:min-h-[18rem] sm:p-4">
      <h3 className="text-sm font-semibold text-slate-900">Order Summary</h3>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Provider</dt>
          <dd className="text-right font-medium">{providerName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Delivery</dt>
          <dd className="text-right font-medium">{formatDisplayDate(deliveryDate)}</dd>
        </div>
      </dl>

      <div
        className="mt-3 min-h-32 max-h-40 flex-1 overflow-y-auto border-t border-border/70 pt-3"
        aria-busy={loading || undefined}
      >
        {loading ? (
          <p className="text-sm text-muted">{loadingLabel}</p>
        ) : !hasScrollableLines ? (
          <p className="text-sm text-muted">Select items below to see your order summary.</p>
        ) : (
          <div className="space-y-3 text-sm">
            {showMealLines && selectedMain ? (
              <div>
                <div className="flex justify-between gap-4 font-semibold">
                  <span>{formatMealBundleLabel(mealQuantity)}</span>
                  <span>{formatCurrency(mealSubtotal)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-muted">
                  <li>{formatMenuItemLabel(selectedMain.name, selectedMain.unitLabel)}</li>
                  {selectedSides.map((item) => (
                    <li key={item.id}>{formatMenuItemLabel(item.name, item.unitLabel)}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedStandalone.length > 0 ? (
              <div>
                {showMealLines ? (
                  <div className="border-t border-border/50 pt-3" aria-hidden />
                ) : null}
                <ul className="space-y-2">
                  {selectedStandalone.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4">
                      <span>{formatOrderLineLabel(item.name, item.unitLabel, item.quantity)}</span>
                      <span className="shrink-0 font-medium">
                        {formatCurrency(calculateLineSubtotal(item.price, item.quantity))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {specialInstructions.trim().length > 0 ? (
              <div className="border-t border-border/50 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Special instructions
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-900">
                  {specialInstructions.trim()}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-3 flex shrink-0 justify-between gap-4 border-t border-border/70 pt-3 text-sm font-semibold">
        <span>Order total</span>
        <span>{loading ? "—" : formatCurrency(orderTotal)}</span>
      </div>
    </div>
  );
}

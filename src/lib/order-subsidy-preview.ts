/**
 * Mirrors daily subsidy allocation: one subsidy pool per order date (not per order).
 * Marginal subsidy for an additional order is the increase in min(gross, dailySubsidy).
 */
export function calculateMarginalOrderCheckout(params: {
  dailySubsidy: number;
  existingOrderDateGross: number;
  orderSubtotal: number;
}): {
  subtotal: number;
  lunchSubsidy: number;
  youPay: number;
} {
  const { dailySubsidy, existingOrderDateGross, orderSubtotal } = params;
  const subtotal = Math.max(0, orderSubtotal);

  if (subtotal === 0) {
    return { subtotal: 0, lunchSubsidy: 0, youPay: 0 };
  }

  const subsidyBefore = Math.min(
    Math.max(0, existingOrderDateGross),
    Math.max(0, dailySubsidy),
  );
  const grossAfter = Math.max(0, existingOrderDateGross) + subtotal;
  const subsidyAfter = Math.min(grossAfter, Math.max(0, dailySubsidy));
  const lunchSubsidy = subsidyAfter - subsidyBefore;
  const youPay = subtotal - lunchSubsidy;

  return {
    subtotal,
    lunchSubsidy,
    youPay: Math.max(0, youPay),
  };
}

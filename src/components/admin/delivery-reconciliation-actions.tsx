import {
  DELIVERY_ISSUE_TYPES,
  DELIVERY_RESOLUTION_TYPES,
  canManageOpenIssue,
  canMarkDelivered,
  canReportIssue,
  getDeliveryIssueLabel,
  getDeliveryResolutionLabel,
  getOperationalDisplayState,
} from "@/lib/delivery-reconciliation";
import type { OperationalOrder } from "@/lib/operational-orders";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { selectClassName, textareaClassName } from "@/components/ui/form-field";
import {
  adjustOperationalOrderItems,
  confirmOrderDeliveryResolved,
  markOrderDelivered,
  reportOrderDeliveryIssue,
  resolveOrderNoCharge,
  updateOrderDeliveryResolution,
  updateOrderHrDeliveryNotes,
} from "@/app/admin/orders/reconciliation-actions";
import { getJamaicaTodayDate } from "@/lib/datetime";

export type SnapshotMenuItem = {
  id: string;
  name: string;
  itemType: string;
  unitLabel: string;
  price: number;
};

type Props = {
  order: OperationalOrder;
  returnTo: string;
  canReconcile: boolean;
  snapshotMenuItems?: SnapshotMenuItem[];
};

function ReconciliationBadge({ order }: { order: OperationalOrder }) {
  const label = getOperationalDisplayState(order);
  const tone =
    order.status === "cancelled"
      ? "bg-slate-100 text-slate-700 ring-slate-200"
      : order.deliveryState === "issue_open"
        ? "bg-rose-50 text-rose-800 ring-rose-200"
        : order.deliveryState === "delivered"
          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
          : order.deliveryState === "resolved" && order.financialDisposition === "waived"
            ? "bg-slate-100 text-slate-700 ring-slate-200"
            : order.deliveryState === "resolved"
              ? "bg-teal-50 text-teal-800 ring-teal-200"
              : "bg-blue-50 text-blue-800 ring-blue-200";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {label}
    </span>
  );
}

function IssueContext({ order }: { order: OperationalOrder }) {
  if (order.deliveryState !== "issue_open" && order.deliveryState !== "resolved") {
    return null;
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-950">
      {order.deliveryIssueType && (
        <p>
          <span className="font-semibold">Issue:</span>{" "}
          {getDeliveryIssueLabel(order.deliveryIssueType)}
        </p>
      )}
      {order.deliveryResolutionType && (
        <p className="mt-1">
          <span className="font-semibold">Resolution plan:</span>{" "}
          {getDeliveryResolutionLabel(order.deliveryResolutionType)}
        </p>
      )}
      {order.financialDisposition === "on_hold" && (
        <p className="mt-1 font-medium">Charge on hold</p>
      )}
      {order.financialDisposition === "waived" && (
        <p className="mt-1 font-medium">No charge</p>
      )}
    </div>
  );
}

function AdjustmentForm({
  order,
  returnTo,
  snapshotMenuItems,
}: {
  order: OperationalOrder;
  returnTo: string;
  snapshotMenuItems: SnapshotMenuItem[];
}) {
  const mains = snapshotMenuItems.filter((item) => item.itemType === "main");
  const sides = snapshotMenuItems.filter((item) => item.itemType === "side");
  const standalone = snapshotMenuItems.filter((item) => item.itemType === "standalone");
  const currentMain = order.items.find((item) => item.itemType === "main");
  const currentSides = order.items.filter((item) => item.itemType === "side");
  const currentStandalone = order.items.filter((item) => item.itemType === "standalone");

  return (
    <details className="rounded-lg border border-border bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Adjust delivered items</summary>
      <form action={adjustOperationalOrderItems} className="mt-3 space-y-3">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        {order.mealQuantity && (
          <input type="hidden" name="mealQuantity" value={String(order.mealQuantity)} />
        )}

        {order.mealQuantity && mains.length > 0 && (
          <label className="block text-sm">
            <span className="font-medium">Main substitute</span>
            <select
              name="mainMenuItemId"
              defaultValue={currentMain ? mains.find((m) => m.name === currentMain.name)?.id ?? "" : ""}
              className={`${selectClassName} mt-1`}
            >
              {mains.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {order.mealQuantity && sides.length > 0 && (
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Sides</legend>
            {sides.map((item) => (
              <label key={item.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name={`side:${item.id}`}
                  value="on"
                  defaultChecked={currentSides.some((side) => side.name === item.name)}
                />
                {item.name}
              </label>
            ))}
          </fieldset>
        )}

        {standalone.length > 0 && (
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Standalone items</legend>
            {standalone.map((item) => {
              const current = currentStandalone.find((entry) => entry.name === item.name);
              return (
                <label key={item.id} className="flex items-center justify-between gap-3">
                  <span>{item.name}</span>
                  <input
                    type="number"
                    name={`quantity:${item.id}`}
                    min={0}
                    defaultValue={current?.quantity ?? 0}
                    className="w-20 rounded-md border border-border px-2 py-1"
                  />
                </label>
              );
            })}
          </fieldset>
        )}

        <label className="block text-sm">
          <span className="font-medium">Reason</span>
          <input type="text" name="reason" className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>

        <FormSubmitButton pendingText="Saving..." variant="secondary">
          Save adjustment
        </FormSubmitButton>
      </form>
    </details>
  );
}

export function DeliveryReconciliationActions({
  order,
  returnTo,
  canReconcile,
  snapshotMenuItems = [],
}: Props) {
  if (!canReconcile || order.status === "cancelled") {
    return null;
  }

  const today = getJamaicaTodayDate();

  return (
    <div className="space-y-3 print:hidden">
      <IssueContext order={order} />

      {order.hrDeliveryNotes?.trim() && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold">HR notes</p>
          <p className="mt-1 whitespace-pre-wrap">{order.hrDeliveryNotes}</p>
        </div>
      )}

      {canMarkDelivered(order) && (
        <form action={markOrderDelivered} className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="actualDeliveryDate" value={today} />
          <FormSubmitButton
            pendingText="Saving..."
            confirmMessage="Mark this order as delivered?"
            variant="primary"
            className="w-full sm:w-auto"
          >
            Delivered
          </FormSubmitButton>
        </form>
      )}

      {canReportIssue(order) && order.deliveryState !== "issue_open" && (
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">Report issue</summary>
          <form action={reportOrderDeliveryIssue} className="mt-3 space-y-3">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="block text-sm">
              <span className="font-medium">Issue type</span>
              <select name="issueType" required className={`${selectClassName} mt-1`}>
                {DELIVERY_ISSUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getDeliveryIssueLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Resolution plan (optional)</span>
              <select name="resolutionType" className={`${selectClassName} mt-1`}>
                <option value="">Select later</option>
                {DELIVERY_RESOLUTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getDeliveryResolutionLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">HR notes</span>
              <textarea name="hrNotes" rows={3} className={`${textareaClassName} mt-1`} />
            </label>
            <FormSubmitButton pendingText="Saving..." variant="secondary">
              Report issue
            </FormSubmitButton>
          </form>
        </details>
      )}

      {canManageOpenIssue(order.deliveryState) && (
        <div className="space-y-3 rounded-lg border border-rose-200 bg-white p-3">
          <p className="text-sm font-semibold text-rose-900">Open issue actions</p>

          <form action={updateOrderDeliveryResolution} className="space-y-2">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="block text-sm">
              <span className="font-medium">Update resolution</span>
              <select
                name="resolutionType"
                defaultValue={order.deliveryResolutionType ?? ""}
                required
                className={`${selectClassName} mt-1`}
              >
                {DELIVERY_RESOLUTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getDeliveryResolutionLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">HR notes</span>
              <textarea
                name="hrNotes"
                rows={2}
                defaultValue={order.hrDeliveryNotes ?? ""}
                className={`${textareaClassName} mt-1`}
              />
            </label>
            <Button type="submit" variant="secondary">
              Save resolution
            </Button>
          </form>

          <form action={updateOrderHrDeliveryNotes} className="space-y-2">
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="block text-sm">
              <span className="font-medium">Notes only</span>
              <textarea
                name="hrNotes"
                rows={2}
                defaultValue={order.hrDeliveryNotes ?? ""}
                className={`${textareaClassName} mt-1`}
              />
            </label>
            <Button type="submit" variant="ghost">
              Update notes
            </Button>
          </form>

          {snapshotMenuItems.length > 0 && (
            <AdjustmentForm
              order={order}
              returnTo={returnTo}
              snapshotMenuItems={snapshotMenuItems}
            />
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <form action={confirmOrderDeliveryResolved} className="flex-1">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="actualDeliveryDate" value={today} />
              <FormSubmitButton
                pendingText="Saving..."
                confirmMessage="Confirm this order was delivered/replaced?"
                variant="primary"
                className="w-full"
              >
                Confirm delivered
              </FormSubmitButton>
            </form>

            <form action={resolveOrderNoCharge} className="flex-1">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <FormSubmitButton
                pendingText="Saving..."
                confirmMessage="Resolve this order with no charge?"
                variant="secondary"
                className="w-full"
              >
                Resolve no charge
              </FormSubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export { ReconciliationBadge };

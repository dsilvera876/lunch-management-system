"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  formatTodaysOrderDetailLines,
  formatTodaysOrderDisplayDate,
} from "@/lib/todays-orders-presentation";
import type { OperationalOrder } from "@/lib/operational-orders";
import { TodaysOrderStatusBadge } from "@/components/admin/todays-orders/todays-order-status-badge";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { TodaysEmployeeOrderRowActions } from "@/components/admin/todays-orders/todays-employee-order-row-actions";

type Row = OperationalOrder & { officeName: string };

type Props = {
  orders: Row[];
  showLocation: boolean;
  canMutateHr: boolean;
  primaryDispatchLocksByProvider: Record<string, boolean>;
};

export function TodaysEmployeeOrdersTable({
  orders,
  showLocation,
  canMutateHr,
  primaryDispatchLocksByProvider,
}: Props) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  function handleSuccess(message: string) {
    setSuccessMessage(message);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {successMessage ? (
        <FormActionStatus variant="success">{successMessage}</FormActionStatus>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium text-muted">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Order Details</th>
              {showLocation ? <th className="px-3 py-2">Location</th> : null}
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Order Date</th>
              <th className="px-3 py-2">Delivery Date</th>
              {canMutateHr ? <th className="px-3 py-2">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const detailLines = formatTodaysOrderDetailLines(order);
              const primaryDispatchLocksOrders =
                primaryDispatchLocksByProvider[order.providerId] ?? false;

              return (
                <tr key={order.id} className="border-b border-border/70 align-top">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{order.employeeName}</td>
                  <td className="px-3 py-2.5 text-slate-800">
                    <ul className="space-y-0.5">
                      {detailLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {order.specialInstructions?.trim() ? (
                      <p className="mt-1 text-xs text-muted">
                        Note: {order.specialInstructions.trim()}
                      </p>
                    ) : null}
                  </td>
                  {showLocation ? (
                    <td className="px-3 py-2.5 text-muted">{order.officeName}</td>
                  ) : null}
                  <td className="px-3 py-2.5">
                    <TodaysOrderStatusBadge order={order} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                    {formatTodaysOrderDisplayDate(order.orderDate)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                    {formatTodaysOrderDisplayDate(order.deliveryDate)}
                  </td>
                  {canMutateHr ? (
                    <td className="px-3 py-2.5">
                      <TodaysEmployeeOrderRowActions
                        order={order}
                        canMutateHr={canMutateHr}
                        primaryDispatchLocksOrders={primaryDispatchLocksOrders}
                        onSuccess={handleSuccess}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

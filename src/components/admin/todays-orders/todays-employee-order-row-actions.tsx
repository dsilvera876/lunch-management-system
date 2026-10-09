"use client";

import { useRef, useState } from "react";
import type { OperationalOrder } from "@/lib/operational-orders";
import { canHrMutateTodaysOrder } from "@/lib/hr-todays-order-mutation";
import { Button } from "@/components/ui/button";
import { HrTodaysOrderEditModal } from "@/components/admin/todays-orders/hr-todays-order-edit-modal";
import { HrTodaysOrderCancelModal } from "@/components/admin/todays-orders/hr-todays-order-cancel-modal";

type Props = {
  order: OperationalOrder;
  canMutateHr: boolean;
  primaryDispatchLocksOrders: boolean;
  onSuccess: (message: string) => void;
};

export function TodaysEmployeeOrderRowActions({
  order,
  canMutateHr,
  primaryDispatchLocksOrders,
  onSuccess,
}: Props) {
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelTriggerRef = useRef<HTMLButtonElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (
    !canHrMutateTodaysOrder({
      order,
      canMutateHr,
      primaryDispatchLocksOrders,
    })
  ) {
    return <span className="text-xs text-muted">—</span>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="min-h-8 px-3 py-1.5 text-xs"
          ref={editTriggerRef}
          onClick={() => setEditOpen(true)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="danger"
          className="min-h-8 px-3 py-1.5 text-xs"
          ref={cancelTriggerRef}
          onClick={() => setCancelOpen(true)}
        >
          Cancel
        </Button>
      </div>

      <HrTodaysOrderEditModal
        open={editOpen}
        triggerRef={editTriggerRef}
        order={order}
        onOpenChange={setEditOpen}
        onSuccess={onSuccess}
      />

      <HrTodaysOrderCancelModal
        open={cancelOpen}
        triggerRef={cancelTriggerRef}
        order={order}
        onOpenChange={setCancelOpen}
        onSuccess={onSuccess}
      />
    </>
  );
}

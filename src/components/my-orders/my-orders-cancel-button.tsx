"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelLunchOrderFromMyOrders } from "@/app/lunch/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const SUCCESS_MESSAGE =
  "Order cancelled successfully. Your other orders were not affected.";

type Props = {
  orderId: string;
  providerName: string;
  orderPosition: number;
  checkoutOrderCount: number;
};

export function MyOrdersCancelButton({
  orderId,
  providerName,
  orderPosition,
  checkoutOrderCount,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleCancel() {
    if (inFlightRef.current) {
      return;
    }

    const confirmed = window.confirm(
      `Cancel order ${orderPosition} of ${checkoutOrderCount} from ${providerName}? Your other orders for this delivery date will not be affected.`,
    );
    if (!confirmed) {
      return;
    }

    inFlightRef.current = true;
    setPending(true);

    try {
      const result = await cancelLunchOrderFromMyOrders(orderId);
      if (!mountedRef.current) {
        return;
      }

      if (!result.ok) {
        showToast({ title: result.message, variant: "error" });
        inFlightRef.current = false;
        setPending(false);
        router.refresh();
        return;
      }

      showToast({ title: SUCCESS_MESSAGE, variant: "success" });
      document.getElementById("my-orders-tab-upcoming")?.focus({ preventScroll: true });
      router.refresh();
    } catch {
      if (!mountedRef.current) {
        return;
      }
      showToast({
        title: "Unable to cancel this order. Please try again.",
        variant: "error",
      });
      inFlightRef.current = false;
      setPending(false);
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      aria-busy={pending ? true : undefined}
      data-testid="my-orders-cancel-button"
      className="min-h-10 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 hover:border-red-400 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      onClick={handleCancel}
    >
      <span>{pending ? "Cancelling..." : "Cancel order"}</span>
      <span className="sr-only"> from {providerName}</span>
    </Button>
  );
}

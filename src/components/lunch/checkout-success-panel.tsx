"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { IconCheck } from "@/components/icons/line-icons";
import { CHECKOUT_SUCCESS_TITLE } from "@/lib/lunch-checkout-accessibility";

type Props = {
  body: string;
  orderGroupId: string;
  /** Changes on each successful checkout so focus moves to the new confirmation. */
  focusKey: number;
};

export function CheckoutSuccessPanel({ body, orderGroupId, focusKey }: Props) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusKey]);

  return (
    <section
      aria-labelledby={headingId}
      data-checkout-success
      className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
    >
      <div className="flex items-start gap-3">
        <IconCheck size={20} className="mt-0.5 shrink-0 text-emerald-800" aria-hidden />
        <div className="min-w-0">
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm text-base font-semibold text-emerald-950 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {CHECKOUT_SUCCESS_TITLE}
          </h2>
          <p className="mt-1 text-sm text-emerald-950">{body}</p>
          <Link
            href={`/my-orders?checkout=${encodeURIComponent(orderGroupId)}`}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-primary/40 bg-white px-3 py-1.5 text-sm font-semibold text-staff-teal-strong no-underline transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            View My Orders
          </Link>
        </div>
      </div>
    </section>
  );
}

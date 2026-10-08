"use client";

import Link from "next/link";
import type { StaffLateOrderTodayContext } from "@/lib/staff-late-order-today";
import {
  staffLateOrderActionKind,
  staffLateOrderActionLabel,
  type StaffLateOrderNewRequestSummary,
} from "@/lib/staff-late-order-today";
import { MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF } from "@/lib/staff-late-order-submissions";
import { linkButtonClass } from "@/components/ui/button";
import { StaffLateOrderDrawerTrigger } from "@/components/lunch/staff-late-order-drawer";

type Props = {
  context: StaffLateOrderTodayContext;
  jamaicaToday: string;
  newLateOrderOpportunity: boolean;
  summary: StaffLateOrderNewRequestSummary;
};

export function StaffLateOrderHeaderAction({
  context,
  jamaicaToday,
  newLateOrderOpportunity,
  summary,
}: Props) {
  const kind = staffLateOrderActionKind(context, { newLateOrderOpportunity });
  const label = staffLateOrderActionLabel(context, jamaicaToday, {
    newLateOrderOpportunity,
    summary,
  });

  if (!kind || !label) {
    return null;
  }

  if (kind === "status") {
    return (
      <Link href={MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF} className={linkButtonClass("secondary")}>
        {label}
      </Link>
    );
  }

  return <StaffLateOrderDrawerTrigger />;
}

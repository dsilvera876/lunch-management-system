"use client";

import type { ReactNode } from "react";
import { MyOrdersTabs } from "@/components/my-orders/my-orders-tabs";
import type { MyOrdersTab } from "@/lib/staff-my-orders";

type Props = {
  activeTab: MyOrdersTab;
  onTabChange: (tab: MyOrdersTab) => void;
  pastDatePicker?: ReactNode;
};

export function MyOrdersToolbar({ activeTab, onTabChange, pastDatePicker }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <MyOrdersTabs activeTab={activeTab} onTabChange={onTabChange} />
      {pastDatePicker ? (
        <div className="w-full shrink-0 sm:w-auto sm:self-center">{pastDatePicker}</div>
      ) : null}
    </div>
  );
}

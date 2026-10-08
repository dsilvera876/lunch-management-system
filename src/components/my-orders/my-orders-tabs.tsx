"use client";

import {
  IconCalendar,
  IconCircleX,
  IconClipboard,
  IconHistory,
} from "@/components/icons/line-icons";
import { MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB } from "@/lib/staff-late-order-submissions";
import type { MyOrdersTab } from "@/lib/staff-my-orders";
import { useAccessibleTablist } from "@/hooks/use-accessible-tablist";
import { MY_ORDERS_TABPANEL_ID } from "@/lib/accessible-tabs";

const TABS: Array<{
  id: MyOrdersTab;
  label: string;
  Icon: typeof IconCalendar;
}> = [
  { id: "upcoming", label: "Upcoming", Icon: IconCalendar },
  { id: "past", label: "Past Orders", Icon: IconHistory },
  { id: "cancelled", label: "Cancelled", Icon: IconCircleX },
  {
    id: MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB,
    label: "Late order submissions",
    Icon: IconClipboard,
  },
];

type Props = {
  activeTab: MyOrdersTab;
  onTabChange: (tab: MyOrdersTab) => void;
};

export function MyOrdersTabs({ activeTab, onTabChange }: Props) {
  const tabIds = TABS.map((tab) => tab.id);
  const { tabProps } = useAccessibleTablist({
    tabIds,
    selectedId: activeTab,
    onSelect: onTabChange,
  });

  return (
    <div
      role="tablist"
      aria-label="My Orders views"
      className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-sm [-ms-overflow-style:none] [scrollbar-width:thin]"
    >
      {TABS.map((tab) => {
        const selected = tab.id === activeTab;
        const TabIcon = tab.Icon;
        const props = tabProps(tab.id);

        return (
          <button
            key={tab.id}
            type="button"
            id={`my-orders-tab-${tab.id}`}
            aria-controls={MY_ORDERS_TABPANEL_ID}
            onClick={() => onTabChange(tab.id)}
            className={`relative inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors first:rounded-tl-xl last:rounded-tr-xl ${
              selected
                ? "staff-tab-selected border-primary text-slate-900"
                : "border-transparent text-staff-instruction hover:text-foreground"
            }`}
            {...props}
          >
            <TabIcon
              size={18}
              className={selected ? "text-staff-teal" : "text-staff-instruction"}
              aria-hidden
            />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

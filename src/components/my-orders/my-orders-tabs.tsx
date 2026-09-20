"use client";

import {
  IconCalendar,
  IconCircleX,
  IconHistory,
} from "@/components/icons/line-icons";
import type { MyOrdersTab } from "@/lib/staff-my-orders";

const TABS: Array<{
  id: MyOrdersTab;
  label: string;
  Icon: typeof IconCalendar;
}> = [
  { id: "upcoming", label: "Upcoming", Icon: IconCalendar },
  { id: "past", label: "Past Orders", Icon: IconHistory },
  { id: "cancelled", label: "Cancelled", Icon: IconCircleX },
];

type Props = {
  activeTab: MyOrdersTab;
  onTabChange: (tab: MyOrdersTab) => void;
};

export function MyOrdersTabs({ activeTab, onTabChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="My Orders views"
      className="inline-flex max-w-full overflow-x-auto rounded-xl border border-border bg-surface shadow-sm [-ms-overflow-style:none] [scrollbar-width:thin]"
    >
      {TABS.map((tab) => {
        const selected = tab.id === activeTab;
        const TabIcon = tab.Icon;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            id={`my-orders-tab-${tab.id}`}
            aria-controls={`my-orders-panel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`relative inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors first:rounded-tl-xl last:rounded-tr-xl ${
              selected
                ? "border-primary text-slate-900"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <TabIcon
              size={18}
              className={selected ? "text-primary" : "text-teal-700/45"}
            />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

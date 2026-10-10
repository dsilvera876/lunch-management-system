"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { StaffLateOrderRequestRow } from "@/app/home/staff-late-order-request-actions";
import type { GroupedCheckout, MyOrdersTab } from "@/lib/staff-my-orders";
import { MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB } from "@/lib/staff-late-order-submissions";
import { sortLateOrderSubmissions } from "@/lib/staff-late-order-submissions";
import { LateOrderSubmissionCard } from "@/components/my-orders/late-order-submission-card";
import {
  getMostRecentPastDeliveryDate,
  selectCancelledCheckouts,
  selectPastCheckoutsForDate,
  selectUpcomingCheckouts,
} from "@/lib/staff-my-orders";
import { MyOrdersToolbar } from "@/components/my-orders/my-orders-toolbar";
import { GroupedCheckoutCard } from "@/components/my-orders/grouped-checkout-card";
import { PastOrderDatePicker } from "@/components/my-orders/past-order-date-picker";
import { MyOrdersEmptyState } from "@/components/my-orders/my-orders-empty-state";
import { MY_ORDERS_TABPANEL_ID } from "@/lib/accessible-tabs";
import type { MenuItemRatingSummariesById } from "@/lib/menu-item-ratings-collect";
import { MenuItemRatingsLoadNotice } from "@/components/menu-item-ratings/menu-item-ratings-load-notice";

type Props = {
  checkouts: GroupedCheckout[];
  lateOrderSubmissions: StaffLateOrderRequestRow[];
  activeTab: MyOrdersTab;
  selectedPastDate: string | null;
  pastDeliveryDates: string[];
  showLateOrderSubmissionLink: boolean;
  ratingSummaries?: MenuItemRatingSummariesById;
  ratingsLoadFailed?: boolean;
  ratingsLoadErrorMessage?: string | null;
};

function buildMyOrdersHref(tab: MyOrdersTab, date: string | null): string {
  const params = new URLSearchParams();
  if (tab !== "upcoming") {
    params.set("tab", tab);
  }
  if (tab === "past" && date) {
    params.set("date", date);
  }
  const query = params.toString();
  return query ? `/my-orders?${query}` : "/my-orders";
}

export function MyOrdersPageClient({
  checkouts,
  lateOrderSubmissions,
  activeTab,
  selectedPastDate,
  pastDeliveryDates,
  showLateOrderSubmissionLink,
  ratingSummaries,
  ratingsLoadFailed = false,
  ratingsLoadErrorMessage,
}: Props) {
  const router = useRouter();

  const upcoming = useMemo(() => selectUpcomingCheckouts(checkouts), [checkouts]);
  const cancelled = useMemo(() => selectCancelledCheckouts(checkouts), [checkouts]);

  const sortedLateOrderSubmissions = useMemo(
    () => sortLateOrderSubmissions(lateOrderSubmissions),
    [lateOrderSubmissions],
  );

  const pastCheckoutsForSelectedDate = useMemo(() => {
    if (!selectedPastDate) {
      return [];
    }

    return selectPastCheckoutsForDate(checkouts, selectedPastDate);
  }, [checkouts, selectedPastDate]);

  function handleTabChange(tab: MyOrdersTab) {
    if (tab === "past") {
      const date = selectedPastDate ?? getMostRecentPastDeliveryDate(pastDeliveryDates);
      router.push(buildMyOrdersHref("past", date));
      return;
    }

    router.push(buildMyOrdersHref(tab, null));
  }

  function handlePastDateChange(value: string) {
    router.push(buildMyOrdersHref("past", value || null));
  }

  return (
    <div className="space-y-4">
      <MyOrdersToolbar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        pastDatePicker={
          activeTab === "past" ? (
            <PastOrderDatePicker
              selectedDate={selectedPastDate}
              onChange={handlePastDateChange}
              availableDates={pastDeliveryDates}
            />
          ) : undefined
        }
      />

      <div
        role="tabpanel"
        id={MY_ORDERS_TABPANEL_ID}
        aria-labelledby={`my-orders-tab-${activeTab}`}
        className="space-y-4"
      >
        {ratingsLoadFailed ? (
          <MenuItemRatingsLoadNotice message={ratingsLoadErrorMessage ?? undefined} />
        ) : null}
        {activeTab === "upcoming" ? (
          upcoming.length === 0 ? (
            <MyOrdersEmptyState
              title="No upcoming lunch orders."
              icon="calendar"
              action={
                <Link href="/lunch" className="inline-flex min-h-10 items-center text-sm font-medium text-staff-teal hover:underline">
                  Order lunch
                </Link>
              }
            />
          ) : (
            upcoming.map((checkout, index) => (
              <GroupedCheckoutCard
                key={checkout.orderGroupId}
                checkout={checkout}
                collapsible={upcoming.length > 1}
                defaultExpanded={index === 0}
                ratingSummaries={ratingSummaries}
                ratingsLoadFailed={ratingsLoadFailed}
              />
            ))
          )
        ) : null}

        {activeTab === "past" ? (
          <>
            {!selectedPastDate ? (
              <MyOrdersEmptyState
                title="Select a date to view your past lunch order."
                icon="history"
              />
            ) : pastCheckoutsForSelectedDate.length === 0 ? (
              <MyOrdersEmptyState
                title="No lunch order found for this date."
                icon="calendar"
              />
            ) : (
              pastCheckoutsForSelectedDate.map((checkout) => (
                <GroupedCheckoutCard
                  key={checkout.orderGroupId}
                  checkout={checkout}
                  collapsible={false}
                  defaultExpanded
                  ratingSummaries={ratingSummaries}
                  ratingsLoadFailed={ratingsLoadFailed}
                />
              ))
            )}
          </>
        ) : null}

        {activeTab === "cancelled" ? (
          cancelled.length === 0 ? (
            <MyOrdersEmptyState
              title="No recent cancelled orders."
              description="Showing your 3 most recent cancelled orders."
              icon="receipt"
            />
          ) : (
            cancelled.map((checkout) => (
              <GroupedCheckoutCard
                key={checkout.orderGroupId}
                checkout={checkout}
                collapsible={false}
                defaultExpanded
                showViewLinks={false}
              />
            ))
          )
        ) : null}

        {activeTab === MY_ORDERS_LATE_ORDER_SUBMISSIONS_TAB ? (
          sortedLateOrderSubmissions.length === 0 ? (
            <MyOrdersEmptyState
              title="No late order submissions yet."
              icon="receipt"
              action={
                showLateOrderSubmissionLink ? (
                  <Link
                    href="/lunch?lateOrder=1"
                    className="inline-flex min-h-10 items-center text-sm font-medium text-staff-teal hover:underline"
                  >
                    Submit a late order
                  </Link>
                ) : undefined
              }
            />
          ) : (
            sortedLateOrderSubmissions.map((submission) => (
              <LateOrderSubmissionCard key={submission.id} request={submission} />
            ))
          )
        ) : null}
      </div>
    </div>
  );
}

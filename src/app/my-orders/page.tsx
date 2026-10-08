import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { linkButtonClass } from "@/components/ui/button";
import { MyOrdersPageClient } from "@/components/my-orders/my-orders-page-client";
import {
  loadMyStaffLateOrderRequests,
  loadStaffLateOrderNewRequestAvailable,
} from "@/app/home/staff-late-order-request-actions";
import { loadStaffGroupedCheckouts } from "@/lib/staff-my-orders-load";
import {
  getMostRecentPastDeliveryDate,
  normalizePastOrderDateParam,
  parseMyOrdersTab,
  selectPastDeliveryDates,
} from "@/lib/staff-my-orders";

type Props = {
  searchParams: Promise<{
    tab?: string;
    date?: string;
  }>;
};

export default async function MyOrdersPage({ searchParams }: Props) {
  const profile = await requireProfile();
  const query = await searchParams;
  const tab = parseMyOrdersTab(query.tab);
  const [checkouts, lateOrderSubmissions, lateOrderOpportunityAvailable] = await Promise.all([
    loadStaffGroupedCheckouts(profile.id),
    loadMyStaffLateOrderRequests(),
    loadStaffLateOrderNewRequestAvailable(),
  ]);
  const pastDates = selectPastDeliveryDates(checkouts);
  const dateFromQuery = normalizePastOrderDateParam(query.date);

  if (tab === "past" && !dateFromQuery && pastDates.length > 0) {
    redirect(`/my-orders?tab=past&date=${getMostRecentPastDeliveryDate(pastDates)}`);
  }

  const selectedPastDate = tab === "past" ? dateFromQuery : null;

  return (
    <>
      <PageHeader
        title="My Orders"
        staffAccessibleDescription
        description="Your lunch orders grouped by checkout."
        actions={
          <Link href="/lunch" className={linkButtonClass("primary", { staffPrimaryCta: true })}>
            Place another order
          </Link>
        }
      />

      <MyOrdersPageClient
        checkouts={checkouts}
        lateOrderSubmissions={lateOrderSubmissions}
        activeTab={tab}
        selectedPastDate={selectedPastDate}
        pastDeliveryDates={pastDates}
        showLateOrderSubmissionLink={lateOrderOpportunityAvailable}
      />
    </>
  );
}

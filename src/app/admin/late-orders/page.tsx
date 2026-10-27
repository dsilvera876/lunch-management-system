import { LateOrdersPageHeader } from "@/components/admin/late-orders/late-orders-page-header";
import { LateOrdersWorkspace } from "@/components/admin/late-orders-workspace";
import { requireViewAllOrders } from "@/lib/auth";
import { getJamaicaTodayDate } from "@/lib/datetime";
import {
  createSupabaseHrLateOrdersDataSource,
  loadHrLateOrdersPageData,
} from "@/lib/hr-late-orders-page-load";
import { pageMetadata } from "@/lib/page-titles";
import { createClient } from "@/lib/supabase/server";

export const metadata = pageMetadata("adminLateOrders");

export default async function LateOrdersPage() {
  const profile = await requireViewAllOrders();
  const supabase = await createClient();
  const today = getJamaicaTodayDate();
  const pageData = await loadHrLateOrdersPageData({
    source: createSupabaseHrLateOrdersDataSource(supabase),
    today,
    now: new Date(),
    canCreateLateOrders: profile.role === "hr",
    canPreviewLateOrders: profile.role !== "hr",
  });

  return (
    <div className="space-y-4">
      <LateOrdersPageHeader />
      <LateOrdersWorkspace
        jamaicaToday={today}
        supportPreview={profile.role !== "hr"}
        {...pageData}
      />
    </div>
  );
}

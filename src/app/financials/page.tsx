import { requireProfile } from "@/lib/auth";
import { getStaffFinancialDashboard } from "@/lib/financial-summaries";
import { createClient } from "@/lib/supabase/server";
import { MySpendPageView } from "@/components/my-spend/my-spend-page-view";
import { MySpendSubsidyNote } from "@/components/my-spend/my-spend-subsidy-note";
import { PageHeader } from "@/components/ui/page-header";

export default async function FinancialsPage() {
  await requireProfile();
  const supabase = await createClient();
  const dashboard = await getStaffFinancialDashboard(supabase);

  return (
    <div className="space-y-4">
      <PageHeader
        className="!mb-0"
        title="My Spend"
        description="Track your lunch spending and salary deductions over time."
      />

      <MySpendSubsidyNote dailyLunchSubsidy={dashboard.daily_lunch_subsidy} />

      <MySpendPageView
        dashboard={dashboard}
        canExport={dashboard.current_period !== null}
      />
    </div>
  );
}

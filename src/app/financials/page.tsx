import { requireProfile } from "@/lib/auth";
import { getStaffFinancialDashboard } from "@/lib/financial-summaries";
import { createClient } from "@/lib/supabase/server";
import { StaffFinancialDashboardView } from "@/components/staff-financial-dashboard";
import { PageHeader } from "@/components/ui/page-header";

export default async function FinancialsPage() {
  await requireProfile();
  const supabase = await createClient();
  const dashboard = await getStaffFinancialDashboard(supabase);

  return (
    <>
      <PageHeader
        title="My Spend"
        description="Your lunch spending summaries based on order date."
      />

      <StaffFinancialDashboardView
        dashboard={dashboard}
        canExport={dashboard.current_period !== null}
      />
    </>
  );
}

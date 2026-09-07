import {
  formatLunchPeriodRange,
  type LunchPeriod,
} from "@/lib/lunch-periods";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";

type Props = {
  period: LunchPeriod | null;
  showStaffExport?: boolean;
};

export function CurrentLunchPeriodCard({
  period,
  showStaffExport = false,
}: Props) {
  return (
    <Card className="mb-8">
      <SectionHeader
        title="Current lunch period"
        description="Payroll-aligned dates for lunch ordering. Period totals use order date, not delivery date."
      />

      {period ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold">
              {formatLunchPeriodRange(period.start_date, period.end_date)}
            </p>
            <StatusBadge status="active" />
          </div>
          <p className="mt-2 text-sm text-muted">{period.label}</p>
        </div>
      ) : (
        <EmptyState
          title="No current lunch period has been set."
          description="Your team administrator will configure the active payroll period."
        />
      )}

      {showStaffExport && (
        <div className="mt-6 border-t border-border pt-4">
          <Button disabled title="Coming in Batch 2B">
            Export My Summary
          </Button>
          <p className="mt-2 text-xs text-muted">
            Coming soon — export your own lunch-period summary.
          </p>
        </div>
      )}
    </Card>
  );
}

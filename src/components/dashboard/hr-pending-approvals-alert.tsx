import Link from "next/link";

import { linkButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HrPendingSignupApprovalAlert } from "@/lib/hr-pending-signup-approvals";

type Props = {
  alert: HrPendingSignupApprovalAlert;
};

export function HrPendingApprovalsAlert({ alert }: Props) {
  return (
    <Card className="border-amber-200 bg-amber-50/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-amber-950">{alert.title}</h2>
          <p className="mt-1 text-sm text-amber-900">{alert.message}</p>
        </div>
        <Link href={alert.href} className={`${linkButtonClass("primary")} shrink-0`}>
          {alert.actionLabel}
        </Link>
      </div>
    </Card>
  );
}

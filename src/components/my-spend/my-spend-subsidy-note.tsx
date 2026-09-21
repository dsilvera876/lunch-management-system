import { IconInfo } from "@/components/icons/line-icons";
import { formatCurrency } from "@/lib/format";
import { toNumber } from "@/lib/staff-my-spend";

type Props = {
  dailyLunchSubsidy: string | number;
};

export function MySpendSubsidyNote({ dailyLunchSubsidy }: Props) {
  return (
    <p className="flex items-start gap-2 text-xs leading-5 text-muted sm:text-sm">
      <IconInfo size={16} className="mt-0.5 shrink-0 text-primary/75" aria-hidden />
      <span>
        Daily lunch subsidy: {formatCurrency(toNumber(dailyLunchSubsidy))} · Salary
        deductions shown below are after subsidy.
      </span>
    </p>
  );
}

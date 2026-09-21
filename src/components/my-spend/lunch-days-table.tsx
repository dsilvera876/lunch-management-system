import { IconReceipt } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { formatCurrency, formatHumanDate } from "@/lib/format";
import type { LunchDaySpendRow } from "@/lib/staff-my-spend";

type Props = {
  rows: LunchDaySpendRow[];
  emptyMessage: string;
};

export function LunchDaysTable({ rows, emptyMessage }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border/80 bg-background/80 px-4 py-8 text-center">
        <TealIconWell size="sm">
          <IconReceipt size={15} />
        </TealIconWell>
        <p className="max-w-sm text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/80">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50/90 text-muted">
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">Date</th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide">
              Provider(s)
            </th>
            <th className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide">
              Orders
            </th>
            <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wide">
              Salary Deduction
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.orderDate}
              className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-slate-50/60"
            >
              <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">
                {formatHumanDate(row.orderDate)}
              </td>
              <td
                className="max-w-[14rem] px-3 py-2.5 text-slate-600 sm:max-w-none"
                title={row.providersLabel}
              >
                <span className="line-clamp-2 sm:line-clamp-none">{row.providersLabel}</span>
              </td>
              <td className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                {row.orderCount}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                {formatCurrency(row.payrollDeduction)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

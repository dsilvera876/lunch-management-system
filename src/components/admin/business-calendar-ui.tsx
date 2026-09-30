import type { ReactNode } from "react";
import { IconAlertTriangle, IconInfo } from "@/components/icons/line-icons";
import {
  BUSINESS_CALENDAR_IMPACT_BODY,
  BUSINESS_CALENDAR_IMPACT_WARNING_ID,
  BUSINESS_CALENDAR_INFO_CALLOUT_ID,
  formatBusinessCalendarImpactHeadline,
  hasBusinessCalendarImpactWarning,
} from "@/lib/business-calendar-presentation";

export function BusinessCalendarInfoCallout({ children }: { children: ReactNode }) {
  return (
    <div
      id={BUSINESS_CALENDAR_INFO_CALLOUT_ID}
      className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-800"
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800 ring-1 ring-sky-200"
        aria-hidden
      >
        <IconInfo size={14} />
      </span>
      <p>{children}</p>
    </div>
  );
}

type ImpactWarningProps = {
  lunchDayCount: number;
  submittedOrderCount: number;
};

export function BusinessCalendarImpactWarning({
  lunchDayCount,
  submittedOrderCount,
}: ImpactWarningProps) {
  if (!hasBusinessCalendarImpactWarning(lunchDayCount, submittedOrderCount)) {
    return null;
  }

  const headline = formatBusinessCalendarImpactHeadline(
    lunchDayCount,
    submittedOrderCount,
  );

  if (!headline) {
    return null;
  }

  return (
    <div
      id={BUSINESS_CALENDAR_IMPACT_WARNING_ID}
      role="alert"
      aria-live="assertive"
      className="mb-3 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
    >
      <IconAlertTriangle
        size={18}
        className="mt-0.5 shrink-0 text-amber-800"
        aria-hidden
      />
      <div className="space-y-1">
        <p className="font-semibold text-amber-950">{headline}</p>
        <p>{BUSINESS_CALENDAR_IMPACT_BODY}</p>
      </div>
    </div>
  );
}

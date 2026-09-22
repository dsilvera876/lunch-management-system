import { IconInfo } from "@/components/icons/line-icons";

export function LunchPeriodInfoCallout() {
  return (
    <div className="mb-6 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-slate-700">
      <IconInfo size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
      <p>
        Each period starts the day after the previous period ends. Period dates are locked once a
        later period exists.
      </p>
    </div>
  );
}

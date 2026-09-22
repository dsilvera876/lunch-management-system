import type { PreparationSection } from "@/lib/operational-orders";
import { formatPreparationLine } from "@/lib/operational-orders";
import { IconClipboard } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";

type Props = {
  sections: PreparationSection[];
};

export function TodaysPreparationSummary({ sections }: Props) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.04] px-4 py-3">
      <div className="flex items-start gap-2.5">
        <TealIconWell size="sm" className="mt-0.5 shrink-0">
          <IconClipboard aria-hidden />
        </TealIconWell>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Preparation Summary</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">
            Excludes cancelled and waived orders. Open issues remain included until closed.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section, index) => (
              <div
                key={section.label}
                className={`min-w-0 ${index > 0 ? "sm:border-l sm:border-border/70 sm:pl-4" : ""}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {section.label}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-900">
                  {section.lines.map((line) => (
                    <li key={`${section.label}-${line.name}-${line.unitLabel}`}>
                      {formatPreparationLine(line)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

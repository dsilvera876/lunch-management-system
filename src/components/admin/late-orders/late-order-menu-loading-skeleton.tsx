const SKELETON_ROW_CLASS =
  "flex items-start gap-2.5 rounded-lg border border-border bg-surface p-2.5";

function MenuOptionSkeletonRow({ controlShape }: { controlShape: "radio" | "checkbox" }) {
  return (
    <div className={SKELETON_ROW_CLASS} aria-hidden>
      <div
        className={`mt-0.5 shrink-0 bg-slate-200/90 ${
          controlShape === "radio" ? "size-4 rounded-full" : "size-4 rounded-sm"
        }`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 max-w-[85%] rounded bg-slate-200/90" />
        <div className="h-3 max-w-[40%] rounded bg-slate-100" />
      </div>
    </div>
  );
}

type Props = {
  visibleLabel: string;
  screenReaderLabel: string;
};

export function LateOrderMenuLoadingSkeleton({
  visibleLabel,
  screenReaderLabel,
}: Props) {
  return (
    <div
      className="mt-4 grid gap-6 md:grid-cols-2 md:items-start"
      aria-busy="true"
      aria-labelledby="late-order-menu-loading-label"
    >
      <p id="late-order-menu-loading-label" className="sr-only">
        {screenReaderLabel}
      </p>
      <section className="min-w-0 space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Mains</h3>
        <p className="text-xs text-muted">Select one main item (required).</p>
        <div className="mt-2 space-y-2">
          <MenuOptionSkeletonRow controlShape="radio" />
          <MenuOptionSkeletonRow controlShape="radio" />
        </div>
      </section>
      <section className="min-w-0 space-y-2 md:border-l md:border-border md:pl-6">
        <h3 className="text-sm font-semibold text-slate-900">Sides</h3>
        <p className="text-xs text-muted">Select at least one side (required).</p>
        <div className="mt-2 space-y-2">
          <MenuOptionSkeletonRow controlShape="checkbox" />
          <MenuOptionSkeletonRow controlShape="checkbox" />
          <MenuOptionSkeletonRow controlShape="checkbox" />
        </div>
      </section>
      <p className="text-sm text-muted md:col-span-2">{visibleLabel}</p>
    </div>
  );
}

"use client";

import { linkButtonClass } from "@/components/ui/button";

type Props = {
  page: number;
  pageSize: number;
  /** All rating rows in this generation (includes removed). */
  totalCount: number;
  /** Ratings currently included in averages. */
  activeCount: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

export function HrRatingsListPagination({
  page,
  pageSize,
  totalCount,
  activeCount,
  loading = false,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  const countSummary = `${totalCount} record${totalCount === 1 ? "" : "s"} in this generation (${activeCount} active in averages, includes removed)`;

  if (totalCount <= pageSize) {
    return <p className="mt-3 text-sm text-muted">{countSummary}</p>;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-sm text-muted">
        Page {page} of {totalPages} · {countSummary}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={linkButtonClass("secondary")}
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={linkButtonClass("secondary")}
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

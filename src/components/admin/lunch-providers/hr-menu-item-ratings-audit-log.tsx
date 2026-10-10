"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { loadHrProviderMenuItemRatingsAudit } from "@/app/admin/providers/[id]/ratings-actions";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { linkButtonClass } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import {
  formatHrMenuItemRatingsAuditTimestamp,
  formatHrRatingsActionLabel,
  type HrMenuItemRatingsAuditEntry,
} from "@/lib/hr-menu-item-ratings";

const PAGE_SIZE = 20;

type Props = {
  providerId: string;
  /** Increment after moderation actions to reload the newest audit page. */
  reloadToken?: number;
};

export function HrMenuItemRatingsAuditLog({ providerId, reloadToken = 0 }: Props) {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<HrMenuItemRatingsAuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadPage = useCallback(
    (nextPage: number) => {
      startTransition(async () => {
        setError(null);
        const result = await loadHrProviderMenuItemRatingsAudit(providerId, nextPage, PAGE_SIZE);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setEntries(
          result.audit.entries.map((entry) => ({
            ...entry,
            createdAtLabel:
              entry.createdAtLabel ?? formatHrMenuItemRatingsAuditTimestamp(entry.createdAt),
          })),
        );
        setTotalCount(result.audit.totalCount);
        setPage(result.audit.page);
      });
    },
    [providerId],
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 1 && !isPending;
  const canNext = page < totalPages && !isPending;

  return (
    <section>
      <SectionHeader
        title="Rating activity log"
        description="HR moderation history for this provider (newest first)."
        descriptionClassName="text-slate-700"
      />
      <Card className="p-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        {isPending && entries.length === 0 ? (
          <p className="text-sm text-muted">Loading activity…</p>
        ) : null}
        {!error && !isPending && entries.length === 0 ? (
          <p className="text-sm text-muted">No moderation actions recorded yet.</p>
        ) : null}
        {entries.length > 0 ? (
          <>
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatHrRatingsActionLabel(entry.action)}
                  </p>
                  {entry.reason.trim().length > 0 ? (
                    <p className="text-sm text-muted">{entry.reason}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted">
                    {entry.actorName} · {entry.createdAtLabel ?? entry.createdAt}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-muted">
                Page {page} of {totalPages} · {totalCount} entr{totalCount === 1 ? "y" : "ies"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={linkButtonClass("secondary")}
                  disabled={!canPrev}
                  onClick={() => loadPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className={linkButtonClass("secondary")}
                  disabled={!canNext}
                  onClick={() => loadPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : null}
      </Card>
    </section>
  );
}

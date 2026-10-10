"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import {
  hrRemoveMenuItemRatingAction,
  hrResetCatalogMenuItemRatingsAction,
  hrResetProviderMenuItemRatingsAction,
  hrSetProviderMenuItemRatingsEnabledAction,
  loadHrCatalogMenuItemRatingsDetail,
} from "@/app/admin/providers/[id]/ratings-actions";
import { HrMenuItemRatingsReasonDialog } from "@/components/admin/lunch-providers/hr-menu-item-ratings-reason-dialog";
import { Alert } from "@/components/ui/alert";
import { linkButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HrMenuItemRatingsAuditLog } from "@/components/admin/lunch-providers/hr-menu-item-ratings-audit-log";
import { HrRatingsListPagination } from "@/components/admin/lunch-providers/hr-ratings-list-pagination";
import { RatingStars, RatingStarsAverage } from "@/components/ui/rating-stars";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { ProviderIconWell } from "@/lib/provider-icons";
import {
  type HrCatalogMenuItemRatingsDetail,
  type HrMenuItemRatingsDashboard,
} from "@/lib/hr-menu-item-ratings";

type Props = {
  dashboard: HrMenuItemRatingsDashboard;
  providerIconKey?: string | null;
};

type DialogKind =
  | { type: "disable" }
  | { type: "enable" }
  | { type: "reset-provider" }
  | { type: "reset-item"; providerMenuItemId: string; itemName: string }
  | { type: "remove-rating"; ratingId: string; employeeName: string; itemName: string };

function formatAverage(value: number, count: number): string {
  if (count <= 0) {
    return "No ratings yet";
  }
  return `${value.toFixed(2)} average · ${count} rating${count === 1 ? "" : "s"}`;
}

function HrProviderMenuItemRatingsContent({
  dashboard,
  providerIconKey = null,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const detailRequestRef = useRef(0);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [itemDetail, setItemDetail] = useState<HrCatalogMenuItemRatingsDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [auditReloadToken, setAuditReloadToken] = useState(0);
  const [, startTransition] = useTransition();

  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement>(null);

  const loadDetail = useCallback((providerMenuItemId: string, page = 1) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setDetailLoading(true);
    setDetailError(null);
    startTransition(async () => {
      const result = await loadHrCatalogMenuItemRatingsDetail(providerMenuItemId, page);
      if (requestId !== detailRequestRef.current) {
        return;
      }
      setDetailLoading(false);
      if (!result.ok) {
        setItemDetail(null);
        setDetailError(result.message);
        return;
      }
      setItemDetail(result.detail);
    });
  }, []);

  function toggleItemExpanded(providerMenuItemId: string) {
    if (expandedItemId === providerMenuItemId) {
      detailRequestRef.current += 1;
      setExpandedItemId(null);
      setItemDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    setExpandedItemId(providerMenuItemId);
    setItemDetail(null);
    setDetailPage(1);
    loadDetail(providerMenuItemId, 1);
  }

  function openDialog(kind: DialogKind) {
    // Defer until after the triggering click finishes so the modal backdrop
    // does not receive the same pointer sequence and instantly dismiss.
    window.requestAnimationFrame(() => {
      setDialog(kind);
    });
  }

  async function handleDialogConfirm(reason: string) {
    if (!dialog) {
      return { ok: false as const, message: "Nothing to confirm." };
    }

    switch (dialog.type) {
      case "disable":
        return hrSetProviderMenuItemRatingsEnabledAction(dashboard.providerId, false, reason);
      case "enable":
        return hrSetProviderMenuItemRatingsEnabledAction(dashboard.providerId, true, reason);
      case "reset-provider":
        return hrResetProviderMenuItemRatingsAction(dashboard.providerId, reason);
      case "reset-item":
        return hrResetCatalogMenuItemRatingsAction(
          dashboard.providerId,
          dialog.providerMenuItemId,
          reason,
        );
      case "remove-rating":
        return hrRemoveMenuItemRatingAction(dashboard.providerId, dialog.ratingId, reason);
      default:
        return { ok: false as const, message: "Unknown action." };
    }
  }

  function dialogCopy(): {
    title: string;
    description: string;
    confirmLabel: string;
    reasonRequired: boolean;
    showReasonField: boolean;
    destructive: boolean;
  } | null {
    if (!dialog) {
      return null;
    }

    switch (dialog.type) {
      case "disable":
        return {
          title: "Disable menu item ratings",
          description:
            "Staff will no longer see rating controls or community averages for this provider until ratings are re-enabled.",
          confirmLabel: "Disable ratings",
          reasonRequired: true,
          showReasonField: true,
          destructive: true,
        };
      case "enable":
        return {
          title: "Enable menu item ratings",
          description:
            "Staff can rate delivered items again. Current-generation averages are preserved; nothing is reset.",
          confirmLabel: "Enable ratings",
          reasonRequired: false,
          showReasonField: false,
          destructive: false,
        };
      case "reset-provider":
        return {
          title: "Reset all provider ratings",
          description:
            "Starts a new provider assessment period and bumps rating generations for every catalog item. Historical ratings and audit records are kept.",
          confirmLabel: "Reset provider ratings",
          reasonRequired: false,
          showReasonField: false,
          destructive: true,
        };
      case "reset-item":
        return {
          title: `Reset ratings for ${dialog.itemName}`,
          description:
            "Starts a new rating generation for this menu item. Staff need a new verified delivery before they can rate again.",
          confirmLabel: "Reset menu item",
          reasonRequired: false,
          showReasonField: false,
          destructive: true,
        };
      case "remove-rating":
        return {
          title: "Remove staff rating",
          description: `${dialog.employeeName} will not be able to rate ${dialog.itemName} again during this generation.`,
          confirmLabel: "Remove rating",
          reasonRequired: false,
          showReasonField: false,
          destructive: true,
        };
      default:
        return null;
    }
  }

  const copy = dialogCopy();

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 overflow-x-hidden">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderIconWell iconKey={providerIconKey} size="large" alt={dashboard.providerName} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Menu item ratings</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold text-foreground">
                {dashboard.providerName}
              </h1>
              <StatusBadge status={dashboard.ratingsEnabled ? "active" : "inactive"} />
            </div>
            <p className="mt-1 text-sm text-slate-700">
              Provider assessment period {dashboard.providerRatingGeneration}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-8">
        <section>
          <SectionHeader
            title="Provider summary"
            description="Equal-weight average across valid current-generation menu item ratings."
            descriptionClassName="text-slate-700"
            actions={
              <div className="flex flex-wrap gap-2">
                {dashboard.ratingsEnabled ? (
                  <button
                    type="button"
                    className={linkButtonClass("secondary")}
                    onClick={() => openDialog({ type: "disable" })}
                  >
                    Disable ratings
                  </button>
                ) : (
                  <button
                    type="button"
                    className={linkButtonClass("primary")}
                    onClick={() => openDialog({ type: "enable" })}
                  >
                    Enable ratings
                  </button>
                )}
                <button
                  type="button"
                  className={linkButtonClass("secondary")}
                  onClick={() => openDialog({ type: "reset-provider" })}
                >
                  Reset all ratings
                </button>
              </div>
            }
          />
          <Card className="p-6 text-center">
            <p className="text-sm font-medium text-foreground">Provider average</p>
            {dashboard.providerRatingCount > 0 ? (
              <div className="mt-3 flex flex-col items-center gap-3">
                <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground sm:text-5xl">
                  {dashboard.providerAverageStars.toFixed(1)}
                </p>
                <RatingStarsAverage
                  value={dashboard.providerAverageStars}
                  size="lg"
                  label={`Provider average ${dashboard.providerAverageStars.toFixed(1)} of 5 stars`}
                />
                <p className="text-sm text-muted">
                  {dashboard.providerRatingCount} rating
                  {dashboard.providerRatingCount === 1 ? "" : "s"}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No ratings yet for this assessment period.
              </p>
            )}
            {!dashboard.ratingsEnabled ? (
              <Alert variant="warning" className="mt-4">
                Ratings are disabled for staff. Re-enable to restore rating controls without resetting
                scores.
              </Alert>
            ) : null}
          </Card>
        </section>

        <section>
          <SectionHeader
            title="Menu items"
            description="Per-item averages for the current provider assessment period."
            descriptionClassName="text-slate-700"
          />
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Item
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Average
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Active count
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dashboard.menuItems.map((item) => {
                    const expanded = expandedItemId === item.providerMenuItemId;
                    return (
                      <tr key={item.providerMenuItemId} className="align-top">
                        <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.active ? "active" : "inactive"} />
                        </td>
                        <td className="px-4 py-3">
                          {item.ratingCount > 0 ? (
                            <RatingStarsAverage
                              value={item.averageStars}
                              size="sm"
                              label={`${item.name}: ${item.averageStars.toFixed(1)} of 5 stars average`}
                            />
                          ) : (
                            <span className="text-muted" aria-label="No ratings">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{item.ratingCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className={linkButtonClass("secondary")}
                              aria-expanded={expanded}
                              onClick={() => toggleItemExpanded(item.providerMenuItemId)}
                            >
                              {expanded ? "Hide ratings" : "View ratings"}
                            </button>
                            <button
                              type="button"
                              className={linkButtonClass("secondary")}
                              onClick={() =>
                                openDialog({
                                  type: "reset-item",
                                  providerMenuItemId: item.providerMenuItemId,
                                  itemName: item.name,
                                })
                              }
                            >
                              Reset item
                            </button>
                          </div>
                          {expanded ? (
                            <div className="mt-4 rounded-lg border border-border bg-slate-50/50 p-4 text-left">
                              {detailLoading ? (
                                <p className="text-sm text-muted">Loading individual ratings…</p>
                              ) : null}
                              {detailError ? (
                                <Alert variant="error">{detailError}</Alert>
                              ) : null}
                              {itemDetail &&
                              itemDetail.providerMenuItemId === item.providerMenuItemId ? (
                                <>
                                  <p className="mb-3 text-sm text-muted">
                                    Generation {itemDetail.currentRatingGeneration} ·{" "}
                                    {formatAverage(
                                      itemDetail.averageStars,
                                      itemDetail.activeRatingCount,
                                    )}
                                  </p>
                                  {itemDetail.ratings.length === 0 ? (
                                    <p className="text-sm text-muted">No ratings in this generation.</p>
                                  ) : (
                                    <>
                                    <ul className="space-y-3">
                                      {itemDetail.ratings.map((rating) => (
                                        <li
                                          key={rating.id}
                                          className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                          <div>
                                            <p className="font-medium text-foreground">
                                              {rating.employeeName}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                              <RatingStars
                                                value={rating.stars}
                                                readOnly
                                                label={`${rating.stars} stars`}
                                              />
                                              {!rating.isActiveForAggregates ? (
                                                <span className="text-xs font-medium text-amber-800">
                                                  Removed from averages
                                                </span>
                                              ) : null}
                                            </div>
                                            {rating.removalReason ? (
                                              <p className="mt-1 text-xs text-muted">
                                                Removal reason: {rating.removalReason}
                                              </p>
                                            ) : null}
                                          </div>
                                          {rating.canRemove ? (
                                            <button
                                              type="button"
                                              className={linkButtonClass("danger")}
                                              onClick={() =>
                                                openDialog({
                                                  type: "remove-rating",
                                                  ratingId: rating.id,
                                                  employeeName: rating.employeeName,
                                                  itemName: item.name,
                                                })
                                              }
                                            >
                                              Remove
                                            </button>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                    <HrRatingsListPagination
                                      page={itemDetail.page}
                                      pageSize={itemDetail.pageSize}
                                      totalCount={itemDetail.totalCount}
                                      activeCount={itemDetail.activeRatingCount}
                                      loading={detailLoading}
                                      onPageChange={(nextPage) => {
                                        setDetailPage(nextPage);
                                        loadDetail(item.providerMenuItemId, nextPage);
                                      }}
                                    />
                                    </>
                                  )}
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <HrMenuItemRatingsAuditLog
          providerId={dashboard.providerId}
          reloadToken={auditReloadToken}
        />
      </div>

      <button
        ref={dialogTriggerRef}
        type="button"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      >
        Open confirmation
      </button>

      <HrMenuItemRatingsReasonDialog
        open={copy !== null}
        triggerRef={dialogTriggerRef}
        title={copy?.title ?? ""}
        description={copy?.description ?? ""}
        confirmLabel={copy?.confirmLabel ?? "Confirm"}
        reasonRequired={copy?.reasonRequired ?? true}
        showReasonField={copy?.showReasonField ?? true}
        destructive={copy?.destructive ?? false}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
          }
        }}
        onConfirm={handleDialogConfirm}
        onSuccess={(message) => {
          showToast({ title: message });
          setAuditReloadToken((token) => token + 1);
          window.requestAnimationFrame(() => {
            router.refresh();
            if (expandedItemId) {
              setItemDetail(null);
              setDetailError(null);
              loadDetail(expandedItemId, detailPage);
            } else {
              setItemDetail(null);
            }
          });
        }}
      />
    </div>
  );
}

export function HrProviderMenuItemRatingsWorkspace(props: Props) {
  return (
    <ToastProvider>
      <HrProviderMenuItemRatingsContent {...props} />
    </ToastProvider>
  );
}

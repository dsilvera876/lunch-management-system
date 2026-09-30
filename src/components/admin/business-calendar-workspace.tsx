"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { archiveBusinessCalendarEntry } from "@/app/admin/settings/business-calendar/actions";
import { BusinessCalendarEntryDrawer } from "@/components/admin/business-calendar-entry-drawer";
import { useSupportMode } from "@/components/app-shell/support-mode-context";
import { SupportModeMutationHint } from "@/components/app-shell/support-mode-ui";
import { IconPencil, IconX } from "@/components/icons/line-icons";
import { Alert } from "@/components/ui/alert";
import { Button, linkButtonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  businessCalendarEntryTypeLabel,
  businessCalendarScopeLabel,
  businessCalendarSourceLabel,
  formatBusinessCalendarDisplayDate,
  type BusinessCalendarEntryRow,
  type BusinessCalendarEntryType,
} from "@/lib/business-calendar-presentation";
import type { OfficeLocationRecord } from "@/lib/office-locations-presentation";

type Props = {
  year: number;
  initialEntries: BusinessCalendarEntryRow[];
  locations: OfficeLocationRecord[];
};

const PAGE_SIZE = 10;

const TYPE_BADGE_CLASS: Record<BusinessCalendarEntryType, string> = {
  public_holiday: "bg-blue-50 text-blue-800 ring-blue-200",
  company_closure: "bg-amber-50 text-amber-900 ring-amber-200",
  override_open: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  override_closed: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function BusinessCalendarWorkspace({
  year,
  initialEntries,
  locations,
}: Props) {
  const router = useRouter();
  const { readOnly } = useSupportMode();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<BusinessCalendarEntryRow | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return initialEntries.filter((entry) => {
      if (typeFilter && entry.entry_type !== typeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        entry.name.toLowerCase().includes(query) ||
        (entry.notes ?? "").toLowerCase().includes(query)
      );
    });
  }, [initialEntries, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function openCreate() {
    setSelectedEntry(null);
    setViewOnly(false);
    setDrawerOpen(true);
  }

  function openEdit(entry: BusinessCalendarEntryRow, readOnlyEntry: boolean) {
    setSelectedEntry(entry);
    setViewOnly(readOnlyEntry);
    setDrawerOpen(true);
  }

  function handleArchive(entryId: string) {
    if (readOnly) {
      return;
    }

    if (!window.confirm("Archive this calendar entry?")) {
      return;
    }

    startTransition(async () => {
      await archiveBusinessCalendarEntry(entryId);
    });
  }

  return (
    <div className="space-y-4">
      <Alert variant="info">
        This calendar controls which dates are open or closed for lunch ordering.
        Weekends (Saturday and Sunday) are closed automatically unless an override
        is added.
      </Alert>

      {readOnly ? <SupportModeMutationHint /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            aria-label="Previous year"
            onClick={() => {
              setPage(1);
              router.push(`/admin/settings/business-calendar?year=${year - 1}`);
            }}
          >
            ‹
          </Button>
          <span className="text-sm font-semibold text-foreground">{year} Calendar Entries</span>
          <Button
            type="button"
            variant="ghost"
            aria-label="Next year"
            onClick={() => {
              setPage(1);
              router.push(`/admin/settings/business-calendar?year=${year + 1}`);
            }}
          >
            ›
          </Button>
        </div>

        {!readOnly ? (
          <Button type="button" variant="primary" onClick={openCreate}>
            + Add Calendar Entry
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          placeholder="Search events"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm sm:max-w-xs"
        />
        <select
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value);
            setPage(1);
          }}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm sm:max-w-[12rem]"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="public_holiday">Public Holiday</option>
          <option value="company_closure">Company Closure</option>
          <option value="override_open">Override — Open</option>
          <option value="override_closed">Override — Closed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Date & Day</th>
              <th className="px-3 py-2 font-semibold">Event</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Scope</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">
                  No calendar entries for {year}.
                </td>
              </tr>
            ) : (
              pageEntries.map((entry) => {
                const isOfficial = entry.source === "official";

                return (
                  <tr key={entry.id} className="border-b border-border/70 last:border-0">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-medium text-foreground">
                        {formatBusinessCalendarDisplayDate(entry.calendar_date)}
                      </div>
                      <div className="text-xs text-muted">{entry.day_label}</div>
                    </td>
                    <td className="px-3 py-3">{entry.name}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE_BADGE_CLASS[entry.entry_type]}`}
                      >
                        {businessCalendarEntryTypeLabel(entry.entry_type)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {businessCalendarScopeLabel(entry.scope, entry.office_location_name)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={entry.effective_open ? "open" : "closed"} />
                    </td>
                    <td className="px-3 py-3">{businessCalendarSourceLabel(entry.source)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {isOfficial || readOnly ? (
                          <button
                            type="button"
                            className={linkButtonClass("ghost")}
                            onClick={() => openEdit(entry, true)}
                          >
                            View
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={linkButtonClass("ghost")}
                              aria-label="Edit entry"
                              onClick={() => openEdit(entry, false)}
                            >
                              <IconPencil aria-hidden />
                            </button>
                            <button
                              type="button"
                              className={`${linkButtonClass("ghost")} text-red-600`}
                              aria-label="Archive entry"
                              onClick={() => handleArchive(entry.id)}
                            >
                              <IconX aria-hidden />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing {(currentPage - 1) * PAGE_SIZE + (pageEntries.length ? 1 : 0)}–
          {(currentPage - 1) * PAGE_SIZE + pageEntries.length} of {filtered.length} entries
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <BusinessCalendarEntryDrawer
        key={selectedEntry?.id ?? "new-entry"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entry={selectedEntry}
        locations={locations}
        readOnly={readOnly || viewOnly}
      />
    </div>
  );
}

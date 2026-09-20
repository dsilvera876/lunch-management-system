"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { formatHumanDate } from "@/lib/format";
import {
  CALENDAR_WEEKDAY_LABELS,
  addCalendarMonths,
  buildCalendarMonthGrid,
  formatCalendarMonthLabel,
  type CalendarMonthParts,
} from "@/lib/past-order-calendar";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  view: CalendarMonthParts;
  onViewChange: (view: CalendarMonthParts) => void;
  selectedDate: string | null;
  todayDate: string;
  onSelectDate: (value: string) => void;
};

export function PastOrderCalendarPopover({
  open,
  onOpenChange,
  anchorRef,
  view,
  onViewChange,
  selectedDate,
  todayDate,
  onSelectDate,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const grid = buildCalendarMonthGrid(view.year, view.month);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        anchorRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange, anchorRef]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-[17.5rem] rounded-xl border border-border bg-surface p-3 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={() => {
            onViewChange(addCalendarMonths(view.year, view.month, -1));
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <p id={headingId} className="text-sm font-semibold text-slate-900">
          {formatCalendarMonthLabel(view.year, view.month)}
        </p>
        <button
          type="button"
          aria-label="Next month"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={() => {
            onViewChange(addCalendarMonths(view.year, view.month, 1));
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <span key={label} aria-hidden>
            {label}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const isSelected = selectedDate === cell.date;
          const isToday = todayDate === cell.date;

          return (
            <button
              key={cell.date}
              type="button"
              aria-label={`Select ${formatHumanDate(cell.date)}`}
              aria-pressed={isSelected}
              onClick={() => {
                onSelectDate(cell.date);
              }}
              className={`inline-flex size-8 items-center justify-center rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isSelected
                  ? "bg-primary font-semibold text-white"
                  : cell.inCurrentMonth
                    ? "font-medium text-slate-900 hover:bg-primary/10"
                    : "text-muted/70 hover:bg-primary/5"
              } ${isToday && !isSelected ? "ring-1 ring-primary/35" : ""}`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

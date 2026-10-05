"use client";

import { useId, useRef, type RefObject } from "react";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { formatHumanDate } from "@/lib/format";
import { STAFF_SOLID_FOCUS_CLASS } from "@/lib/staff-visual-contrast";
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
  const headingId = useId();
  const firstDayRef = useRef<HTMLButtonElement>(null);
  const grid = buildCalendarMonthGrid(view.year, view.month);

  return (
    <FocusTrapPopover
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={anchorRef}
      labelId={headingId}
      modal
      initialFocusRef={firstDayRef}
      className="w-[17.5rem] rounded-xl border border-border bg-surface p-3 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md text-staff-instruction transition-colors hover:bg-primary/10 hover:text-staff-teal ${STAFF_SOLID_FOCUS_CLASS}`}
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
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md text-staff-instruction transition-colors hover:bg-primary/10 hover:text-staff-teal ${STAFF_SOLID_FOCUS_CLASS}`}
          onClick={() => {
            onViewChange(addCalendarMonths(view.year, view.month, 1));
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-staff-instruction">
        {CALENDAR_WEEKDAY_LABELS.map((label) => (
          <span key={label} aria-hidden>
            {label}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((cell, index) => {
          const isSelected = selectedDate === cell.date;
          const isToday = todayDate === cell.date;

          return (
            <button
              key={cell.date}
              ref={index === 0 ? firstDayRef : undefined}
              type="button"
              aria-label={`Select ${formatHumanDate(cell.date)}`}
              aria-pressed={isSelected}
              onClick={() => {
                onSelectDate(cell.date);
              }}
              className={`inline-flex size-9 items-center justify-center rounded-md text-sm transition-colors ${STAFF_SOLID_FOCUS_CLASS} ${
                isSelected
                  ? "staff-calendar-day-selected bg-staff-cta font-semibold text-white"
                  : cell.inCurrentMonth
                    ? "font-medium text-slate-900 hover:bg-primary/10"
                    : "text-staff-instruction hover:bg-primary/5"
              } ${isToday && !isSelected ? "staff-calendar-day-today" : ""}`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </FocusTrapPopover>
  );
}

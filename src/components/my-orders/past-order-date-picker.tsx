"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { IconCalendar } from "@/components/icons/line-icons";
import { PastOrderCalendarPopover } from "@/components/my-orders/past-order-calendar-popover";
import { getJamaicaTodayDate } from "@/lib/datetime";
import { formatHumanDate } from "@/lib/format";
import {
  PAST_ORDER_DATE_PICKER_MOBILE_MEDIA_QUERY,
  parsePastOrderDate,
  type CalendarMonthParts,
} from "@/lib/past-order-calendar";

type Props = {
  selectedDate: string | null;
  onChange: (value: string) => void;
  availableDates: string[];
};

function subscribeToMobilePickerMediaQuery(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(PAST_ORDER_DATE_PICKER_MOBILE_MEDIA_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getMobilePickerMediaQuerySnapshot() {
  return window.matchMedia(PAST_ORDER_DATE_PICKER_MOBILE_MEDIA_QUERY).matches;
}

function getMobilePickerMediaQueryServerSnapshot() {
  return false;
}

function resolveInitialView(selectedDate: string | null): CalendarMonthParts {
  const parsed = selectedDate ? parsePastOrderDate(selectedDate) : null;
  if (parsed) {
    return { year: parsed.year, month: parsed.month };
  }

  const today = parsePastOrderDate(getJamaicaTodayDate());
  if (today) {
    return { year: today.year, month: today.month };
  }

  return { year: 2026, month: 1 };
}

export function PastOrderDatePicker({ selectedDate, onChange, availableDates }: Props) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isMobilePicker = useSyncExternalStore(
    subscribeToMobilePickerMediaQuery,
    getMobilePickerMediaQuerySnapshot,
    getMobilePickerMediaQueryServerSnapshot,
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [view, setView] = useState<CalendarMonthParts>(() => resolveInitialView(selectedDate));

  const inputValue = selectedDate ?? "";
  const displayLabel = selectedDate ? formatHumanDate(selectedDate) : "Choose a date";
  const todayDate = getJamaicaTodayDate();

  const openNativePicker = useCallback(() => {
    const input = dateInputRef.current;
    if (!input) {
      return;
    }

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        input.focus();
        input.click();
      }
    } else {
      input.focus();
      input.click();
    }
  }, []);

  function openDesktopCalendar() {
    setView(resolveInitialView(selectedDate));
    setPopoverOpen(true);
  }

  function handleTriggerClick() {
    if (isMobilePicker) {
      openNativePicker();
      return;
    }

    if (popoverOpen) {
      setPopoverOpen(false);
      return;
    }

    openDesktopCalendar();
  }

  function handleSelectDate(value: string) {
    onChange(value);
    setPopoverOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="relative w-full min-w-0 sm:w-auto sm:min-w-[15rem]">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-label="Select past order date"
        aria-expanded={isMobilePicker ? undefined : popoverOpen}
        aria-haspopup={isMobilePicker ? undefined : "dialog"}
        className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left shadow-sm transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Select date
        </span>
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <IconCalendar size={16} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm font-medium ${
            selectedDate ? "text-slate-900" : "text-muted"
          }`}
        >
          {displayLabel}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-muted"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {!isMobilePicker ? (
        <PastOrderCalendarPopover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          anchorRef={triggerRef}
          view={view}
          onViewChange={setView}
          selectedDate={selectedDate}
          todayDate={todayDate}
          onSelectDate={handleSelectDate}
        />
      ) : null}

      <input
        ref={dateInputRef}
        type="date"
        value={inputValue}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        list="past-order-date-options"
      />
      <datalist id="past-order-date-options">
        {availableDates.map((date) => (
          <option key={date} value={date} />
        ))}
      </datalist>
    </div>
  );
}

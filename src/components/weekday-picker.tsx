"use client";

import { useState } from "react";
import { WEEKDAYS } from "@/lib/datetime";

type Props = {
  namePrefix?: string;
  defaultWeekdays?: number[];
  required?: boolean;
};

export function WeekdayPicker({
  namePrefix = "weekday",
  defaultWeekdays = [1, 2, 3, 4, 5],
  required = true,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(defaultWeekdays),
  );

  function toggleDay(value: number) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }

      return next;
    });
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        Available order days
        <span className="ml-1 font-normal text-muted">(Mon–Fri)</span>
      </legend>
      <p className="text-xs text-muted">
        Staff can order this item on the selected weekdays. Delivery is the
        next business day.
      </p>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Weekday availability"
      >
        {WEEKDAYS.map((day) => {
          const isSelected = selected.has(day.value);

          return (
            <label
              key={day.value}
              className={`inline-flex min-h-10 min-w-[3.25rem] cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                  : "border-border bg-surface text-muted hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                name={`${namePrefix}:${day.value}`}
                value="on"
                checked={isSelected}
                onChange={() => toggleDay(day.value)}
                className="sr-only"
                aria-label={`${day.label}${isSelected ? ", selected" : ""}`}
              />
              {day.short}
            </label>
          );
        })}
      </div>

      {required && selected.size === 0 && (
        <input
          required
          tabIndex={-1}
          value=""
          readOnly
          aria-hidden
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      )}
    </fieldset>
  );
}

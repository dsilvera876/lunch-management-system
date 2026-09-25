"use client";

import { useState } from "react";
import { WEEKDAYS } from "@/lib/datetime";

type Props = {
  namePrefix?: string;
  defaultWeekdays?: number[];
  required?: boolean;
  legend?: string;
  showDescription?: boolean;
};

export function WeekdayPicker({
  namePrefix = "weekday",
  defaultWeekdays = [1, 2, 3, 4, 5],
  required = true,
  legend = "Available order days",
  showDescription = true,
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
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      {showDescription ? (
        <p className="text-xs text-muted">
          Staff can order this item on the selected weekdays. Delivery is the
          next business day.
        </p>
      ) : null}

      <div
        className="grid grid-cols-5 gap-2"
        role="group"
        aria-label="Weekday availability"
      >
        {WEEKDAYS.map((day) => {
          const isSelected = selected.has(day.value);

          return (
            <label
              key={day.value}
              className={`flex min-h-10 w-full cursor-pointer items-center justify-center rounded-lg border px-1 text-sm font-medium transition-colors ${
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

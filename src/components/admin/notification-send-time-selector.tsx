"use client";

import type { RefObject } from "react";
import {
  NOTIFICATION_SEND_TIME_HOUR_OPTIONS,
  NOTIFICATION_SEND_TIME_MINUTE_OPTIONS,
  type NotificationSendTime12HourParts,
} from "@/lib/notification-presentation";

/** Compact selects without `w-full` so Firefox does not stretch them inside table-fixed layouts. */
const sendTimeSelectClassName =
  "box-border shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

type Props = {
  eventKey: string;
  parts: NotificationSendTime12HourParts;
  disabled?: boolean;
  hourSelectRef?: RefObject<HTMLSelectElement | null>;
  onChange: (parts: NotificationSendTime12HourParts) => void;
  onEnter?: () => void;
};

export function NotificationSendTimeSelector({
  eventKey,
  parts,
  disabled = false,
  hourSelectRef,
  onChange,
  onEnter,
}: Props) {
  const hourId = `notification-send-hour-${eventKey}`;
  const minuteId = `notification-send-minute-${eventKey}`;
  const periodId = `notification-send-period-${eventKey}`;

  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="sr-only">Send time</legend>
      <div className="flex flex-nowrap items-center gap-2">
        <label htmlFor={hourId} className="sr-only">
          Hour
        </label>
        <select
          ref={hourSelectRef}
          id={hourId}
          disabled={disabled}
          value={parts.hour}
          className={`${sendTimeSelectClassName} w-[4.25rem]`}
          onChange={(event) => onChange({ ...parts, hour: event.target.value })}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter") {
              keyEvent.preventDefault();
              onEnter?.();
            }
          }}
        >
          {NOTIFICATION_SEND_TIME_HOUR_OPTIONS.map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted" aria-hidden>
          :
        </span>
        <label htmlFor={minuteId} className="sr-only">
          Minute
        </label>
        <select
          id={minuteId}
          disabled={disabled}
          value={parts.minute}
          className={`${sendTimeSelectClassName} w-[4.25rem]`}
          onChange={(event) => onChange({ ...parts, minute: event.target.value })}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter") {
              keyEvent.preventDefault();
              onEnter?.();
            }
          }}
        >
          {NOTIFICATION_SEND_TIME_MINUTE_OPTIONS.map((minute) => (
            <option key={minute} value={minute}>
              {minute}
            </option>
          ))}
        </select>
        <label htmlFor={periodId} className="sr-only">
          AM or PM
        </label>
        <select
          id={periodId}
          disabled={disabled}
          value={parts.period}
          className={`${sendTimeSelectClassName} w-[4.75rem]`}
          onChange={(event) =>
            onChange({ ...parts, period: event.target.value as NotificationSendTime12HourParts["period"] })
          }
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter") {
              keyEvent.preventDefault();
              onEnter?.();
            }
          }}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </fieldset>
  );
}

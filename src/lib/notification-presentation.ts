export type NotificationAudience = "staff" | "hr" | "accounts" | "provider";

export const EMAIL_SETTINGS_PATH = "/admin/settings/email";
export const EMAIL_TEMPLATES_PATH = "/admin/settings/email/templates";

export const DEADLINE_REMINDER_OFFSET_MIN_MINUTES = 5;
export const DEADLINE_REMINDER_OFFSET_MAX_MINUTES = 240;

const WALL_CLOCK_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** Normalizes HH:mm or HH:mm:ss into HH:mm for `<input type="time">`. */
export function notificationSendTimeToFormValue(value: string | null): string {
  if (!value) {
    return "08:00";
  }

  const match = WALL_CLOCK_TIME_PATTERN.exec(value.trim());

  if (!match) {
    return value.slice(0, 5);
  }

  const hours = match[1].padStart(2, "0");
  const minutes = match[2];

  return `${hours}:${minutes}`;
}

export function parseNotificationSendTimeForSave(value: string): string | null {
  const trimmed = value.trim();
  const match = WALL_CLOCK_TIME_PATTERN.exec(trimmed);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function isEditableStaffNotificationTiming(eventKey: string): boolean {
  return eventKey === "staff.today_menu" || eventKey === "staff.deadline_reminder";
}

export function isValidDeadlineReminderOffsetDraft(value: string): boolean {
  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isInteger(parsed)) {
    return false;
  }

  return (
    parsed >= DEADLINE_REMINDER_OFFSET_MIN_MINUTES &&
    parsed <= DEADLINE_REMINDER_OFFSET_MAX_MINUTES
  );
}

export function parseDeadlineReminderOffsetDraft(value: string): number | null {
  if (!isValidDeadlineReminderOffsetDraft(value)) {
    return null;
  }

  return Number.parseInt(value.trim(), 10);
}

export function isValidNotificationSendTimeDraft(value: string): boolean {
  return parseNotificationSendTimeForSave(value) !== null;
}

export type NotificationSendTime12HourParts = {
  hour: string;
  minute: string;
  period: "AM" | "PM";
};

export function notificationSendTimePartsFrom24Hour(
  value: string | null,
): NotificationSendTime12HourParts {
  const normalized = notificationSendTimeToFormValue(value);
  const [hourText, minuteText] = normalized.split(":");
  const hour24 = Number(hourText);
  const minute = minuteText.padStart(2, "0");

  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) {
    return { hour: "08", minute: "00", period: "AM" };
  }

  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;

  if (hour12 === 0) {
    hour12 = 12;
  }

  return {
    hour: hour12.toString().padStart(2, "0"),
    minute,
    period,
  };
}

export function composeNotificationSendTime24Hour(
  parts: NotificationSendTime12HourParts,
): string | null {
  const hour12 = Number.parseInt(parts.hour, 10);
  const minute = Number.parseInt(parts.minute, 10);

  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12) {
    return null;
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (parts.period !== "AM" && parts.period !== "PM") {
    return null;
  }

  let hour24: number;

  if (parts.period === "AM") {
    hour24 = hour12 === 12 ? 0 : hour12;
  } else {
    hour24 = hour12 === 12 ? 12 : hour12 + 12;
  }

  return `${hour24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00`;
}

export function notificationSendTimeDraftFromParts(
  parts: NotificationSendTime12HourParts,
): string | null {
  const composed = composeNotificationSendTime24Hour(parts);

  if (!composed) {
    return null;
  }

  return composed.slice(0, 5);
}

export const NOTIFICATION_SEND_TIME_HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) =>
  (index + 1).toString().padStart(2, "0"),
);

export const NOTIFICATION_SEND_TIME_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) =>
  index.toString().padStart(2, "0"),
);

export function formatNotificationTimingLabel(input: {
  timingMode: string;
  timingConfigurable: boolean;
  sendTime: string | null;
  minutesBeforeDeadline: number | null;
}): string {
  if (!input.timingConfigurable || input.timingMode === "immediate") {
    return "Immediately";
  }

  if (input.timingMode === "time_of_day" && input.sendTime) {
    const [hour, minute] = input.sendTime.split(":");
    const date = new Date(`1970-01-01T${hour}:${minute}:00`);
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Jamaica",
    }).format(date);
    return formatted;
  }

  if (input.timingMode === "minutes_before_deadline" && input.minutesBeforeDeadline) {
    return `${input.minutesBeforeDeadline} minutes before deadline`;
  }

  return "Immediately";
}

export function notificationTemplateEditPath(eventKey: string): string {
  return `${EMAIL_TEMPLATES_PATH}/${encodeURIComponent(eventKey)}`;
}

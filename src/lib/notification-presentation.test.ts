import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  composeNotificationSendTime24Hour,
  formatNotificationTimingLabel,
  isEditableStaffNotificationTiming,
  isValidDeadlineReminderOffsetDraft,
  isValidNotificationSendTimeDraft,
  notificationSendTimeDraftFromParts,
  notificationSendTimePartsFrom24Hour,
  notificationSendTimeToFormValue,
  parseNotificationSendTimeForSave,
} from "./notification-presentation";
import { canManageNotificationSettings } from "./roles";

describe("notification presentation", () => {
  it("formats timing labels for admin tables", () => {
    assert.equal(
      formatNotificationTimingLabel({
        timingMode: "immediate",
        timingConfigurable: false,
        sendTime: null,
        minutesBeforeDeadline: null,
      }),
      "Immediately",
    );
    assert.match(
      formatNotificationTimingLabel({
        timingMode: "time_of_day",
        timingConfigurable: true,
        sendTime: "08:00:00",
        minutesBeforeDeadline: null,
      }),
      /8:00/,
    );
    assert.doesNotMatch(
      formatNotificationTimingLabel({
        timingMode: "time_of_day",
        timingConfigurable: true,
        sendTime: "08:00:00",
        minutesBeforeDeadline: null,
      }),
      /Jamaica/i,
    );
    assert.equal(
      formatNotificationTimingLabel({
        timingMode: "minutes_before_deadline",
        timingConfigurable: true,
        sendTime: null,
        minutesBeforeDeadline: 30,
      }),
      "30 minutes before deadline",
    );
  });

  it("normalizes send time for forms and server validation", () => {
    assert.equal(notificationSendTimeToFormValue("08:00:00"), "08:00");
    assert.equal(parseNotificationSendTimeForSave("09:30"), "09:30:00");
    assert.equal(parseNotificationSendTimeForSave("bad"), null);
    assert.equal(isValidNotificationSendTimeDraft("08:00"), true);
    assert.equal(isValidNotificationSendTimeDraft("invalid"), false);
    assert.equal(isValidDeadlineReminderOffsetDraft("30"), true);
    assert.equal(isValidDeadlineReminderOffsetDraft("4"), false);
    assert.equal(isValidDeadlineReminderOffsetDraft("241"), false);
  });

  it("converts 12-hour send time parts to and from 24-hour values", () => {
    assert.deepEqual(notificationSendTimePartsFrom24Hour("16:00:00"), {
      hour: "04",
      minute: "00",
      period: "PM",
    });
    assert.equal(
      composeNotificationSendTime24Hour({ hour: "04", minute: "00", period: "PM" }),
      "16:00:00",
    );
    assert.equal(
      composeNotificationSendTime24Hour({ hour: "08", minute: "30", period: "AM" }),
      "08:30:00",
    );
    assert.equal(
      composeNotificationSendTime24Hour({ hour: "12", minute: "00", period: "AM" }),
      "00:00:00",
    );
    assert.equal(
      composeNotificationSendTime24Hour({ hour: "12", minute: "00", period: "PM" }),
      "12:00:00",
    );
    assert.equal(
      notificationSendTimeDraftFromParts({ hour: "04", minute: "00", period: "PM" }),
      "16:00",
    );
  });

  it("marks only staff V1 timing events as editable", () => {
    assert.equal(isEditableStaffNotificationTiming("staff.today_menu"), true);
    assert.equal(isEditableStaffNotificationTiming("staff.deadline_reminder"), true);
    assert.equal(isEditableStaffNotificationTiming("staff.order_submitted"), false);
    assert.equal(isEditableStaffNotificationTiming("provider.daily_summary"), false);
    assert.equal(
      formatNotificationTimingLabel({
        eventKey: "provider.daily_order_summary",
        timingMode: "immediate",
        timingConfigurable: false,
        sendTime: "08:30:00",
        minutesBeforeDeadline: null,
      }),
      "After normal staff ordering cutoff",
    );
  });

  it("restricts notification settings administration to Admin and Owner", () => {
    assert.equal(canManageNotificationSettings("admin"), true);
    assert.equal(canManageNotificationSettings("owner"), true);
    assert.equal(canManageNotificationSettings("hr"), false);
    assert.equal(canManageNotificationSettings("accounts"), false);
  });

  it("wires admin email settings and staff preferences UI", () => {
    const emailPage = readFileSync(
      new URL("../app/admin/settings/email/page.tsx", import.meta.url),
      "utf8",
    );
    const workspace = readFileSync(
      new URL("../components/admin/email-settings-workspace.tsx", import.meta.url),
      "utf8",
    );
    const timingEditor = readFileSync(
      new URL("../components/admin/notification-timing-editor.tsx", import.meta.url),
      "utf8",
    );
    const todayMenuSendTimeRows = readFileSync(
      new URL("../components/admin/today-menu-send-time-event-rows.tsx", import.meta.url),
      "utf8",
    );
    const sendTimeSelector = readFileSync(
      new URL("../components/admin/notification-send-time-selector.tsx", import.meta.url),
      "utf8",
    );
    const timingSaveButton = readFileSync(
      new URL("../components/admin/notification-timing-save-button.tsx", import.meta.url),
      "utf8",
    );
    const staffCard = readFileSync(
      new URL("../components/account/staff-email-preferences-card.tsx", import.meta.url),
      "utf8",
    );
    const accountPage = readFileSync(
      new URL("../app/account/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(emailPage, /requireAdminOrOwner/);
    assert.match(emailPage, /Email Settings/);
    assert.match(workspace, /Staff Notifications/);
    assert.match(workspace, /Operational Notifications/);
    assert.match(workspace, /System Email/);
    assert.match(workspace, /personal preference/);
    assert.doesNotMatch(timingEditor, /type="time"/);
    assert.match(workspace, /TodayMenuSendTimeEventRows/);
    assert.match(workspace, /staff\.today_menu/);
    assert.match(todayMenuSendTimeRows, /Change/);
    assert.doesNotMatch(todayMenuSendTimeRows, /NotificationSendTimeDrawer/);
    assert.doesNotMatch(todayMenuSendTimeRows, /AdminSlideOver/);
    assert.match(todayMenuSendTimeRows, /colSpan=\{5\}/);
    assert.match(todayMenuSendTimeRows, /Set Today&apos;s Menu send time/);
    assert.match(todayMenuSendTimeRows, /NotificationSendTimeSelector/);
    assert.match(todayMenuSendTimeRows, /Save time/);
    assert.match(todayMenuSendTimeRows, /Cancel/);
    assert.match(todayMenuSendTimeRows, /aria-live="polite"/);
    assert.match(todayMenuSendTimeRows, /aria-expanded=\{expanded\}/);
    assert.match(todayMenuSendTimeRows, /updateNotificationGlobalSettingAction/);
    assert.match(todayMenuSendTimeRows, /TIMING_SAVED_FEEDBACK_MS/);
    assert.match(sendTimeSelector, /<select/);
    assert.doesNotMatch(sendTimeSelector, /inputClassName/);
    assert.doesNotMatch(sendTimeSelector, /className=\{inputClassName/);
    assert.match(sendTimeSelector, /sendTimeSelectClassName/);
    assert.match(sendTimeSelector, /shrink-0/);
    assert.match(sendTimeSelector, /w-\[4\.25rem\]/);
    assert.match(sendTimeSelector, /w-\[4\.75rem\]/);
    assert.doesNotMatch(workspace, /Jamaica/i);
    assert.match(workspace, /ToggleSwitch/);
    assert.match(workspace, /linkButtonClass\("secondary"\)/);
    assert.match(workspace, /Email templates/);
    assert.match(workspace, /table-fixed/);
    assert.match(workspace, /NotificationEventsColGroup/);
    assert.match(workspace, /NotificationTimingEditor/);
    assert.match(workspace, /enabledBaselineByKey/);
    assert.match(workspace, /pendingToggleKeys/);
    assert.doesNotMatch(workspace, /enabledOverrideByKey/);
    assert.doesNotMatch(workspace, /router\.refresh\(\)/);
    assert.match(workspace, /togglePending/);
    assert.doesNotMatch(workspace, /Notification setting updated\./);
    assert.doesNotMatch(workspace, /Timing saved\./);
    assert.match(workspace, /editableStaffTiming/);
    assert.match(workspace, /FormActionStatus/);
    assert.doesNotMatch(timingEditor, /NotificationSendTimeTableCell/);
    assert.doesNotMatch(timingEditor, /NotificationSendTimeDrawer/);
    assert.match(timingEditor, /DeadlineReminderTimingEditor/);
    assert.match(timingEditor, /NotificationTimingSaveButton/);
    assert.match(timingEditor, /value=\{draft\}/);
    assert.doesNotMatch(timingEditor, /onBlur=/);
    assert.match(timingSaveButton, /Saved ✓/);
    assert.match(timingSaveButton, /Saving…/);
    assert.match(timingEditor, /Minutes before deadline/);
    assert.doesNotMatch(timingEditor, /key=\{\`\$\{event\.event_key\}-\$\{persisted\}\`\}/);
    assert.match(timingEditor, /key=\{event\.event_key\}/);
    assert.match(timingEditor, /setBaseline\(draft\)/);
    assert.match(timingEditor, /phase === "saving" \|\| phase === "saved" \|\| isDirty/);
    assert.match(timingEditor, /useSavedPhaseReset/);
    assert.match(timingEditor, /TIMING_SAVED_FEEDBACK_MS/);
    assert.doesNotMatch(timingEditor, /text-muted">minutes<\/span>/);
    assert.doesNotMatch(timingEditor, /Jamaica/i);
    assert.match(timingSaveButton, /disabled=\{disabled \|\| isSaving \|\| isSaved\}/);
    assert.match(timingEditor, /TIMING_SAVED_FEEDBACK_MS = 2000/);
    assert.match(staffCard, /globally_disabled/);
    assert.match(staffCard, /role="switch"/);
    assert.match(accountPage, /StaffEmailPreferencesCard/);
  });
});

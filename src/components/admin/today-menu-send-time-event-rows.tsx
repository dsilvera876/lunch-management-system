"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { updateNotificationGlobalSettingAction } from "@/app/admin/settings/email/actions";
import { NotificationSendTimeSelector } from "@/components/admin/notification-send-time-selector";
import { TIMING_SAVED_FEEDBACK_MS } from "@/components/admin/notification-timing-editor";
import { Button, linkButtonClass } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  formatNotificationTimingLabel,
  notificationSendTimeDraftFromParts,
  notificationSendTimePartsFrom24Hour,
  notificationSendTimeToFormValue,
  notificationTemplateEditPath,
  parseNotificationSendTimeForSave,
  type NotificationSendTime12HourParts,
} from "@/lib/notification-presentation";
import type { AdminNotificationEventRow } from "@/lib/notification-server";

type RowProps = {
  event: AdminNotificationEventRow;
  globalEnabled: boolean;
  togglePending: boolean;
  toggleError: string | null;
  onToggle: (eventKey: string, nextEnabled: boolean) => void;
};

export function TodayMenuSendTimeEventRows({
  event,
  globalEnabled,
  togglePending,
  toggleError,
  onToggle,
}: RowProps) {
  const router = useRouter();
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const hourSelectRef = useRef<HTMLSelectElement>(null);
  const switchId = `notification-global-enabled-${event.event_key}`;

  const serverPersisted = notificationSendTimeToFormValue(event.send_time);
  const [displayPersisted, setDisplayPersisted] = useState(serverPersisted);
  const [expanded, setExpanded] = useState(false);
  const [draftParts, setDraftParts] = useState<NotificationSendTime12HourParts>(() =>
    notificationSendTimePartsFrom24Hour(serverPersisted),
  );
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const draft = notificationSendTimeDraftFromParts(draftParts);
  const isDirty = draft !== null && draft !== displayPersisted;
  const canSave = expanded && isDirty && draft !== null && savePhase === "idle";

  useEffect(() => {
    if (savePhase !== "saved") {
      return;
    }

    const timer = window.setTimeout(() => {
      setSavePhase("idle");
      setExpanded(false);
      changeButtonRef.current?.focus();
      router.refresh();
    }, TIMING_SAVED_FEEDBACK_MS);

    return () => window.clearTimeout(timer);
  }, [savePhase, router]);

  const formattedTime = formatNotificationTimingLabel({
    timingMode: event.timing_mode,
    timingConfigurable: event.timing_configurable,
    sendTime: `${displayPersisted}:00`,
    minutesBeforeDeadline: event.minutes_before_deadline,
  });

  function openEditor() {
    setDraftParts(notificationSendTimePartsFrom24Hour(displayPersisted));
    setError(null);
    setSavePhase("idle");
    setExpanded(true);
    window.requestAnimationFrame(() => {
      hourSelectRef.current?.focus();
    });
  }

  function cancelEditor() {
    setDraftParts(notificationSendTimePartsFrom24Hour(displayPersisted));
    setError(null);
    setSavePhase("idle");
    setExpanded(false);
    changeButtonRef.current?.focus();
  }

  function saveTime() {
    if (!canSave || !draft) {
      return;
    }

    const parsed = parseNotificationSendTimeForSave(draft);
    if (!parsed) {
      setError("Enter a valid send time.");
      return;
    }

    setError(null);
    setSavePhase("saving");

    startTransition(async () => {
      const result = await updateNotificationGlobalSettingAction({
        eventKey: event.event_key,
        enabled: globalEnabled,
        sendTime: draft,
      });

      if (!result.ok) {
        setSavePhase("idle");
        setError(result.error);
        return;
      }

      setDisplayPersisted(draft);
      setSavePhase("saved");
    });
  }

  const statusMessage =
    savePhase === "saving"
      ? "Saving send time."
      : savePhase === "saved"
        ? "Send time saved."
        : null;

  return (
    <Fragment>
      <tr className="border-b border-border/70">
        <td className="px-3 py-3 align-top font-medium">{event.display_name}</td>
        <td className="px-3 py-3 align-top text-muted">{event.description}</td>
        <td className="px-3 py-3 align-top">
          <div className="flex flex-col gap-1">
            <ToggleSwitch
              id={switchId}
              checked={globalEnabled}
              disabled={togglePending}
              label={`Globally enable ${event.display_name}`}
              onChange={(enabled) => onToggle(event.event_key, enabled)}
            />
            {toggleError ? (
              <FormActionStatus variant="error" className="max-w-[12rem] text-xs">
                {toggleError}
              </FormActionStatus>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground">{formattedTime}</span>
            <Button
              ref={changeButtonRef}
              type="button"
              variant="secondary"
              className="min-h-8 shrink-0 px-2.5 py-1 text-xs"
              aria-expanded={expanded}
              onClick={openEditor}
            >
              Change
            </Button>
          </div>
        </td>
        <td className="px-3 py-3 align-top">
          {event.has_template ? (
            <Link
              href={notificationTemplateEditPath(event.event_key)}
              className={linkButtonClass("ghost")}
            >
              Edit
            </Link>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
      </tr>

      {expanded ? (
        <tr className="border-b border-border/70">
          <td colSpan={5} className="px-3 py-0">
            <div
              className="my-2 rounded-lg border border-teal-200/80 bg-teal-50/50 px-4 py-4"
              role="region"
              aria-labelledby={`today-menu-send-time-heading-${event.event_key}`}
            >
              <h3
                id={`today-menu-send-time-heading-${event.event_key}`}
                className="text-sm font-semibold text-foreground"
              >
                Set Today&apos;s Menu send time
              </h3>
              <p className="mt-1 text-sm text-muted">
                Choose when staff will receive the Today&apos;s Menu email on eligible business
                days.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <NotificationSendTimeSelector
                  eventKey={`expanded-${event.event_key}`}
                  parts={draftParts}
                  hourSelectRef={hourSelectRef}
                  disabled={savePhase === "saving" || savePhase === "saved"}
                  onChange={(nextParts) => {
                    setDraftParts(nextParts);
                    setError(null);
                    if (savePhase === "saved") {
                      setSavePhase("idle");
                    }
                  }}
                  onEnter={saveTime}
                />
                <Button
                  type="button"
                  variant="primary"
                  className="min-h-9 shrink-0 px-3 py-1.5 text-sm"
                  disabled={!canSave && savePhase !== "saved"}
                  aria-busy={savePhase === "saving"}
                  aria-label={`Save send time for ${event.display_name}`}
                  onClick={saveTime}
                >
                  {savePhase === "saving"
                    ? "Saving…"
                    : savePhase === "saved"
                      ? "Saved ✓"
                      : "Save time"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-9 shrink-0 px-3 py-1.5 text-sm"
                  disabled={savePhase === "saving"}
                  aria-label="Cancel send time changes"
                  onClick={cancelEditor}
                >
                  Cancel
                </Button>
              </div>

              {statusMessage ? (
                <span className="sr-only" aria-live="polite">
                  {statusMessage}
                </span>
              ) : null}
              {error ? (
                <FormActionStatus variant="error" className="mt-3 text-sm">
                  {error}
                </FormActionStatus>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

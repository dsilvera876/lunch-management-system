"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateNotificationGlobalSettingAction } from "@/app/admin/settings/email/actions";
import {
  DEADLINE_REMINDER_OFFSET_MAX_MINUTES,
  DEADLINE_REMINDER_OFFSET_MIN_MINUTES,
  isValidDeadlineReminderOffsetDraft,
  parseDeadlineReminderOffsetDraft,
} from "@/lib/notification-presentation";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { inputClassName } from "@/components/ui/form-field";
import {
  NotificationTimingSaveButton,
  type TimingSavePhase,
} from "@/components/admin/notification-timing-save-button";
import type { AdminNotificationEventRow } from "@/lib/notification-server";

/** How long the Save button shows "Saved ✓" before returning to idle. */
export const TIMING_SAVED_FEEDBACK_MS = 2000;

type EditorProps = {
  event: AdminNotificationEventRow;
  persisted: string;
};

type Props = {
  event: AdminNotificationEventRow;
};

function useSavedPhaseReset(
  phase: TimingSavePhase,
  setPhase: (phase: TimingSavePhase) => void,
  onComplete?: () => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (phase !== "saved") {
      return;
    }

    timerRef.current = setTimeout(() => {
      setPhase("idle");
      onCompleteRef.current?.();
    }, TIMING_SAVED_FEEDBACK_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [phase, setPhase]);
}

function DeadlineReminderTimingEditor({ event, persisted }: EditorProps) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(persisted);
  const [draft, setDraft] = useState(persisted);
  const [phase, setPhase] = useState<TimingSavePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useSavedPhaseReset(phase, setPhase, () => {
    router.refresh();
  });

  const isDirty = draft !== baseline;
  const isValid = isValidDeadlineReminderOffsetDraft(draft);

  useEffect(() => {
    if (phase === "saving" || phase === "saved" || isDirty) {
      return;
    }

    if (baseline === persisted && draft === persisted) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync server props when editor is clean and idle
    setBaseline(persisted);
    setDraft(persisted);
  }, [persisted, phase, isDirty, baseline, draft]);
  const canSave = isDirty && isValid && phase !== "saving" && phase !== "saved";

  function save() {
    if (!canSave) {
      return;
    }

    const parsed = parseDeadlineReminderOffsetDraft(draft);
    if (parsed === null) {
      setError(
        `Enter a whole number between ${DEADLINE_REMINDER_OFFSET_MIN_MINUTES} and ${DEADLINE_REMINDER_OFFSET_MAX_MINUTES}.`,
      );
      return;
    }

    setError(null);
    setPhase("saving");

    startTransition(async () => {
      const result = await updateNotificationGlobalSettingAction({
        eventKey: event.event_key,
        enabled: event.global_enabled,
        minutesBeforeDeadline: parsed,
      });

      if (!result.ok) {
        setPhase("idle");
        setError(result.error);
        return;
      }

      setBaseline(draft);
      setPhase("saved");
    });
  }

  return (
    <div className="flex max-w-[16rem] flex-col gap-1">
      <label
        className="text-xs font-medium text-foreground"
        htmlFor={`notification-deadline-offset-${event.event_key}`}
      >
        Minutes before deadline
      </label>
      <div className="flex flex-nowrap items-center gap-2">
        <input
          type="number"
          id={`notification-deadline-offset-${event.event_key}`}
          min={DEADLINE_REMINDER_OFFSET_MIN_MINUTES}
          max={DEADLINE_REMINDER_OFFSET_MAX_MINUTES}
          step={1}
          inputMode="numeric"
          value={draft}
          className={`${inputClassName} w-16 max-w-[4.5rem] shrink-0 px-2 text-center tabular-nums`}
          aria-invalid={isDirty && !isValid}
          onChange={(changeEvent) => {
            setDraft(changeEvent.target.value);
            setError(null);
            if (phase === "saved") {
              setPhase("idle");
            }
          }}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Enter") {
              keyEvent.preventDefault();
              save();
            }
          }}
        />
        <NotificationTimingSaveButton
          phase={phase}
          disabled={!canSave}
          saveLabel={`Save deadline reminder offset for ${event.display_name}`}
          onSave={save}
        />
      </div>
      {error ? (
        <FormActionStatus variant="error" className="text-xs">
          {error}
        </FormActionStatus>
      ) : null}
    </div>
  );
}

export function NotificationTimingEditor({ event }: Props) {
  if (event.timing_mode === "minutes_before_deadline") {
    const persisted = String(event.minutes_before_deadline ?? 30);

    return (
      <DeadlineReminderTimingEditor
        key={event.event_key}
        event={event}
        persisted={persisted}
      />
    );
  }

  return null;
}

"use client";

import { useId, useState, useTransition } from "react";
import { setStaffNotificationPreferenceAction } from "@/app/account/notification-preferences-actions";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { FormActionStatus } from "@/components/ui/form-action-status";
import type { StaffNotificationPreferenceRow } from "@/lib/notification-server";

type Props = {
  preferences: StaffNotificationPreferenceRow[];
};

type RowStatus = { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function StaffEmailPreferencesCard({ preferences }: Props) {
  const [rows, setRows] = useState(preferences);
  const [statusByKey, setStatusByKey] = useState<Record<string, RowStatus>>({});
  const [, startTransition] = useTransition();
  const groupLegendId = useId();

  function updatePreference(eventKey: string, enabled: boolean) {
    setStatusByKey((current) => ({ ...current, [eventKey]: { kind: "saving" } }));

    startTransition(async () => {
      const result = await setStaffNotificationPreferenceAction({ eventKey, enabled });

      if (!result.ok) {
        setStatusByKey((current) => ({
          ...current,
          [eventKey]: { kind: "error", message: result.error },
        }));
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.event_key === eventKey ? { ...row, personal_enabled: enabled } : row,
        ),
      );
      setStatusByKey((current) => ({ ...current, [eventKey]: { kind: "saved" } }));
    });
  }

  return (
    <Card className="max-w-xl">
      <SectionHeader
        title="Email Notifications"
        description="Choose which lunch-related emails you would like to receive. Account and security emails are not affected."
      />

      <fieldset className="mt-2 border-0 p-0" aria-labelledby={groupLegendId}>
        <legend id={groupLegendId} className="sr-only">
          Email notification preferences
        </legend>
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const switchId = `notification-pref-${row.event_key}`;
            const status = statusByKey[row.event_key];
            const statusId = `${switchId}-status`;

            return (
              <li
                key={row.event_key}
                className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 pr-4">
                  <p className="font-medium text-foreground">{row.display_name}</p>
                  <p className="mt-0.5 text-sm text-muted">{row.description}</p>
                  {row.globally_disabled ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Currently unavailable — this notification is disabled system-wide. Your
                      preference is saved and will apply if it is turned back on.
                    </p>
                  ) : null}
                  {status?.kind === "saved" ? (
                    <p id={statusId} className="mt-1 text-xs text-muted" role="status">
                      Saved
                    </p>
                  ) : null}
                  {status?.kind === "saving" ? (
                    <p id={statusId} className="mt-1 text-xs text-muted" aria-busy="true">
                      Saving…
                    </p>
                  ) : null}
                  {status?.kind === "error" ? (
                    <FormActionStatus
                      id={statusId}
                      variant="error"
                      className="mt-2 text-xs font-normal"
                    >
                      {status.message}
                    </FormActionStatus>
                  ) : null}
                </div>
                <label
                  htmlFor={switchId}
                  className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 py-1"
                >
                  <span className="text-sm text-muted">Receive email</span>
                  <input
                    id={switchId}
                    type="checkbox"
                    checked={row.personal_enabled}
                    aria-describedby={status ? statusId : undefined}
                    className="size-5 accent-primary"
                    onChange={(event) => updatePreference(row.event_key, event.target.checked)}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </Card>
  );
}

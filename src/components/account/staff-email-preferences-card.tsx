"use client";

import { useState, useTransition } from "react";
import { setStaffNotificationPreferenceAction } from "@/app/account/notification-preferences-actions";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import type { StaffNotificationPreferenceRow } from "@/lib/notification-server";

type Props = {
  preferences: StaffNotificationPreferenceRow[];
};

export function StaffEmailPreferencesCard({ preferences }: Props) {
  const [rows, setRows] = useState(preferences);
  const [statusByKey, setStatusByKey] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function updatePreference(eventKey: string, enabled: boolean) {
    setStatusByKey((current) => ({ ...current, [eventKey]: "Saving…" }));

    startTransition(async () => {
      const result = await setStaffNotificationPreferenceAction({ eventKey, enabled });

      if (!result.ok) {
        setStatusByKey((current) => ({ ...current, [eventKey]: result.error }));
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.event_key === eventKey ? { ...row, personal_enabled: enabled } : row,
        ),
      );
      setStatusByKey((current) => ({ ...current, [eventKey]: "Saved" }));
    });
  }

  return (
    <Card className="max-w-xl">
      <SectionHeader
        title="Email Notifications"
        description="Choose which lunch-related emails you would like to receive. Account and security emails are not affected."
      />

      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const switchId = `notification-pref-${row.event_key}`;
          const status = statusByKey[row.event_key];

          return (
            <li key={row.event_key} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 pr-4">
                <p className="font-medium text-foreground">{row.display_name}</p>
                <p className="mt-0.5 text-sm text-muted">{row.description}</p>
                {row.globally_disabled ? (
                  <p className="mt-1 text-xs text-amber-800">
                    Currently unavailable — this notification is disabled system-wide. Your
                    preference is saved and will apply if it is turned back on.
                  </p>
                ) : null}
                {status ? (
                  <p className="mt-1 text-xs text-muted" aria-live="polite">
                    {status}
                  </p>
                ) : null}
              </div>
              <label htmlFor={switchId} className="inline-flex shrink-0 items-center gap-2">
                <span className="text-sm text-muted">Receive email</span>
                <input
                  id={switchId}
                  type="checkbox"
                  role="switch"
                  checked={row.personal_enabled}
                  aria-label={`Receive email for ${row.display_name}`}
                  className="h-4 w-7 accent-primary"
                  onChange={(event) => updatePreference(row.event_key, event.target.checked)}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

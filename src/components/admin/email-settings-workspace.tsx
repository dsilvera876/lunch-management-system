"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { updateNotificationGlobalSettingAction } from "@/app/admin/settings/email/actions";
import { NotificationTimingEditor } from "@/components/admin/notification-timing-editor";
import { TodayMenuSendTimeEventRows } from "@/components/admin/today-menu-send-time-event-rows";
import { Card } from "@/components/ui/card";
import { Button, linkButtonClass } from "@/components/ui/button";
import {
  EMAIL_TEMPLATES_PATH,
  formatNotificationTimingLabel,
  notificationTemplateEditPath,
} from "@/lib/notification-presentation";
import { NOTIFICATION_EMAIL_DELIVERY_PATH } from "@/lib/notification-delivery";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import type { AdminNotificationEventRow } from "@/lib/notification-server";

type TabId = "staff" | "operational" | "system";

type Props = {
  staffEvents: AdminNotificationEventRow[];
  hrEvents: AdminNotificationEventRow[];
  accountsEvents: AdminNotificationEventRow[];
  providerEvents: AdminNotificationEventRow[];
  adminEvents: AdminNotificationEventRow[];
};

function NotificationEventsColGroup() {
  return (
    <colgroup>
      <col className="w-[17%]" />
      <col className="w-[36%]" />
      <col className="w-[13%]" />
      <col className="w-[24%]" />
      <col className="w-[10%]" />
    </colgroup>
  );
}

function NotificationEventsTableHead({ showTiming }: { showTiming: boolean }) {
  return (
    <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
      <tr>
        <th scope="col" className="px-3 py-2 font-semibold">
          Notification
        </th>
        <th scope="col" className="px-3 py-2 font-semibold">
          Description
        </th>
        <th scope="col" className="px-3 py-2 font-semibold">
          Global Enabled
        </th>
        {showTiming ? (
          <th scope="col" className="px-3 py-2 font-semibold">
            Timing
          </th>
        ) : null}
        <th scope="col" className="px-3 py-2 font-semibold">
          Template
        </th>
      </tr>
    </thead>
  );
}

function NotificationEventRow({
  event,
  showTiming,
  editableStaffTiming,
  globalEnabled,
  togglePending,
  toggleError,
  onToggle,
}: {
  event: AdminNotificationEventRow;
  showTiming: boolean;
  editableStaffTiming: boolean;
  globalEnabled: boolean;
  togglePending: boolean;
  toggleError: string | null;
  onToggle: (eventKey: string, nextEnabled: boolean) => void;
}) {
  const switchId = `notification-global-enabled-${event.event_key}`;

  return (
    <tr className="border-b border-border/70 last:border-0">
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
      {showTiming ? (
        <td className="px-3 py-3 align-top">
          {editableStaffTiming && event.event_key === "staff.deadline_reminder" ? (
            <NotificationTimingEditor event={event} />
          ) : (
            <span className="whitespace-nowrap text-muted">
              {formatNotificationTimingLabel({
                timingMode: event.timing_mode,
                timingConfigurable: event.timing_configurable,
                sendTime: event.send_time,
                minutesBeforeDeadline: event.minutes_before_deadline,
              })}
            </span>
          )}
        </td>
      ) : null}
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
  );
}

function EventTable({
  events,
  showTiming,
  editableStaffTiming,
  resolveGlobalEnabled,
  pendingToggleKeys,
  toggleErrors,
  onToggle,
}: {
  events: AdminNotificationEventRow[];
  showTiming: boolean;
  editableStaffTiming: boolean;
  resolveGlobalEnabled: (event: AdminNotificationEventRow) => boolean;
  pendingToggleKeys: Set<string>;
  toggleErrors: Record<string, string>;
  onToggle: (eventKey: string, nextEnabled: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] table-fixed text-left text-sm">
        <NotificationEventsColGroup />
        <NotificationEventsTableHead showTiming={showTiming} />
        <tbody>
          {events.map((event) => {
            if (editableStaffTiming && event.event_key === "staff.today_menu") {
              return (
                <TodayMenuSendTimeEventRows
                  key={`${event.event_key}-${event.send_time ?? ""}`}
                  event={event}
                  globalEnabled={resolveGlobalEnabled(event)}
                  togglePending={pendingToggleKeys.has(event.event_key)}
                  toggleError={toggleErrors[event.event_key] ?? null}
                  onToggle={onToggle}
                />
              );
            }

            return (
              <NotificationEventRow
                key={event.event_key}
                event={event}
                showTiming={showTiming}
                editableStaffTiming={editableStaffTiming}
                globalEnabled={resolveGlobalEnabled(event)}
                togglePending={pendingToggleKeys.has(event.event_key)}
                toggleError={toggleErrors[event.event_key] ?? null}
                onToggle={onToggle}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OperationalNotificationsPanel({
  hrEvents,
  accountsEvents,
  providerEvents,
  resolveGlobalEnabled,
  pendingToggleKeys,
  toggleErrors,
  onToggle,
}: {
  hrEvents: AdminNotificationEventRow[];
  accountsEvents: AdminNotificationEventRow[];
  providerEvents: AdminNotificationEventRow[];
  resolveGlobalEnabled: (event: AdminNotificationEventRow) => boolean;
  pendingToggleKeys: Set<string>;
  toggleErrors: Record<string, string>;
  onToggle: (eventKey: string, nextEnabled: boolean) => void;
}) {
  const sections = [
    { title: "HR Notifications", events: hrEvents },
    { title: "Accounts Notifications", events: accountsEvents },
    { title: "Provider Notifications", events: providerEvents },
  ].filter((section) => section.events.length > 0);

  if (sections.length === 0) {
    return null;
  }

  return (
    <Card padding="md" className="shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] table-fixed text-left text-sm">
          <NotificationEventsColGroup />
          <NotificationEventsTableHead showTiming />
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.title}>
                <tr className="border-b border-border bg-slate-50/80">
                  <th
                    scope="colgroup"
                    colSpan={5}
                    className="px-3 py-2.5 text-left text-sm font-semibold text-foreground"
                  >
                    {section.title}
                  </th>
                </tr>
                {section.events.map((event) => (
                  <NotificationEventRow
                    key={event.event_key}
                    event={event}
                    showTiming
                    editableStaffTiming={false}
                    globalEnabled={resolveGlobalEnabled(event)}
                    togglePending={pendingToggleKeys.has(event.event_key)}
                    toggleError={toggleErrors[event.event_key] ?? null}
                    onToggle={onToggle}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function buildEnabledBaseline(events: AdminNotificationEventRow[]): Record<string, boolean> {
  return Object.fromEntries(events.map((event) => [event.event_key, event.global_enabled]));
}

function AdminTechnicalNotificationsPanel({
  adminEvents,
  resolveGlobalEnabled,
  pendingToggleKeys,
  toggleErrors,
  onToggle,
}: {
  adminEvents: AdminNotificationEventRow[];
  resolveGlobalEnabled: (event: AdminNotificationEventRow) => boolean;
  pendingToggleKeys: Set<string>;
  toggleErrors: Record<string, string>;
  onToggle: (eventKey: string, nextEnabled: boolean) => void;
}) {
  if (adminEvents.length === 0) {
    return null;
  }

  return (
    <Card padding="md" className="shadow-sm">
      <p className="mb-4 text-sm text-muted">
        Technical alerts for Admin and Owner when outbound application email permanently fails.
        These are separate from HR operational lunch notifications.
      </p>
      <EventTable
        events={adminEvents}
        showTiming={false}
        editableStaffTiming={false}
        resolveGlobalEnabled={resolveGlobalEnabled}
        pendingToggleKeys={pendingToggleKeys}
        toggleErrors={toggleErrors}
        onToggle={onToggle}
      />
    </Card>
  );
}

export function EmailSettingsWorkspace({
  staffEvents,
  hrEvents,
  accountsEvents,
  providerEvents,
  adminEvents,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabId | null) ?? "staff";
  const allEvents = useMemo(
    () => [...staffEvents, ...hrEvents, ...accountsEvents, ...providerEvents, ...adminEvents],
    [staffEvents, hrEvents, accountsEvents, providerEvents, adminEvents],
  );
  const [enabledBaselineByKey, setEnabledBaselineByKey] = useState<Record<string, boolean>>(() =>
    buildEnabledBaseline(allEvents),
  );
  const [pendingToggleKeys, setPendingToggleKeys] = useState<Set<string>>(() => new Set());
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  function setTab(next: TabId) {
    router.replace(`/admin/settings/email?tab=${next}`);
  }

  function resolveGlobalEnabled(event: AdminNotificationEventRow): boolean {
    return enabledBaselineByKey[event.event_key] ?? event.global_enabled;
  }

  function handleToggle(eventKey: string, nextEnabled: boolean) {
    if (pendingToggleKeys.has(eventKey)) {
      return;
    }

    const previousEnabled = enabledBaselineByKey[eventKey] ?? false;

    if (previousEnabled === nextEnabled) {
      return;
    }

    setPendingToggleKeys((current) => new Set(current).add(eventKey));
    setEnabledBaselineByKey((current) => ({ ...current, [eventKey]: nextEnabled }));
    setToggleErrors((current) => {
      const next = { ...current };
      delete next[eventKey];
      return next;
    });

    startTransition(async () => {
      const result = await updateNotificationGlobalSettingAction({
        eventKey,
        enabled: nextEnabled,
      });

      setPendingToggleKeys((current) => {
        const next = new Set(current);
        next.delete(eventKey);
        return next;
      });

      if (!result.ok) {
        setEnabledBaselineByKey((current) => ({ ...current, [eventKey]: previousEnabled }));
        setToggleErrors((current) => ({ ...current, [eventKey]: result.error }));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        {(
          [
            ["staff", "Staff Notifications"],
            ["operational", "Operational Notifications"],
            ["system", "System Email"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            variant={tab === id ? "primary" : "ghost"}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          <Link href={NOTIFICATION_EMAIL_DELIVERY_PATH} className={linkButtonClass("secondary")}>
            Email Delivery
          </Link>
          <Link href={EMAIL_TEMPLATES_PATH} className={linkButtonClass("secondary")}>
            Email templates
          </Link>
        </div>
      </div>

      {tab === "staff" ? (
        <Card padding="md" className="shadow-sm">
          <p className="mb-4 text-sm text-muted">
            Staff can individually opt in or out of these emails from their Preferences.
            Turning a notification off here disables it for everyone without changing their
            personal preference.
          </p>
          <EventTable
            events={staffEvents}
            showTiming
            editableStaffTiming
            resolveGlobalEnabled={resolveGlobalEnabled}
            pendingToggleKeys={pendingToggleKeys}
            toggleErrors={toggleErrors}
            onToggle={handleToggle}
          />
        </Card>
      ) : null}

      {tab === "operational" ? (
        <OperationalNotificationsPanel
          hrEvents={hrEvents}
          accountsEvents={accountsEvents}
          providerEvents={providerEvents}
          resolveGlobalEnabled={resolveGlobalEnabled}
          pendingToggleKeys={pendingToggleKeys}
          toggleErrors={toggleErrors}
          onToggle={handleToggle}
        />
      ) : null}

      {tab === "system" ? (
        <div className="space-y-4">
          <AdminTechnicalNotificationsPanel
            adminEvents={adminEvents}
            resolveGlobalEnabled={resolveGlobalEnabled}
            pendingToggleKeys={pendingToggleKeys}
            toggleErrors={toggleErrors}
            onToggle={handleToggle}
          />
          <Card padding="md" className="shadow-sm">
            <p className="text-sm text-muted">
              System and account emails are separate from optional lunch notifications.
              Authentication emails (invitations, verification, password reset) always send when
              required and are not controlled by lunch notification preferences.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/admin/settings/email-delivery" className={linkButtonClass("primary")}>
                Configure SMTP delivery
              </Link>
              <Link href="/admin/settings/authentication" className={linkButtonClass("secondary")}>
                Authentication settings
              </Link>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

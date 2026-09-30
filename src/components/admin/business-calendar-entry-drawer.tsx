"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  previewBusinessCalendarEntryImpactAction,
  saveBusinessCalendarEntry,
} from "@/app/admin/settings/business-calendar/actions";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { BusinessCalendarImpactWarning } from "@/components/admin/business-calendar-ui";
import { Button } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import {
  BUSINESS_CALENDAR_DRAWER_ACTIONS,
  BUSINESS_CALENDAR_ENTRY_TYPE_OPTIONS,
  type BusinessCalendarEntryRow,
  type BusinessCalendarEntryType,
  type BusinessCalendarScope,
} from "@/lib/business-calendar-presentation";
import type { BusinessCalendarEntryImpact } from "@/lib/business-calendar-server";
import type { OfficeLocationRecord } from "@/lib/office-locations-presentation";

type Props = {
  open: boolean;
  onClose: () => void;
  entry: BusinessCalendarEntryRow | null;
  locations: OfficeLocationRecord[];
  readOnly: boolean;
};

const fieldClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm";

function isImpactConfirmationRequired(message: string): boolean {
  return message.includes("CALENDAR_IMPACT_CONFIRMATION_REQUIRED");
}

export function BusinessCalendarEntryDrawer({
  open,
  onClose,
  entry,
  locations,
  readOnly,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const impactWarningRef = useRef<HTMLDivElement>(null);
  const lastImpactScrollKey = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<BusinessCalendarEntryImpact | null>(null);

  const title = entry ? "Edit Calendar Entry" : "Add Calendar Entry";
  const formKey = entry?.id ?? "new";

  const initialScope = (entry?.scope ?? "global") as BusinessCalendarScope;
  const initialEntryType = (entry?.entry_type ?? "override_open") as BusinessCalendarEntryType;
  const initialNotes = entry?.notes ?? "";

  const [scope, setScope] = useState<BusinessCalendarScope>(initialScope);
  const [entryType, setEntryType] = useState<BusinessCalendarEntryType>(initialEntryType);
  const [notes, setNotes] = useState(initialNotes);

  const confirmationRequired = Boolean(impact?.requires_confirmation);

  const typeHelp = useMemo(
    () =>
      BUSINESS_CALENDAR_ENTRY_TYPE_OPTIONS.find((option) => option.value === entryType)
        ?.description ?? "",
    [entryType],
  );

  function handleClose() {
    setImpact(null);
    setError(null);
    lastImpactScrollKey.current = null;
    onClose();
  }

  useEffect(() => {
    if (!confirmationRequired || !impact) {
      lastImpactScrollKey.current = null;
      return;
    }

    const scrollKey = `${impact.lunch_day_count}:${impact.submitted_order_count}:${impact.summary ?? ""}`;

    if (lastImpactScrollKey.current === scrollKey) {
      return;
    }

    lastImpactScrollKey.current = scrollKey;
    const node = impactWarningRef.current;

    if (!node) {
      return;
    }

    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    node.focus({ preventScroll: true });
  }, [confirmationRequired, impact]);

  async function persistEntry(acknowledgeImpact: boolean) {
    const form = formRef.current;

    if (!form) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData(form);

      if (!acknowledgeImpact) {
        const preview = await previewBusinessCalendarEntryImpactAction(formData);

        if (preview.requires_confirmation) {
          setImpact(preview);
          return;
        }
      }

      formData.set("acknowledgeImpact", acknowledgeImpact ? "true" : "false");
      await saveBusinessCalendarEntry(formData);
      handleClose();
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Unable to save entry";

      if (!acknowledgeImpact && isImpactConfirmationRequired(message)) {
        const formData = new FormData(form);
        const preview = await previewBusinessCalendarEntryImpactAction(formData);
        setImpact(preview);
        return;
      }

      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (readOnly) {
      return;
    }

    await persistEntry(false);
  }

  if (!open) {
    return null;
  }

  return (
    <AdminSlideOver
      open={open}
      title={title}
      onClose={handleClose}
      footer={
        readOnly ? (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {confirmationRequired && impact ? (
              <div ref={impactWarningRef} tabIndex={-1} className="outline-none">
                <BusinessCalendarImpactWarning
                  lunchDayCount={impact.lunch_day_count}
                  submittedOrderCount={impact.submitted_order_count}
                />
              </div>
            ) : null}

            {error ? (
              <FormActionStatus variant="error" className="font-normal">
                {error}
              </FormActionStatus>
            ) : null}

            <div className="flex justify-end gap-2">
              {confirmationRequired ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => setImpact(null)}
                  >
                    {BUSINESS_CALENDAR_DRAWER_ACTIONS.goBack}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={saving}
                    onClick={() => void persistEntry(true)}
                  >
                    {BUSINESS_CALENDAR_DRAWER_ACTIONS.confirmSave}
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>
                    {BUSINESS_CALENDAR_DRAWER_ACTIONS.cancel}
                  </Button>
                  <Button
                    type="submit"
                    form="business-calendar-entry-form"
                    variant="primary"
                    disabled={saving}
                  >
                    {BUSINESS_CALENDAR_DRAWER_ACTIONS.save}
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      }
    >
      <form
        key={formKey}
        ref={formRef}
        id="business-calendar-entry-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="calendarDate">
            Date *
          </label>
          <input
            id="calendarDate"
            name="calendarDate"
            type="date"
            required
            readOnly={readOnly}
            defaultValue={entry?.calendar_date ?? ""}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="entryType">
            Type *
          </label>
          <select
            id="entryType"
            name="entryType"
            required
            disabled={readOnly}
            defaultValue={initialEntryType}
            onChange={(event) => setEntryType(event.target.value as BusinessCalendarEntryType)}
            className={fieldClass}
          >
            {BUSINESS_CALENDAR_ENTRY_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {typeHelp ? <p className="mt-1 text-xs text-muted">{typeHelp}</p> : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Scope *</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              value="global"
              defaultChecked={initialScope === "global"}
              disabled={readOnly}
              onChange={() => setScope("global")}
            />
            Company-wide
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              value="location"
              defaultChecked={initialScope === "location"}
              disabled={readOnly}
              onChange={() => setScope("location")}
            />
            Specific location
          </label>
        </fieldset>

        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="officeLocationId">
            Location
          </label>
          <select
            id="officeLocationId"
            name="officeLocationId"
            disabled={readOnly || scope !== "location"}
            defaultValue={entry?.office_location_id ?? ""}
            className={fieldClass}
          >
            <option value="">Select location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Only required when scope is Specific location.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="name">
            Event name *
          </label>
          <input
            id="name"
            name="name"
            required
            readOnly={readOnly}
            defaultValue={entry?.name ?? ""}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={500}
            readOnly={readOnly}
            defaultValue={initialNotes}
            onChange={(event) => setNotes(event.target.value)}
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-muted">{notes.length}/500</p>
        </div>
      </form>
    </AdminSlideOver>
  );
}

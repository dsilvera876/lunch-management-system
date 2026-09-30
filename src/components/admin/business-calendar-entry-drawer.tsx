"use client";

import { useMemo, useRef, useState } from "react";
import {
  previewBusinessCalendarEntryImpactAction,
  saveBusinessCalendarEntry,
} from "@/app/admin/settings/business-calendar/actions";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  BUSINESS_CALENDAR_ENTRY_TYPE_OPTIONS,
  type BusinessCalendarEntryRow,
  type BusinessCalendarEntryType,
  type BusinessCalendarScope,
} from "@/lib/business-calendar-presentation";
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

export function BusinessCalendarEntryDrawer({
  open,
  onClose,
  entry,
  locations,
  readOnly,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impactSummary, setImpactSummary] = useState<string | null>(null);

  const title = entry ? "Edit Calendar Entry" : "Add Calendar Entry";
  const formKey = entry?.id ?? "new";

  const initialScope = (entry?.scope ?? "global") as BusinessCalendarScope;
  const initialEntryType = (entry?.entry_type ?? "override_open") as BusinessCalendarEntryType;
  const initialNotes = entry?.notes ?? "";

  const [scope, setScope] = useState<BusinessCalendarScope>(initialScope);
  const [entryType, setEntryType] = useState<BusinessCalendarEntryType>(initialEntryType);
  const [notes, setNotes] = useState(initialNotes);

  const typeHelp = useMemo(
    () =>
      BUSINESS_CALENDAR_ENTRY_TYPE_OPTIONS.find((option) => option.value === entryType)
        ?.description ?? "",
    [entryType],
  );

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
        const impact = await previewBusinessCalendarEntryImpactAction(formData);

        if (impact.requires_confirmation && impact.summary) {
          setImpactSummary(impact.summary);
          return;
        }
      }

      formData.set("acknowledgeImpact", acknowledgeImpact ? "true" : "false");
      await saveBusinessCalendarEntry(formData);
      setImpactSummary(null);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save entry");
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
      onClose={onClose}
      footer={
        readOnly ? (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="business-calendar-entry-form" variant="primary" disabled={saving}>
              Save Entry
            </Button>
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

        {impactSummary ? (
          <Alert variant="warning">
            <p>{impactSummary}</p>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setImpactSummary(null)}>
                Go back
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={saving}
                onClick={() => void persistEntry(true)}
              >
                Confirm and save
              </Button>
            </div>
          </Alert>
        ) : null}

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

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </AdminSlideOver>
  );
}

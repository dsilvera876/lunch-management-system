"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  createOfficeLocationInline,
  deleteUnusedOfficeLocationInline,
  toggleOfficeLocationActiveInline,
  updateOfficeLocationInline,
} from "@/app/admin/locations/actions";
import {
  OFFICE_LOCATIONS_SUCCESS_TOAST_DURATION_MS,
  OFFICE_LOCATIONS_TOAST,
  isOfficeLocationDeleteBlockedMessage,
  officeLocationDeleteErrorMessage,
  officeLocationMutationErrorMessage,
  type OfficeLocationRecord,
} from "@/lib/office-locations-presentation";
import { Button } from "@/components/ui/button";
import { FormField, inputClassName, textareaClassName } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";

export type OfficeLocationEditorMode = "add" | "edit";

type Props = {
  editingLocation: OfficeLocationRecord | null;
  onCancelEdit: () => void;
  onLocationCreated: (location: OfficeLocationRecord) => void;
  onLocationUpdated: (location: OfficeLocationRecord) => void;
  onLocationDeleted: (locationId: string) => void;
};

const DELETE_CONFIRM_MESSAGE =
  "Delete this office location permanently? This action cannot be undone.";

export function OfficeLocationsEditorPanel({
  editingLocation,
  onCancelEdit,
  onLocationCreated,
  onLocationUpdated,
  onLocationDeleted,
}: Props) {
  const { showToast } = useToast();
  const mode: OfficeLocationEditorMode = editingLocation ? "edit" : "add";
  const [addSession, setAddSession] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formKey = editingLocation?.id ?? `add-${addSession}`;

  function resetToAddMode() {
    setError(null);
    setAddSession((current) => current + 1);
    onCancelEdit();
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createOfficeLocationInline(formData);

      if (result.success) {
        setError(null);
        onLocationCreated(result.location);
        setAddSession((current) => current + 1);
        showToast({
          title: OFFICE_LOCATIONS_TOAST.created,
          durationMs: OFFICE_LOCATIONS_SUCCESS_TOAST_DURATION_MS,
        });
        return;
      }

      setError(officeLocationMutationErrorMessage(result.error, "add"));
    });
  }

  function handleUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLocation) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateOfficeLocationInline(formData);

      if (result.success) {
        setError(null);
        onLocationUpdated(result.location);
        showToast({
          title: OFFICE_LOCATIONS_TOAST.updated,
          durationMs: OFFICE_LOCATIONS_SUCCESS_TOAST_DURATION_MS,
        });
        resetToAddMode();
        return;
      }

      setError(officeLocationMutationErrorMessage(result.error, "edit"));
    });
  }

  function handleToggleActive() {
    if (!editingLocation) {
      return;
    }

    const location = editingLocation;

    startTransition(async () => {
      const result = await toggleOfficeLocationActiveInline(
        location.id,
        location.is_active,
      );

      if (result.success) {
        setError(null);
        onLocationUpdated(result.location);
        showToast({
          title: result.location.is_active
            ? OFFICE_LOCATIONS_TOAST.activated
            : OFFICE_LOCATIONS_TOAST.deactivated,
          durationMs: OFFICE_LOCATIONS_SUCCESS_TOAST_DURATION_MS,
        });
        return;
      }

      setError(officeLocationMutationErrorMessage(result.error, "edit"));
    });
  }

  function handleDeletePermanently() {
    if (!editingLocation) {
      return;
    }

    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) {
      return;
    }

    const locationId = editingLocation.id;

    startTransition(async () => {
      const result = await deleteUnusedOfficeLocationInline(locationId);

      if (result.success) {
        setError(null);
        onLocationDeleted(locationId);
        showToast({
          title: OFFICE_LOCATIONS_TOAST.deleted,
          durationMs: OFFICE_LOCATIONS_SUCCESS_TOAST_DURATION_MS,
        });
        resetToAddMode();
        return;
      }

      setError(officeLocationDeleteErrorMessage(result.error));
    });
  }

  const errorIsDeleteBlocked =
    error !== null && isOfficeLocationDeleteBlockedMessage(error);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm border-t-4 border-t-primary/45">
      <div className="border-b border-border/80 px-4 py-2.5">
        <h2 className="text-base font-semibold text-foreground">
          {mode === "add" ? "Add location" : "Edit location"}
        </h2>
      </div>

      <div className="space-y-4 p-4">
        <form
          key={formKey}
          className="space-y-4"
          onSubmit={mode === "add" ? handleCreateSubmit : handleUpdateSubmit}
        >
          {mode === "edit" && editingLocation ? (
            <input type="hidden" name="id" value={editingLocation.id} />
          ) : null}

          <FormField label="Name" htmlFor={`location-name-${formKey}`}>
            <input
              id={`location-name-${formKey}`}
              name="name"
              required
              defaultValue={editingLocation?.name ?? ""}
              className={inputClassName}
            />
          </FormField>
          <FormField label="Address" htmlFor={`location-address-${formKey}`}>
            <input
              id={`location-address-${formKey}`}
              name="address"
              defaultValue={editingLocation?.address ?? ""}
              className={inputClassName}
            />
          </FormField>
          <FormField label="Description" htmlFor={`location-description-${formKey}`}>
            <textarea
              id={`location-description-${formKey}`}
              name="description"
              rows={3}
              defaultValue={editingLocation?.description ?? ""}
              className={textareaClassName}
            />
          </FormField>

          {error && !errorIsDeleteBlocked ? (
            <p className="text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {mode === "add" ? (
            <Button type="submit" variant="primary" disabled={isPending} className="w-full">
              {isPending ? "Creating…" : "Create location"}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button type="submit" variant="primary" disabled={isPending} className="w-full">
                {isPending ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                className="w-full"
                onClick={resetToAddMode}
              >
                Cancel editing
              </Button>
            </div>
          )}
        </form>

        {mode === "edit" && editingLocation ? (
          <>
            <div className="rounded-xl border border-border/80 bg-slate-50/40 p-4">
              <p className="text-sm font-semibold text-foreground">Location status</p>
              <p className="mt-1 text-sm text-muted">
                {editingLocation.is_active
                  ? "Active locations can be selected for new lunch orders."
                  : "Inactive locations cannot be used for new orders. Historical orders keep their snapshot."}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full sm:w-auto"
                disabled={isPending}
                onClick={handleToggleActive}
              >
                {editingLocation.is_active
                  ? "Deactivate location"
                  : "Activate location"}
              </Button>
            </div>

            <div className="rounded-xl border border-border/80 bg-slate-50/40 p-4">
              <p className="text-sm font-semibold text-foreground">Permanent deletion</p>
              <p className="mt-1 text-sm text-muted">
                Remove this location only when it has never been used in orders or
                other operational history. Otherwise deactivate it.
              </p>
              {errorIsDeleteBlocked ? (
                <p className="mt-3 text-sm text-muted" role="status">
                  {error}
                </p>
              ) : null}
              <Button
                type="button"
                variant="danger"
                className="mt-3 w-full sm:w-auto"
                disabled={isPending}
                onClick={handleDeletePermanently}
              >
                Delete permanently
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

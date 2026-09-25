"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  createProviderMenuItemInline,
  deleteProviderMenuItemInline,
  toggleProviderMenuItemActiveInline,
  updateProviderMenuItemInline,
  type ProviderMenuItemDeleteError,
  type ProviderMenuItemMutationError,
} from "@/app/admin/providers/[id]/actions";
import { MenuItemFormFields } from "@/components/admin/lunch-providers/menu-item-form-fields";
import type { ManageMenuItemRecord } from "@/lib/lunch-providers-presentation";
import {
  MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
  MANAGE_MENU_TOAST,
} from "@/lib/manage-menu-form";
import { PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE } from "@/lib/unused-record-deletion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export type MenuItemEditorMode = "add" | "edit";

type Props = {
  providerId: string;
  editingItem: ManageMenuItemRecord | null;
  canDeletePermanently: boolean;
  onCancelEdit: () => void;
  onItemCreated: (item: ManageMenuItemRecord) => void;
  onItemUpdated: (item: ManageMenuItemRecord) => void;
  onItemDeleted: (menuItemId: string) => void;
};

const DELETE_CONFIRM_MESSAGE =
  "Delete this menu item permanently? This action cannot be undone.";

function mutationErrorMessage(
  error: ProviderMenuItemMutationError,
  mode: MenuItemEditorMode,
): string {
  switch (error) {
    case "duplicate":
      return "A menu item with that name already exists for this provider.";
    case "no-weekdays":
      return "Select at least one weekday (Mon–Fri).";
    case "invalid":
      return "Check the menu item fields and try again.";
    default:
      return mode === "add"
        ? "Unable to create this menu item."
        : "Unable to save this menu item.";
  }
}

function deleteErrorMessage(error: ProviderMenuItemDeleteError): string {
  switch (error) {
    case "in-use":
      return PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE;
    case "unauthorized":
      return "You are not allowed to delete this menu item.";
    case "invalid":
      return "Unable to delete this menu item.";
    default:
      return "Unable to delete this menu item.";
  }
}

export function MenuItemEditorPanel({
  providerId,
  editingItem,
  canDeletePermanently,
  onCancelEdit,
  onItemCreated,
  onItemUpdated,
  onItemDeleted,
}: Props) {
  const { showToast } = useToast();
  const mode: MenuItemEditorMode = editingItem ? "edit" : "add";
  const [addSession, setAddSession] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formKey = editingItem?.id ?? `add-${addSession}`;

  function resetToAddMode() {
    setError(null);
    setAddSession((current) => current + 1);
    onCancelEdit();
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createProviderMenuItemInline(formData);

      if (result.success) {
        setError(null);
        onItemCreated(result.item);
        setAddSession((current) => current + 1);
        showToast({
          title: MANAGE_MENU_TOAST.created,
          durationMs: MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
        });
        return;
      }

      setError(mutationErrorMessage(result.error, "add"));
    });
  }

  function handleUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateProviderMenuItemInline(formData);

      if (result.success) {
        setError(null);
        onItemUpdated(result.item);
        showToast({
          title: MANAGE_MENU_TOAST.updated,
          durationMs: MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
        });
        resetToAddMode();
        return;
      }

      setError(mutationErrorMessage(result.error, "edit"));
    });
  }

  function handleToggleActive() {
    if (!editingItem) {
      return;
    }

    const item = editingItem;

    startTransition(async () => {
      const result = await toggleProviderMenuItemActiveInline(
        providerId,
        item.id,
        item.active,
      );

      if (result.success) {
        setError(null);
        onItemUpdated(result.item);
        showToast({
          title: result.item.active
            ? MANAGE_MENU_TOAST.activated
            : MANAGE_MENU_TOAST.deactivated,
          durationMs: MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
        });
        return;
      }

      setError(mutationErrorMessage(result.error, "edit"));
    });
  }

  function handleDeletePermanently() {
    if (!editingItem) {
      return;
    }

    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) {
      return;
    }

    const itemId = editingItem.id;

    startTransition(async () => {
      const result = await deleteProviderMenuItemInline(providerId, itemId);

      if (result.success) {
        setError(null);
        onItemDeleted(itemId);
        showToast({
          title: MANAGE_MENU_TOAST.deleted,
          durationMs: MANAGE_MENU_SUCCESS_TOAST_DURATION_MS,
        });
        resetToAddMode();
        return;
      }

      setError(deleteErrorMessage(result.error));
    });
  }

  const formId =
    mode === "edit" && editingItem
      ? `edit-menu-item-${editingItem.id}`
      : "add-menu-item";

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm border-t-4 border-t-primary/45">
      <div className="border-b border-border/80 px-4 py-2.5">
        <h2 className="text-base font-semibold text-foreground">
          {mode === "add" ? "Add menu item" : "Edit menu item"}
        </h2>
      </div>

      <div className="space-y-4 p-4">
        <form
          key={formKey}
          id={formId}
          className="space-y-4"
          onSubmit={mode === "add" ? handleCreateSubmit : handleUpdateSubmit}
        >
          <input type="hidden" name="providerId" value={providerId} />
          {mode === "edit" && editingItem ? (
            <input type="hidden" name="menuItemId" value={editingItem.id} />
          ) : null}

          <MenuItemFormFields
            idPrefix={mode === "edit" && editingItem ? `edit-${editingItem.id}` : "quick-add-item"}
            item={mode === "edit" ? editingItem ?? undefined : undefined}
            weekdayDefaults={mode === "add" ? [1, 2, 3, 4, 5] : undefined}
          />

          {error ? (
            <p className="text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {mode === "add" ? (
            <Button type="submit" variant="primary" disabled={isPending} className="w-full">
              {isPending ? "Creating…" : "Create menu item"}
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

        {mode === "edit" && editingItem ? (
          <>
            <div className="rounded-xl border border-border/80 bg-slate-50/40 p-4">
              <p className="text-sm font-semibold text-foreground">Item availability</p>
              <p className="mt-1 text-sm text-muted">
                Deactivating hides this item from staff ordering without deleting it.
              </p>
              <Button
                type="button"
                variant="secondary"
                className={
                  editingItem.active
                    ? "mt-3 border-red-300 text-red-700 hover:bg-red-50"
                    : "mt-3"
                }
                disabled={isPending}
                onClick={handleToggleActive}
              >
                {editingItem.active ? "Deactivate item" : "Activate item"}
              </Button>
            </div>

            {canDeletePermanently ? (
              <div className="rounded-xl border border-red-200/70 bg-red-50/40 p-4">
                <p className="text-sm font-semibold text-red-900">Permanent deletion</p>
                <p className="mt-1 text-sm text-muted">
                  Remove this menu item only when it has never appeared on a saved lunch-day menu
                  or order.
                </p>
                <Button
                  type="button"
                  variant="danger"
                  className="mt-3"
                  disabled={isPending}
                  onClick={handleDeletePermanently}
                >
                  Delete permanently
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-border/80 bg-slate-50/40 p-4">
                <p className="text-sm font-semibold text-foreground">Permanent deletion</p>
                <p className="mt-1 text-sm text-muted">
                  {PROVIDER_MENU_ITEM_IN_USE_DELETION_MESSAGE}
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

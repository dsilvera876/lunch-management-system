"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { UserRoleBadge } from "@/components/admin/user-role-badge";
import { updateManageableUserInline } from "@/app/admin/users/actions";
import {
  USER_MANAGEMENT_SUCCESS_TOAST_DURATION_MS,
  USER_MANAGEMENT_TOAST,
  type ManageableUserRecord,
} from "@/lib/user-management-presentation";
import { ASSIGNABLE_ROLES, getRoleLabel } from "@/lib/roles";
import type { AssignableRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";

type Props = {
  user: ManageableUserRecord | null;
  open: boolean;
  onClose: () => void;
  onUserUpdated: (user: ManageableUserRecord) => void;
};

function updateErrorMessage(error: "invalid" | "assign" | "profile"): string {
  switch (error) {
    case "assign":
      return "Unable to assign that role. The user may be protected or the role may be invalid.";
    case "profile":
      return "Unable to update this user's profile.";
    default:
      return "Unable to save changes. Check the fields and try again.";
  }
}

export function EditUserDrawer({ user, open, onClose, onUserUpdated }: Props) {
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formKey = user?.id ?? "closed";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") ?? "");
    const role = String(formData.get("role") ?? user.role);

    startTransition(async () => {
      const result = await updateManageableUserInline({
        profileId: user.id,
        fullName,
        role: user.role === "owner" ? "owner" : role,
      });

      if (result.success) {
        setError(null);
        onUserUpdated(result.user);
        showToast({
          title: USER_MANAGEMENT_TOAST.updated,
          durationMs: USER_MANAGEMENT_SUCCESS_TOAST_DURATION_MS,
        });
        onClose();
        return;
      }

      setError(updateErrorMessage(result.error));
    });
  }

  const isOwner = user?.role === "owner";

  return (
    <AdminSlideOver
      open={open}
      title="Edit user"
      onClose={onClose}
      footer={
        user ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="edit-user-form"
              variant="primary"
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null
      }
    >
      {user ? (
        <form
          id="edit-user-form"
          key={formKey}
          className="space-y-6"
          onSubmit={handleSubmit}
        >
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">User details</h3>
            <FormField label="Name" htmlFor={`edit-user-name-${user.id}`}>
              <input
                id={`edit-user-name-${user.id}`}
                name="fullName"
                defaultValue={user.full_name ?? ""}
                className={inputClassName}
              />
            </FormField>
            <FormField label="Email address" htmlFor={`edit-user-email-${user.id}`}>
              <input
                id={`edit-user-email-${user.id}`}
                value={user.email}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className={`${inputClassName} cursor-not-allowed bg-slate-50 text-muted`}
              />
              <p className="mt-1 text-xs text-muted">
                Email is managed through the authentication account.
              </p>
            </FormField>
          </section>

          <section className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground">Access</h3>
            {isOwner ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted">Role</p>
                <UserRoleBadge role="owner" />
                <p className="text-sm text-muted">
                  Owner role is changed through ownership transfer.
                </p>
              </div>
            ) : (
              <FormField label="Role" htmlFor={`edit-user-role-${user.id}`}>
                <select
                  id={`edit-user-role-${user.id}`}
                  name="role"
                  defaultValue={user.role as AssignableRole}
                  className={selectClassName}
                >
                  {ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </section>

          {error ? (
            <p className="text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </AdminSlideOver>
  );
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { UserRoleBadge } from "@/components/admin/user-role-badge";
import {
  setStaffActiveStatusInline,
  setStaffEmployeeIdInline,
  updateStaffNameInline,
} from "@/app/admin/users/hr-actions";
import { formatEmployeeIdDisplay, validateEmployeeIdField } from "@/lib/employee-id";
import {
  displayStaffName,
  type StaffDirectoryRow,
} from "@/lib/staff-directory-presentation";
import { getRoleLabel } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { FormField, inputClassName } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

const DEACTIVATE_CONFIRM_MESSAGE =
  "Deactivate this user?\n\nThis will prevent the user from accessing the Lunch Management System. Their previous orders and financial records will remain unchanged.";

type Props = {
  user: StaffDirectoryRow | null;
  open: boolean;
  onClose: () => void;
  onUserUpdated: (user: StaffDirectoryRow) => void;
  readOnly?: boolean;
};

export function HrUserDetailsDrawer({
  user,
  open,
  onClose,
  onUserUpdated,
  readOnly = false,
}: Props) {
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formKey = user?.profile_id ?? "closed";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") ?? "");
    const employeeIdRaw = String(formData.get("employeeId") ?? "");

    const employeeValidation = validateEmployeeIdField(employeeIdRaw);
    if (!employeeValidation.ok) {
      setError(employeeValidation.message);
      return;
    }

    startTransition(async () => {
      setError(null);
      let latestRow = user;
      let hadError = false;

      if (fullName !== (user.full_name ?? "")) {
        const nameResult = await updateStaffNameInline({
          profileId: user.profile_id,
          fullName,
        });

        if (!nameResult.success) {
          setError(nameResult.error);
          hadError = true;
        } else {
          latestRow = nameResult.row;
        }
      }

      const currentEmployeeId = user.employee_id ?? "";
      const nextEmployeeId = employeeValidation.value ?? "";

      if (!hadError && currentEmployeeId !== nextEmployeeId) {
        const idResult = await setStaffEmployeeIdInline({
          profileId: user.profile_id,
          employeeId: employeeIdRaw,
        });

        if (!idResult.success) {
          setError(idResult.error);
          hadError = true;
        } else {
          latestRow = idResult.row;
        }
      }

      if (hadError) {
        return;
      }

      onUserUpdated(latestRow);
      showToast({ title: "User updated" });
      onClose();
    });
  }

  function handleStatusChange(nextStatus: "active" | "inactive") {
    if (!user) {
      return;
    }

    if (nextStatus === "inactive") {
      const confirmed = window.confirm(DEACTIVATE_CONFIRM_MESSAGE);
      if (!confirmed) {
        return;
      }
    } else {
      const confirmed = window.confirm("Reactivate this user?");
      if (!confirmed) {
        return;
      }
    }

    startTransition(async () => {
      setError(null);
      const result = await setStaffActiveStatusInline({
        profileId: user.profile_id,
        status: nextStatus,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onUserUpdated(result.row);
      showToast({
        title: nextStatus === "inactive" ? "User deactivated" : "User reactivated",
      });
      onClose();
    });
  }

  return (
    <AdminSlideOver
      open={open}
      title="User details"
      onClose={onClose}
      footer={
        user && readOnly ? (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : user ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <div>
              {user.status === "active" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="border-red-200 text-red-700 hover:bg-red-50"
                  disabled={isPending}
                  onClick={() => handleStatusChange("inactive")}
                >
                  Deactivate user
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() => handleStatusChange("active")}
                >
                  Reactivate user
                </Button>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="hr-user-details-form"
                variant="primary"
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      {user ? (
        <form
          id="hr-user-details-form"
          key={formKey}
          className="space-y-6"
          onSubmit={handleSubmit}
        >
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              {displayStaffName(user)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={user.status} />
              <UserRoleBadge role={user.role} />
            </div>
            <p className="text-sm text-muted">{user.email}</p>
          </div>

          <FormField label="Full name" htmlFor={`hr-user-name-${user.profile_id}`}>
            <input
              id={`hr-user-name-${user.profile_id}`}
              name="fullName"
              defaultValue={user.full_name ?? ""}
              readOnly={readOnly}
              className={inputClassName}
            />
          </FormField>

          <FormField label="Email" htmlFor={`hr-user-email-${user.profile_id}`}>
            <input
              id={`hr-user-email-${user.profile_id}`}
              value={user.email}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              className={`${inputClassName} cursor-not-allowed bg-slate-50 text-muted`}
            />
            <p className="mt-1 text-xs text-muted">
              Email cannot be changed here.
            </p>
          </FormField>

          <FormField label="Employee ID" htmlFor={`hr-user-employee-id-${user.profile_id}`}>
            <input
              id={`hr-user-employee-id-${user.profile_id}`}
              name="employeeId"
              defaultValue={user.employee_id ?? ""}
              placeholder={formatEmployeeIdDisplay(null)}
              inputMode="numeric"
              maxLength={4}
              readOnly={readOnly}
              className={inputClassName}
            />
            <p className="mt-1 text-xs text-muted">
              Optional four-digit ID. Leave blank if not assigned.
            </p>
          </FormField>

          <FormField label="Role" htmlFor={`hr-user-role-${user.profile_id}`}>
            <input
              id={`hr-user-role-${user.profile_id}`}
              value={getRoleLabel(user.role)}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              className={`${inputClassName} cursor-not-allowed bg-slate-50 text-muted`}
            />
            <p className="mt-1 text-xs text-muted">
              Role is view-only for HR and can only be changed by a system administrator.
            </p>
          </FormField>

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

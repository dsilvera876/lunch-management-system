"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getUserDeletionEligibilityInline,
  permanentlyDeleteUserInline,
} from "@/app/admin/users/actions";
import { displayUserName, type ManageableUserRecord } from "@/lib/user-management-presentation";
import {
  canShowPermanentDeleteInUserManagement,
  emailsMatchForDeletionConfirmation,
  type UserDeletionEligibility,
  type UserDeletionReasonCategory,
} from "@/lib/user-deletion";
import { Button } from "@/components/ui/button";
import { FormField, inputClassName, selectClassName } from "@/components/ui/form-field";

type Props = {
  user: ManageableUserRecord;
  viewerId: string;
  viewerRole: string;
  onDeleted: (profileId: string) => void;
  onError: (message: string) => void;
  onSuccess: () => void;
};

export function UserPermanentDeleteSection({
  user,
  viewerId,
  viewerRole,
  onDeleted,
  onError,
  onSuccess,
}: Props) {
  const [eligibility, setEligibility] = useState<UserDeletionEligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reasonCategory, setReasonCategory] =
    useState<UserDeletionReasonCategory>("test_account");
  const [partialMessage, setPartialMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showSection = canShowPermanentDeleteInUserManagement(viewerRole);

  useEffect(() => {
    if (!showSection || !user.id) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoadingEligibility(true);
      const result = await getUserDeletionEligibilityInline(user.id);
      if (cancelled) {
        return;
      }

      setLoadingEligibility(false);
      if (result.success) {
        setEligibility(result.eligibility);
      } else {
        setEligibility(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showSection, user.id]);

  if (!showSection) {
    return null;
  }

  const emailConfirmed = emailsMatchForDeletionConfirmation(confirmEmail, user.email);
  const canOpenDialog = eligibility?.canDelete === true && user.id !== viewerId;

  function closeDialog() {
    setDialogOpen(false);
    setConfirmEmail("");
    setReasonCategory("test_account");
    setPartialMessage(null);
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await permanentlyDeleteUserInline({
        profileId: user.id,
        confirmEmail,
        accountEmail: user.email,
        reasonCategory,
      });

      if (result.success === false) {
        onError(result.message);
        return;
      }

      onDeleted(result.profileId);

      if (result.success === "partial") {
        setPartialMessage(result.message);
        return;
      }

      closeDialog();
      onSuccess();
    });
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-foreground">Danger zone</h3>
      {loadingEligibility ? (
        <p className="text-sm text-muted">Checking whether this account can be deleted…</p>
      ) : eligibility?.canDelete ? (
        <>
          <p className="text-sm text-muted">
            Permanently remove this account and its authentication identity. Only accounts without
            lunch or business history can be deleted. The email address can be used again afterward.
          </p>
          <Button
            type="button"
            variant="danger"
            disabled={!canOpenDialog || isPending}
            onClick={() => setDialogOpen(true)}
          >
            Delete account permanently
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted">
          {eligibility?.blockerSummary ??
            "This account cannot be permanently deleted from User Management."}
        </p>
      )}

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
            <h3 id="delete-account-title" className="text-base font-semibold text-foreground">
              Delete account permanently?
            </h3>
            <p className="mt-2 text-sm text-muted">
              This permanently deletes {displayUserName(user)}&apos;s Lunch Management account and
              authentication identity. This action cannot be undone.
            </p>
            <p className="mt-2 text-sm text-muted">
              Only accounts without lunch or business history can be deleted. The email address can
              be used to create a new account afterward.
            </p>

            {partialMessage ? (
              <p className="mt-4 text-sm font-medium text-amber-800" role="alert">
                {partialMessage}
              </p>
            ) : null}

            {partialMessage ? null : (
              <div className="mt-4 space-y-4">
                <FormField label="Reason" htmlFor={`delete-reason-${user.id}`}>
                  <select
                    id={`delete-reason-${user.id}`}
                    className={selectClassName}
                    value={reasonCategory}
                    disabled={isPending}
                    onChange={(event) =>
                      setReasonCategory(event.target.value as UserDeletionReasonCategory)
                    }
                  >
                    <option value="test_account">Test account</option>
                    <option value="duplicate_error">Duplicate / created in error</option>
                    <option value="other">Other</option>
                  </select>
                </FormField>

                <FormField
                  label="Type email to confirm"
                  htmlFor={`delete-confirm-email-${user.id}`}
                >
                  <input
                    id={`delete-confirm-email-${user.id}`}
                    type="email"
                    autoComplete="off"
                    className={inputClassName}
                    value={confirmEmail}
                    disabled={isPending}
                    placeholder={user.email}
                    onChange={(event) => setConfirmEmail(event.target.value)}
                  />
                </FormField>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              {partialMessage ? (
                <Button type="button" variant="secondary" disabled={isPending} onClick={closeDialog}>
                  Close
                </Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" disabled={isPending} onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={isPending || !emailConfirmed}
                    onClick={handleDelete}
                  >
                    {isPending ? "Deleting…" : "Delete Account Permanently"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

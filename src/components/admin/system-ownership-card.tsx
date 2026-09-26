"use client";

import { useMemo, useState, useTransition } from "react";
import { EmployeePicker } from "@/components/employee-picker";
import { transferOwnershipInline } from "@/app/admin/users/actions";
import {
  USER_MANAGEMENT_SUCCESS_TOAST_DURATION_MS,
  USER_MANAGEMENT_TOAST,
  displayUserName,
  type ManageableUserRecord,
} from "@/lib/user-management-presentation";
import {
  buildOwnershipTransferConfirmMessage,
  isTransferOwnershipButtonDisabled,
} from "@/lib/user-management-ownership-flow";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function TransferOwnershipSubmitButton({
  newOwnerId,
  isPending,
  onClick,
}: {
  newOwnerId: string;
  isPending: boolean;
  onClick: () => void;
}) {
  const disabled = isTransferOwnershipButtonDisabled(newOwnerId, isPending);

  return (
    <Button
      type="button"
      variant="secondary"
      data-testid="transfer-ownership-button"
      aria-disabled={disabled}
      className="mt-3 w-full shrink-0 border-2 border-red-400 bg-surface px-4 py-2 text-red-800 shadow-sm hover:bg-red-50 disabled:border-red-200 disabled:bg-slate-50 disabled:text-red-400 sm:w-auto"
      disabled={disabled}
      onClick={onClick}
    >
      {isPending ? "Transferring…" : "Transfer ownership"}
    </Button>
  );
}

type Props = {
  users: ManageableUserRecord[];
  currentOwnerId: string;
  onOwnershipTransferred: (previousOwnerId: string, newOwnerId: string) => void;
  onViewerRoleChanged: () => void;
};

function transferErrorMessage(
  error: "invalid" | "transfer" | "unauthorized",
): string {
  switch (error) {
    case "unauthorized":
      return "Only the current Owner may transfer ownership.";
    case "invalid":
      return "Select a valid employee to become Owner.";
    default:
      return "Unable to transfer ownership. Verify the selected user and try again.";
  }
}

export function SystemOwnershipCard({
  users,
  currentOwnerId,
  onOwnershipTransferred,
  onViewerRoleChanged,
}: Props) {
  const { showToast } = useToast();
  const [newOwnerId, setNewOwnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentOwner = useMemo(
    () => users.find((user) => user.id === currentOwnerId) ?? null,
    [currentOwnerId, users],
  );

  const transferCandidates = useMemo(
    () =>
      users
        .filter((user) => user.id !== currentOwnerId && user.role !== "owner")
        .map((user) => ({
          id: user.id,
          name: displayUserName(user),
          email: user.email,
        })),
    [currentOwnerId, users],
  );

  function handleTransfer() {
    if (!newOwnerId) {
      setError(transferErrorMessage("invalid"));
      return;
    }

    const newOwner = users.find((user) => user.id === newOwnerId);
    const ownerName = currentOwner
      ? displayUserName(currentOwner)
      : "Current owner";
    const newOwnerName = newOwner ? displayUserName(newOwner) : "Selected employee";

    const confirmed = window.confirm(
      buildOwnershipTransferConfirmMessage({
        newOwnerName,
        currentOwnerName: ownerName,
      }),
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await transferOwnershipInline(newOwnerId);

      if (result.success) {
        setError(null);
        setNewOwnerId("");
        onOwnershipTransferred(result.previousOwnerId, result.newOwnerId);
        showToast({
          title: USER_MANAGEMENT_TOAST.ownershipTransferred,
          durationMs: USER_MANAGEMENT_SUCCESS_TOAST_DURATION_MS,
        });
        if (result.viewerBecameAdmin) {
          onViewerRoleChanged();
        }
        return;
      }

      setError(transferErrorMessage(result.error));
    });
  }

  return (
    <Card className="mt-8 border border-border/80 bg-slate-50/30">
      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">System ownership</h2>
          <p className="mt-1 text-sm text-muted">
            Transfer system ownership to another employee. The current Owner will
            become Admin.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Current owner
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {currentOwner ? displayUserName(currentOwner) : "—"}
            </p>
            <p className="text-sm text-muted">{currentOwner?.email ?? "—"}</p>
          </div>

          <div className="relative flex flex-col rounded-xl border border-border bg-surface px-3 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              New owner
            </p>
            <div className="flex flex-col gap-3">
              <EmployeePicker
                id="ownership-transfer-picker"
                employees={transferCandidates}
                value={newOwnerId}
                onValueChange={(employeeId) => {
                  setNewOwnerId(employeeId);
                  setError(null);
                }}
                placeholder="Select an employee…"
              />
              <TransferOwnershipSubmitButton
                newOwnerId={newOwnerId}
                isPending={isPending}
                onClick={handleTransfer}
              />
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

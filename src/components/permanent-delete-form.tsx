"use client";

import { FormSubmitButton } from "@/components/form-submit-button";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  entityId: string;
  entityLabel: string;
  confirmMessage: string;
  buttonLabel?: string;
  pendingLabel?: string;
};

export function PermanentDeleteForm({
  action,
  entityId,
  entityLabel,
  confirmMessage,
  buttonLabel = "Delete permanently",
  pendingLabel = "Deleting…",
}: Props) {
  return (
    <form action={action} className="mt-6 border-t border-border pt-6">
      <input type="hidden" name="id" value={entityId} />
      <p className="mb-3 text-sm text-muted">
        Permanently remove this {entityLabel} only when it has never been used in
        menus, orders, or other operational history. Otherwise deactivate it.
      </p>
      <FormSubmitButton
        variant="danger"
        pendingText={pendingLabel}
        confirmMessage={confirmMessage}
        className="w-full sm:w-auto"
      >
        {buttonLabel}
      </FormSubmitButton>
    </form>
  );
}

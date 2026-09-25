"use client";

import { createProvider } from "@/app/admin/providers/actions";
import { AdminSlideOver } from "@/components/admin/lunch-providers/admin-slide-over";
import { ProviderDetailsFields } from "@/components/admin/lunch-providers/provider-details-fields";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddProviderDrawer({ open, onClose }: Props) {
  return (
    <AdminSlideOver
      open={open}
      title="Add provider"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-provider-form" variant="primary">
            Create provider
          </Button>
        </div>
      }
    >
      <form id="add-provider-form" action={createProvider} className="space-y-4">
        <ProviderDetailsFields
          idPrefix="add-provider"
          layout="stack"
          descriptionRows={2}
        />
      </form>
    </AdminSlideOver>
  );
}

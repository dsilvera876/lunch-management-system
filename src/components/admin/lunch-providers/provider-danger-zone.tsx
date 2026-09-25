import { deleteUnusedProvider, toggleProviderActive } from "@/app/admin/providers/actions";
import { PermanentDeleteForm } from "@/components/permanent-delete-form";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { linkButtonClass } from "@/components/ui/button";
import { PROVIDER_IN_USE_DELETION_MESSAGE } from "@/lib/unused-record-deletion";

type Props = {
  providerId: string;
  active: boolean;
  canDeletePermanently: boolean;
};

export function ProviderDangerZone({ providerId, active, canDeletePermanently }: Props) {
  return (
    <section>
      <SectionHeader title="Danger zone" />
      <Card className="border-border/80 bg-slate-50/30 shadow-sm">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {active ? "Deactivate provider" : "Activate provider"}
              </p>
              <p className="text-sm text-muted">
                {active
                  ? "Hide from staff ordering while keeping history."
                  : "Show again when menu items are available."}
              </p>
            </div>
            <form action={toggleProviderActive} className="shrink-0">
              <input type="hidden" name="id" value={providerId} />
              <input type="hidden" name="active" value={String(active)} />
              <button
                type="submit"
                className={`${linkButtonClass("secondary")} w-full sm:w-auto ${
                  active
                    ? "border-red-300 text-red-700 hover:bg-red-50"
                    : ""
                }`}
              >
                {active ? "Deactivate provider" : "Activate provider"}
              </button>
            </form>
          </div>

          {canDeletePermanently ? (
            <div className="flex flex-col gap-3 rounded-xl border border-red-200/70 bg-red-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-900">Delete permanently</p>
                <p className="text-sm text-muted">
                  Remove this provider only when it has never been used in menus or orders.
                </p>
              </div>
              <PermanentDeleteForm
                action={deleteUnusedProvider}
                entityId={providerId}
                entityLabel="provider"
                confirmMessage="Delete this provider permanently? This action cannot be undone."
                buttonLabel="Delete permanently"
                embedded
              />
            </div>
          ) : (
            <div className="rounded-xl border border-border/80 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Permanent deletion unavailable</p>
              <p className="mt-1 text-sm text-muted">{PROVIDER_IN_USE_DELETION_MESSAGE}</p>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

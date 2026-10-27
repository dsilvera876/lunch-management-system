import { LateOrdersPageHeader } from "@/components/admin/late-orders/late-orders-page-header";
import { Card } from "@/components/ui/card";

export default function LateOrdersLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <LateOrdersPageHeader />
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted shadow-sm"
      >
        Loading late-order workspace…
      </div>
      <Card padding="md" className="space-y-4 shadow-sm">
        <div className="h-5 w-48 rounded bg-muted/60 motion-safe:animate-pulse" aria-hidden />
        <div className="grid gap-3 md:grid-cols-2" aria-hidden>
          <div className="h-32 rounded-lg border border-border bg-muted/30 motion-safe:animate-pulse" />
          <div className="h-32 rounded-lg border border-border bg-muted/30 motion-safe:animate-pulse" />
        </div>
      </Card>
    </div>
  );
}

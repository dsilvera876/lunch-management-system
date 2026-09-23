import Link from "next/link";
import {
  LATE_ORDER_MANAGE_PROVIDERS_HREF,
  type LateOrdersUnavailableReason,
} from "@/lib/late-orders-presentation";
import { IconStorefront } from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";
import { linkButtonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  reason: LateOrdersUnavailableReason;
};

const COPY: Record<
  LateOrdersUnavailableReason,
  { title: string; description: string; showManageProviders: boolean }
> = {
  no_providers: {
    title: "No providers are accepting late orders",
    description:
      "Enable late ordering for a provider in Lunch Providers to create a late order.",
    showManageProviders: true,
  },
  no_window: {
    title: "No late-order window is currently available",
    description:
      "Late-order creation opens after the company cutoff and while a provider’s late-order deadline is still open.",
    showManageProviders: false,
  },
};

export function LateOrdersUnavailableCard({ reason }: Props) {
  const copy = COPY[reason];

  return (
    <Card padding="sm" className="shadow-sm">
      <div className="mx-auto flex max-w-md flex-col items-center px-2 py-3 text-center">
        <TealIconWell size="sm" className="shrink-0">
          <IconStorefront aria-hidden />
        </TealIconWell>
        <h2 className="mt-3 text-base font-semibold text-slate-900">{copy.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{copy.description}</p>
        {copy.showManageProviders ? (
          <Link
            href={LATE_ORDER_MANAGE_PROVIDERS_HREF}
            className={`${linkButtonClass("secondary")} mt-4 inline-flex`}
          >
            Manage Lunch Providers
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

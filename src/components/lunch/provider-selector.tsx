"use client";

import { ProviderIcon } from "@/lib/provider-icons";
import type { ProviderIconKey } from "@/lib/provider-icons";
import { useAccessibleTablist } from "@/hooks/use-accessible-tablist";
import { LUNCH_PROVIDER_MENU_TABPANEL_ID } from "@/lib/accessible-tabs";

export type ProviderTab = {
  id: string;
  name: string;
  iconKey: ProviderIconKey;
  hasWorkingDraft?: boolean;
};

type Props = {
  providers: ProviderTab[];
  selectedId: string | null;
  onSelect: (providerId: string) => void;
};

export function ProviderSelector({ providers, selectedId, onSelect }: Props) {
  const tabIds = providers.map((provider) => provider.id);
  const resolvedSelectedId = selectedId ?? tabIds[0] ?? "";
  const { tabProps } = useAccessibleTablist({
    tabIds,
    selectedId: resolvedSelectedId,
    onSelect,
  });

  if (providers.length === 0 || !selectedId) {
    return null;
  }

  return (
    <div className="mb-6">
      <div
        role="tablist"
        aria-label="Lunch providers"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
      >
        {providers.map((provider) => {
          const selected = provider.id === selectedId;
          const props = tabProps(provider.id);

          return (
            <button
              key={provider.id}
              type="button"
              id={`provider-tab-${provider.id}`}
              aria-controls={LUNCH_PROVIDER_MENU_TABPANEL_ID}
              onClick={() => onSelect(provider.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "staff-tab-selected border-primary bg-primary/10 text-slate-900 ring-1 ring-primary"
                  : "border-border bg-surface text-staff-instruction hover:border-primary/40 hover:text-foreground"
              }`}
              {...props}
            >
              <span className="inline-flex shrink-0" aria-hidden>
                <ProviderIcon iconKey={provider.iconKey} size={18} alt="" />
              </span>
              <span className="max-w-[12rem] truncate sm:max-w-none">{provider.name}</span>
              {provider.hasWorkingDraft ? (
                <span
                  className="size-2 shrink-0 rounded-full bg-staff-cta"
                  title="Unadded selection"
                  aria-label="Has an unadded selection"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

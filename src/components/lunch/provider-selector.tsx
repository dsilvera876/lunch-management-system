"use client";

import { NavIcon } from "@/components/icons/line-icons";

export type ProviderTab = {
  id: string;
  name: string;
};

type Props = {
  providers: ProviderTab[];
  selectedId: string | null;
  onSelect: (providerId: string) => void;
};

export function ProviderSelector({ providers, selectedId, onSelect }: Props) {
  if (providers.length === 0) {
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

          return (
            <button
              key={provider.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`provider-tab-${provider.id}`}
              aria-controls={`provider-panel-${provider.id}`}
              onClick={() => onSelect(provider.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? "border-primary bg-primary/10 text-slate-900 ring-1 ring-primary/30"
                  : "border-border bg-surface text-muted hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <NavIcon
                id="storefront"
                size={18}
                className={selected ? "text-primary" : "text-teal-700/40"}
              />
              <span className="max-w-[12rem] truncate sm:max-w-none">{provider.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

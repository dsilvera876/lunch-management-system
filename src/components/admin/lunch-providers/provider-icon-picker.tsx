"use client";

import { useState } from "react";
import {
  DEFAULT_PROVIDER_ICON_KEY,
  PROVIDER_ICON_DEFINITIONS,
  ProviderIcon,
  parseProviderIconKey,
  type ProviderIconKey,
} from "@/lib/provider-icons";

type Props = {
  name?: string;
  defaultValue?: unknown;
};

export function ProviderIconPicker({
  name = "iconKey",
  defaultValue = DEFAULT_PROVIDER_ICON_KEY,
}: Props) {
  const [selected, setSelected] = useState<ProviderIconKey>(() =>
    parseProviderIconKey(defaultValue),
  );

  return (
    <div>
      <input type="hidden" name={name} value={selected} />
      <div
        className="grid grid-cols-4 gap-2"
        role="radiogroup"
        aria-label="Provider icon"
      >
        {PROVIDER_ICON_DEFINITIONS.map(({ key, label }) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={label}
              onClick={() => setSelected(key)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary ring-1 ring-inset ring-primary/25"
                  : "border-border bg-surface text-muted hover:border-primary/40 hover:bg-primary/5"
              }`}
            >
              <span className="flex size-10 items-center justify-center">
                <ProviderIcon iconKey={key} size="picker" alt="" />
              </span>
              <span className="whitespace-nowrap text-[10px] font-medium leading-tight">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

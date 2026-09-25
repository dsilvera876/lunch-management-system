import Image from "next/image";

export const PROVIDER_ICON_KEYS = [
  "utensils",
  "bowl",
  "fruit",
  "drink",
  "pizza",
  "burger",
  "leaf",
  "food-bag",
] as const;

export type ProviderIconKey = (typeof PROVIDER_ICON_KEYS)[number];

export const DEFAULT_PROVIDER_ICON_KEY: ProviderIconKey = "utensils";

const PROVIDER_ICON_KEY_SET = new Set<string>(PROVIDER_ICON_KEYS);

export const PROVIDER_ICON_ASSETS: Record<ProviderIconKey, string> = {
  utensils: "/provider-icons/utensils.png",
  bowl: "/provider-icons/bowl.png",
  fruit: "/provider-icons/fruit.png",
  drink: "/provider-icons/drink.png",
  pizza: "/provider-icons/pizza.png",
  burger: "/provider-icons/burger.png",
  leaf: "/provider-icons/leaf.png",
  "food-bag": "/provider-icons/food-bag.png",
};

export type ProviderIconDefinition = {
  key: ProviderIconKey;
  label: string;
  assetPath: string;
};

export const PROVIDER_ICON_DEFINITIONS: ProviderIconDefinition[] = [
  { key: "utensils", label: "Utensils", assetPath: PROVIDER_ICON_ASSETS.utensils },
  { key: "bowl", label: "Bowl", assetPath: PROVIDER_ICON_ASSETS.bowl },
  { key: "fruit", label: "Fruit", assetPath: PROVIDER_ICON_ASSETS.fruit },
  { key: "drink", label: "Drink", assetPath: PROVIDER_ICON_ASSETS.drink },
  { key: "pizza", label: "Pizza", assetPath: PROVIDER_ICON_ASSETS.pizza },
  { key: "burger", label: "Burger", assetPath: PROVIDER_ICON_ASSETS.burger },
  { key: "leaf", label: "Leaf", assetPath: PROVIDER_ICON_ASSETS.leaf },
  { key: "food-bag", label: "Food bag", assetPath: PROVIDER_ICON_ASSETS["food-bag"] },
];

const LABEL_BY_KEY = new Map(
  PROVIDER_ICON_DEFINITIONS.map((definition) => [definition.key, definition.label]),
);

export function isProviderIconKey(value: string): value is ProviderIconKey {
  return PROVIDER_ICON_KEY_SET.has(value);
}

/** Coerce unknown DB/form values to a supported icon key (never throws). */
export function parseProviderIconKey(value: unknown): ProviderIconKey {
  if (typeof value === "string" && isProviderIconKey(value)) {
    return value;
  }
  return DEFAULT_PROVIDER_ICON_KEY;
}

export function getProviderIconAssetPath(key: ProviderIconKey): string {
  return PROVIDER_ICON_ASSETS[key] ?? PROVIDER_ICON_ASSETS.utensils;
}

export function getProviderIconLabel(key: ProviderIconKey): string {
  return LABEL_BY_KEY.get(key) ?? "Utensils";
}

/** Semantic artwork sizes for provider PNGs (width/height passed to Next Image). */
export type ProviderIconSize = "small" | "medium" | "large" | "picker";

export const PROVIDER_ICON_ARTWORK_PX: Record<ProviderIconSize, number> = {
  small: 26,
  medium: 34,
  large: 40,
  picker: 36,
};

/** Teal well dimensions paired with artwork sizes for prominent provider identity. */
export const PROVIDER_ICON_WELL_CLASS: Record<Exclude<ProviderIconSize, "picker">, string> = {
  small: "size-9 rounded-lg",
  medium: "size-11 rounded-xl",
  large: "size-12 rounded-xl",
};

export function getProviderIconArtworkPx(size: ProviderIconSize): number {
  return PROVIDER_ICON_ARTWORK_PX[size];
}

export function ProviderIcon({
  iconKey,
  size = "medium",
  className = "",
  alt,
}: {
  iconKey: unknown;
  /** Semantic variant or explicit pixel size for rare one-offs. */
  size?: ProviderIconSize | number;
  className?: string;
  alt?: string;
}) {
  const key = parseProviderIconKey(iconKey);
  const label = getProviderIconLabel(key);
  const px = typeof size === "number" ? size : getProviderIconArtworkPx(size);

  return (
    <Image
      src={getProviderIconAssetPath(key)}
      alt={alt ?? label}
      width={px}
      height={px}
      className={`pointer-events-none shrink-0 object-contain ${className}`.trim()}
    />
  );
}

export function ProviderIconWell({
  iconKey,
  size = "medium",
  className,
  alt,
}: {
  iconKey: unknown;
  size?: Exclude<ProviderIconSize, "picker">;
  className?: string;
  alt?: string;
}) {
  const key = parseProviderIconKey(iconKey);
  const label = alt ?? getProviderIconLabel(key);
  const wellClass = PROVIDER_ICON_WELL_CLASS[size];
  const artworkPx = getProviderIconArtworkPx(size);

  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-primary/10 text-primary ${wellClass} ${className ?? ""}`.trim()}
    >
      <ProviderIcon iconKey={key} size={artworkPx} alt={label} />
    </span>
  );
}

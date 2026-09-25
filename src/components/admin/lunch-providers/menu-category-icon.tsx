import {
  IconBag,
  IconStarOutline,
  IconStorefront,
  IconUtensils,
  IconUtensilsCrossed,
} from "@/components/icons/line-icons";
import { TealIconWell } from "@/components/my-spend/teal-icon-well";

export function resolveMenuCategoryIconKey(sectionKey: string, label: string) {
  if (sectionKey === "main") {
    return "main";
  }

  if (sectionKey === "side") {
    return "side";
  }

  const normalized = label.toLocaleLowerCase();

  if (normalized.includes("juice")) {
    return "juice";
  }

  if (normalized.includes("fruit")) {
    return "fruit";
  }

  if (normalized.includes("dessert") || normalized.includes("snack")) {
    return "snack";
  }

  if (normalized.includes("standalone") || normalized.includes("other")) {
    return "standalone";
  }

  return "default";
}

export function MenuCategoryIconWell({
  sectionKey,
  label,
}: {
  sectionKey: string;
  label: string;
}) {
  const iconKey = resolveMenuCategoryIconKey(sectionKey, label);

  return (
    <TealIconWell size="sm" className="shrink-0 rounded-lg">
      {iconKey === "main" ? <IconUtensils aria-hidden /> : null}
      {iconKey === "side" ? <IconUtensilsCrossed aria-hidden /> : null}
      {iconKey === "juice" || iconKey === "snack" ? <IconBag aria-hidden /> : null}
      {iconKey === "fruit" ? <IconStarOutline aria-hidden /> : null}
      {iconKey === "standalone" ? <IconStorefront aria-hidden /> : null}
      {iconKey === "default" ? <IconUtensils aria-hidden /> : null}
    </TealIconWell>
  );
}

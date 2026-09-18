import { validateProviderDraft } from "@/lib/lunch-order-draft";

type DraftValidation = ReturnType<typeof validateProviderDraft>;

/** Composition guidance shown below extras; meal-incomplete copy lives under the meal section only. */
export function getOrderSummaryCompositionGuidance(
  validation: DraftValidation,
  canSubmit: boolean,
): string | null {
  if (canSubmit || validation.valid) {
    return null;
  }

  if (validation.mealIncomplete) {
    return null;
  }

  return validation.message;
}

export function countMealIncompleteGuidanceInSummarySource(source: string): number {
  const matches = source.match(
    /Choose at least one side to complete this meal\./g,
  );
  return matches?.length ?? 0;
}

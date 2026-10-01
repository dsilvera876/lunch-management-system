import { Button } from "@/components/ui/button";

export type TimingSavePhase = "idle" | "saving" | "saved";

type Props = {
  phase: TimingSavePhase;
  disabled: boolean;
  saveLabel: string;
  onSave: () => void;
};

export function NotificationTimingSaveButton({
  phase,
  disabled,
  saveLabel,
  onSave,
}: Props) {
  const isSaving = phase === "saving";
  const isSaved = phase === "saved";

  let label = "Save";
  if (isSaving) {
    label = "Saving…";
  } else if (isSaved) {
    label = "Saved ✓";
  }

  return (
    <div className="inline-flex flex-col items-start">
      <Button
        type="button"
        variant="secondary"
        className="min-h-8 px-3 py-1 text-xs"
        disabled={disabled || isSaving || isSaved}
        aria-label={saveLabel}
        aria-busy={isSaving}
        onClick={onSave}
      >
        {label}
      </Button>
      {isSaving || isSaved ? (
        <span className="sr-only" aria-live="polite">
          {isSaving ? "Saving timing change." : "Timing saved."}
        </span>
      ) : null}
    </div>
  );
}

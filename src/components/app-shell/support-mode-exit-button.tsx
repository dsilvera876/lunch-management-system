"use client";

type Props = {
  pending: boolean;
  onClick: () => void;
  className?: string;
};

const exitButtonClassName =
  "inline-flex shrink-0 items-center justify-center rounded-md border border-amber-900/45 bg-amber-900/20 px-3 py-1.5 text-sm font-medium text-amber-950 transition-colors hover:border-amber-900/60 hover:bg-amber-900/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-800 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-100 disabled:opacity-60 dark:border-amber-200/30 dark:bg-amber-950/60 dark:text-amber-50 dark:hover:border-amber-200/45 dark:hover:bg-amber-950/80 dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-amber-950";

export function SupportModeExitButton({ pending, onClick, className = "" }: Props) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={`${exitButtonClassName} ${className}`.trim()}
    >
      {pending ? "Exiting…" : "Exit Support Mode"}
    </button>
  );
}

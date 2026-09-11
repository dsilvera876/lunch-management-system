import { readOnlyFieldClassName } from "@/components/ui/form-field";

type Props = {
  id: string;
  value: string;
  showCalendarIcon?: boolean;
};

function CalendarIcon() {
  return (
    <svg
      aria-hidden
      className="size-4 shrink-0 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 2v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}

export function ReadOnlyFormValue({ id, value, showCalendarIcon = false }: Props) {
  return (
    <div
      id={id}
      aria-readonly="true"
      className={`${readOnlyFieldClassName} flex items-center justify-between gap-2`}
    >
      <span className="min-w-0 truncate">{value}</span>
      {showCalendarIcon ? <CalendarIcon /> : null}
    </div>
  );
}

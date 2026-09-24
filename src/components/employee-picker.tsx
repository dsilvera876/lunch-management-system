"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { inputClassName, selectClassName } from "@/components/ui/form-field";
import {
  EMPLOYEE_PICKER_DEFAULT_PLACEHOLDER,
  EMPLOYEE_PICKER_EMPTY_MESSAGE,
  filterEmployeesForPicker,
  findEmployeePickerOption,
  type EmployeePickerOption,
} from "@/lib/employee-picker";
import {
  computeEmployeePickerDropdownPosition,
  type EmployeePickerDropdownPosition,
} from "@/lib/employee-picker-portal";

type Props = {
  employees: EmployeePickerOption[];
  value: string;
  onValueChange: (employeeId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  "aria-labelledby"?: string;
};

export function EmployeePicker({
  employees,
  value,
  onValueChange,
  disabled = false,
  placeholder = EMPLOYEE_PICKER_DEFAULT_PLACEHOLDER,
  id: idProp,
  "aria-labelledby": ariaLabelledBy,
}: Props) {
  const generatedId = useId();
  const controlId = idProp ?? generatedId;
  const listboxId = `${controlId}-listbox`;
  const searchId = `${controlId}-search`;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] =
    useState<EmployeePickerDropdownPosition | null>(null);

  const filtered = useMemo(
    () => filterEmployeesForPicker(employees, query),
    [employees, query],
  );

  const selected = findEmployeePickerOption(employees, value);

  const activeHighlightIndex =
    filtered.length === 0
      ? -1
      : Math.min(Math.max(highlightIndex, 0), filtered.length - 1);

  const updateDropdownPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    setDropdownPosition(
      computeEmployeePickerDropdownPosition(trigger.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updateDropdownPosition();
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
    });

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
      setDropdownPosition(null);
    }

    function handleReposition() {
      updateDropdownPosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updateDropdownPosition]);

  function closePicker() {
    setOpen(false);
    setQuery("");
    setDropdownPosition(null);
  }

  function selectEmployee(employeeId: string) {
    onValueChange(employeeId);
    closePicker();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setHighlightIndex(0);
      setOpen(true);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length === 0) {
        return;
      }
      setHighlightIndex((current) => {
        const base = current < 0 ? 0 : current;
        return (base + 1) % filtered.length;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) {
        return;
      }
      setHighlightIndex((current) => {
        const base = current < 0 ? 0 : current;
        return base <= 0 ? filtered.length - 1 : base - 1;
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const pick = filtered[activeHighlightIndex];
      if (pick) {
        selectEmployee(pick.id);
      }
    }
  }

  const dropdownPanel =
    open && dropdownPosition ? (
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: dropdownPosition.top,
          left: dropdownPosition.left,
          width: dropdownPosition.width,
          zIndex: 100,
        }}
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        data-employee-picker-dropdown
      >
        <div className="border-b border-border p-2">
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search by name or email"
            autoComplete="off"
            aria-controls={listboxId}
            className={`${inputClassName} shadow-none`}
          />
        </div>
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={ariaLabelledBy}
          style={{ maxHeight: dropdownPosition.listMaxHeight }}
          className="overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{EMPLOYEE_PICKER_EMPTY_MESSAGE}</li>
          ) : (
            filtered.map((employee, index) => {
              const highlighted = index === activeHighlightIndex;
              const selectedRow = employee.id === value;

              return (
                <li key={employee.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedRow}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => selectEmployee(employee.id)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors ${
                      highlighted || selectedRow
                        ? "bg-primary/10 text-slate-900"
                        : "text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-medium leading-snug">{employee.name}</span>
                    {employee.email ? (
                      <span className="text-xs text-muted">{employee.email}</span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((current) => {
            const next = !current;
            if (next) {
              setHighlightIndex(0);
            }
            return next;
          });
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`${selectClassName} flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={selected ? "truncate text-foreground" : "truncate text-muted"}>
          {selected?.name ?? placeholder}
        </span>
        <span className="shrink-0 text-xs text-muted" aria-hidden>
          ▼
        </span>
      </button>

      {typeof document !== "undefined" && dropdownPanel
        ? createPortal(dropdownPanel, document.body)
        : null}
    </div>
  );
}

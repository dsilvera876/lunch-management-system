"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  cancelStaffLateOrderRequestAction,
  createStaffLateOrderRequestAction,
  updateStaffLateOrderRequestAction,
  type EligibleLateOrderCycle,
  type StaffLateOrderRequestRow,
} from "@/app/home/staff-late-order-request-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { formControlLabelClassName, inputClassName, selectClassName } from "@/components/ui/form-field";
import { formatHumanDate } from "@/lib/format";
import { focusFormErrorSummary, joinDescribedBy } from "@/lib/staff-form-accessibility";

type Props = {
  orderingOpen: boolean;
  eligibleCycles: EligibleLateOrderCycle[];
  requests: StaffLateOrderRequestRow[];
};

type FieldKey = "cycle" | "summary" | "quantity" | "instructions";

function cycleKey(c: EligibleLateOrderCycle): string {
  return `${c.provider_id}:${c.scheduled_delivery_date}`;
}

export function StaffLateOrderRequestPanel({ orderingOpen, eligibleCycles, requests }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FieldKey | "general" | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const createFormRef = useRef<HTMLFormElement>(null);
  const cycleSelectRef = useRef<HTMLSelectElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const successStatusId = useId();
  const errorSummaryId = useId();
  const cycleFieldId = useId();
  const summaryFieldId = useId();
  const summaryHelperId = useId();
  const summaryErrorId = useId();
  const quantityFieldId = useId();
  const quantityErrorId = useId();
  const instructionsFieldId = useId();
  const instructionsHelperId = useId();
  const instructionsErrorId = useId();

  const showEntry = !orderingOpen && eligibleCycles.length > 0;

  const cycleOptions = eligibleCycles.filter((c, index, list) => {
    const key = cycleKey(c);
    return list.findIndex((item) => cycleKey(item) === key) === index;
  });

  const [selectedCycleKey, setSelectedCycleKey] = useState(
    cycleOptions[0] ? cycleKey(cycleOptions[0]) : "",
  );
  const selectedCycle = cycleOptions.find((c) => cycleKey(c) === selectedCycleKey) ?? null;

  const [summary, setSummary] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [instructions, setInstructions] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRequest = requests.find((r) => r.id === editingId) ?? null;
  const editFormRef = useRef<HTMLFormElement>(null);

  function clearFieldValidation() {
    setError(null);
    setInvalidField(null);
  }

  function setFormError(message: string, field: FieldKey | "general" = "general") {
    setError(message);
    setInvalidField(field);
  }

  useLayoutEffect(() => {
    if (error) {
      focusFormErrorSummary(errorSummaryRef.current);
    }
  }, [error]);

  useEffect(() => {
    if (open && showEntry) {
      window.requestAnimationFrame(() => {
        cycleSelectRef.current?.focus();
      });
    }
  }, [open, showEntry]);

  useEffect(() => {
    if (editingId) {
      window.requestAnimationFrame(() => {
        editFormRef.current?.querySelector<HTMLElement>("textarea")?.focus();
      });
    }
  }, [editingId]);

  if (!showEntry && requests.length === 0) {
    return null;
  }

  function refresh() {
    startTransition(() => router.refresh());
  }

  function validateLateOrderFields(options: { requireCycle: boolean }): boolean {
    if (options.requireCycle && !selectedCycle) {
      setFormError("Choose a delivery date and provider.", "cycle");
      return false;
    }

    if (!summary.trim()) {
      setFormError("Describe what you would like to order.", "summary");
      return false;
    }

    const parsedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10) {
      setFormError("Quantity must be between 1 and 10.", "quantity");
      return false;
    }

    if (instructions.length > 500) {
      setFormError("Special instructions must be 500 characters or fewer.", "instructions");
      return false;
    }

    return true;
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    clearFieldValidation();

    if (!validateLateOrderFields({ requireCycle: true }) || !selectedCycle) {
      return;
    }

    startTransition(async () => {
      const result = await createStaffLateOrderRequestAction({
        providerId: selectedCycle.provider_id,
        scheduledDeliveryDate: selectedCycle.scheduled_delivery_date,
        requestedSummary: summary,
        quantity: Number.parseInt(quantity, 10),
        specialInstructions: instructions,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setSuccessMessage("Late order request submitted.");
      setOpen(false);
      setSummary("");
      setInstructions("");
      setQuantity("1");
      refresh();
    });
  }

  function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    clearFieldValidation();

    if (!validateLateOrderFields({ requireCycle: false }) || !editingRequest) {
      return;
    }

    startTransition(async () => {
      const result = await updateStaffLateOrderRequestAction({
        requestId: editingRequest.id,
        requestedSummary: summary,
        quantity: Number.parseInt(quantity, 10),
        specialInstructions: instructions,
        expectedUpdatedAt: editingRequest.updated_at,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      setSuccessMessage("Late order request updated.");
      setEditingId(null);
      refresh();
    });
  }

  function handleCancel(requestId: string) {
    clearFieldValidation();
    startTransition(async () => {
      const result = await cancelStaffLateOrderRequestAction(requestId);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setSuccessMessage("Late order request cancelled.");
      refresh();
    });
  }

  function closeCreateForm() {
    setOpen(false);
    clearFieldValidation();
  }

  const errorSummary =
    error ? (
      <FormActionStatus ref={errorSummaryRef} id={errorSummaryId} variant="error" className="mt-3">
        {error}
      </FormActionStatus>
    ) : null;

  const sharedRequestFields = (
    <>
      <div>
        <label htmlFor={summaryFieldId} className={formControlLabelClassName}>
          What I&apos;d like{" "}
          <span aria-hidden="true" className="text-red-700" title="Required field">
            *
          </span>
        </label>
        <textarea
          id={summaryFieldId}
          className={inputClassName}
          rows={3}
          maxLength={500}
          required
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
            clearFieldValidation();
          }}
          aria-invalid={invalidField === "summary" || undefined}
          aria-describedby={joinDescribedBy(
            summaryHelperId,
            invalidField === "summary" ? summaryErrorId : undefined,
          )}
        />
        <p id={summaryHelperId} className="mt-1 text-xs text-muted">
          Required. Up to 500 characters.
        </p>
        {invalidField === "summary" && error ? (
          <p id={summaryErrorId} className="mt-1 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor={quantityFieldId} className={formControlLabelClassName}>
          Quantity{" "}
          <span aria-hidden="true" className="text-red-700" title="Required field">
            *
          </span>
        </label>
        <input
          id={quantityFieldId}
          className={inputClassName}
          type="number"
          min={1}
          max={10}
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            clearFieldValidation();
          }}
          required
          aria-invalid={invalidField === "quantity" || undefined}
          aria-describedby={invalidField === "quantity" ? quantityErrorId : undefined}
        />
        {invalidField === "quantity" && error ? (
          <p id={quantityErrorId} className="mt-1 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor={instructionsFieldId} className={formControlLabelClassName}>
          Special instructions <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id={instructionsFieldId}
          className={inputClassName}
          rows={2}
          maxLength={500}
          value={instructions}
          onChange={(e) => {
            setInstructions(e.target.value);
            clearFieldValidation();
          }}
          aria-invalid={invalidField === "instructions" || undefined}
          aria-describedby={joinDescribedBy(
            instructionsHelperId,
            invalidField === "instructions" ? instructionsErrorId : undefined,
          )}
        />
        <p id={instructionsHelperId} className="mt-1 text-xs text-muted">
          Optional. Up to 500 characters.
        </p>
        {invalidField === "instructions" && error ? (
          <p id={instructionsErrorId} className="mt-1 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <Card padding="md" className="shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Late order request</h2>
          <p className="mt-1 text-sm text-muted">
            Normal ordering is closed, but you can still ask for a late lunch before the provider cutoff.
          </p>
        </div>
        {showEntry ? (
          <Button
            type="button"
            variant="secondary"
            aria-expanded={open}
            onClick={() => {
              if (open) {
                closeCreateForm();
              } else {
                setOpen(true);
                setEditingId(null);
              }
            }}
          >
            {open ? "Close" : "Request a late order"}
          </Button>
        ) : null}
      </div>

      {successMessage ? (
        <p id={successStatusId} className="sr-only" role="status" aria-live="polite">
          {successMessage}
        </p>
      ) : null}

      {errorSummary}

      {open && showEntry ? (
        <form
          ref={createFormRef}
          onSubmit={handleCreate}
          className="mt-4 space-y-3 border-t border-border pt-4"
          noValidate
        >
          <div>
            <label htmlFor={cycleFieldId} className={formControlLabelClassName}>
              Delivery date & provider{" "}
              <span aria-hidden="true" className="text-red-700" title="Required field">
                *
              </span>
            </label>
            <select
              id={cycleFieldId}
              ref={cycleSelectRef}
              className={selectClassName}
              value={selectedCycleKey}
              onChange={(e) => {
                setSelectedCycleKey(e.target.value);
                clearFieldValidation();
              }}
              required
              aria-invalid={invalidField === "cycle" || undefined}
            >
              {cycleOptions.map((c) => (
                <option key={cycleKey(c)} value={cycleKey(c)}>
                  {formatHumanDate(c.scheduled_delivery_date)} — {c.provider_name}
                </option>
              ))}
            </select>
          </div>
          {sharedRequestFields}
          <Button type="submit" variant="primary">
            Submit request
          </Button>
        </form>
      ) : null}

      {editingRequest ? (
        <form
          ref={editFormRef}
          onSubmit={handleUpdate}
          className="mt-4 space-y-3 border-t border-border pt-4"
          noValidate
        >
          <p className="text-sm font-medium text-foreground">Edit pending request</p>
          {sharedRequestFields}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary">
              Save changes
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
              Cancel edit
            </Button>
          </div>
        </form>
      ) : null}

      {requests.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-border pt-4">
          {requests.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {request.provider_name} · {formatHumanDate(request.scheduled_delivery_date)}
                  </p>
                  <p className="text-muted capitalize">{request.status}</p>
                  <p className="mt-1">{request.requested_summary}</p>
                  {request.status === "declined" && request.decline_reason ? (
                    <p className="mt-1 text-muted" role="status">
                      Reason: {request.decline_reason}
                    </p>
                  ) : null}
                </div>
                {request.status === "pending" ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(request.id);
                        setSummary(request.requested_summary);
                        setQuantity(String(request.quantity));
                        setInstructions(request.special_instructions ?? "");
                        setOpen(false);
                        clearFieldValidation();
                      }}
                    >
                      Edit
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => handleCancel(request.id)}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
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

type Props = {
  orderingOpen: boolean;
  eligibleCycles: EligibleLateOrderCycle[];
  requests: StaffLateOrderRequestRow[];
};

function cycleKey(c: EligibleLateOrderCycle): string {
  return `${c.provider_id}:${c.scheduled_delivery_date}`;
}

export function StaffLateOrderRequestPanel({ orderingOpen, eligibleCycles, requests }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const createFormRef = useRef<HTMLFormElement>(null);
  const cycleSelectRef = useRef<HTMLSelectElement>(null);
  const successStatusId = useId();

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

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCycle) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createStaffLateOrderRequestAction({
        providerId: selectedCycle.provider_id,
        scheduledDeliveryDate: selectedCycle.scheduled_delivery_date,
        requestedSummary: summary,
        quantity: Number.parseInt(quantity, 10),
        specialInstructions: instructions,
      });

      if (!result.ok) {
        setError(result.error);
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
    if (!editingRequest) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateStaffLateOrderRequestAction({
        requestId: editingRequest.id,
        requestedSummary: summary,
        quantity: Number.parseInt(quantity, 10),
        specialInstructions: instructions,
        expectedUpdatedAt: editingRequest.updated_at,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccessMessage("Late order request updated.");
      setEditingId(null);
      refresh();
    });
  }

  function handleCancel(requestId: string) {
    setError(null);
    startTransition(async () => {
      const result = await cancelStaffLateOrderRequestAction(requestId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessMessage("Late order request cancelled.");
      refresh();
    });
  }

  function closeCreateForm() {
    setOpen(false);
    setError(null);
  }

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

      {error ? (
        <FormActionStatus variant="error" className="mt-3">
          {error}
        </FormActionStatus>
      ) : null}

      {open && showEntry ? (
        <form
          ref={createFormRef}
          onSubmit={handleCreate}
          className="mt-4 space-y-3 border-t border-border pt-4"
        >
          <label className={formControlLabelClassName}>
            Delivery date & provider
            <select
              ref={cycleSelectRef}
              className={selectClassName}
              value={selectedCycleKey}
              onChange={(e) => setSelectedCycleKey(e.target.value)}
              required
            >
              {cycleOptions.map((c) => (
                <option key={cycleKey(c)} value={cycleKey(c)}>
                  {formatHumanDate(c.scheduled_delivery_date)} — {c.provider_name}
                </option>
              ))}
            </select>
          </label>
          <label className={formControlLabelClassName}>
            What I&apos;d like
            <textarea
              className={inputClassName}
              rows={3}
              maxLength={500}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label className={formControlLabelClassName}>
            Quantity
            <input
              className={inputClassName}
              type="number"
              min={1}
              max={10}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>
          <label className={formControlLabelClassName}>
            Special instructions (optional)
            <textarea
              className={inputClassName}
              rows={2}
              maxLength={500}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
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
        >
          <p className="text-sm font-medium text-foreground">Edit pending request</p>
          <label className={formControlLabelClassName}>
            What I&apos;d like
            <textarea
              className={inputClassName}
              rows={3}
              maxLength={500}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <label className={formControlLabelClassName}>
            Quantity
            <input
              className={inputClassName}
              type="number"
              min={1}
              max={10}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>
          <label className={formControlLabelClassName}>
            Special instructions (optional)
            <textarea
              className={inputClassName}
              rows={2}
              maxLength={500}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </label>
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
                    <p className="mt-1 text-muted">Reason: {request.decline_reason}</p>
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

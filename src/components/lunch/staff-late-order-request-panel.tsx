"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  createStaffLateOrderRequestAction,
  type EligibleLateOrderCycle,
  type StaffLateOrderRequestRow,
} from "@/app/home/staff-late-order-request-actions";
import { Button } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { formControlLabelClassName, inputClassName, selectClassName } from "@/components/ui/form-field";
import { formatHumanDate } from "@/lib/format";
import { focusFormErrorSummary, joinDescribedBy } from "@/lib/staff-form-accessibility";
import { useStaffLateOrderDrawerOptional } from "@/components/lunch/staff-late-order-drawer";
import { buildLateOrderSubmitFeedback } from "@/lib/staff-late-order-submission-feedback";
import {
  findBlockingLateOrderSubmission,
  MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF,
} from "@/lib/staff-late-order-submissions";

export type StaffLateOrderRequestPanelProps = {
  orderingOpen: boolean;
  eligibleCycles: EligibleLateOrderCycle[];
  requests: StaffLateOrderRequestRow[];
  deliveryDate: string;
  officeLocationId?: string;
  savedDefaultOfficeLocationId?: string | null;
  saveAsDefault?: boolean;
  locationRequired?: boolean;
  eligibilityLoading?: boolean;
  variant?: "drawer";
};

const LATE_ORDER_ONE_PER_PROVIDER_HELPER =
  "You can only place one late lunch order per lunch provider today.";

type FieldKey = "cycle" | "summary" | "quantity" | "instructions";

function cycleKey(c: EligibleLateOrderCycle): string {
  return `${c.provider_id}:${c.scheduled_delivery_date}`;
}

export function StaffLateOrderRequestPanel({
  orderingOpen,
  eligibleCycles,
  requests,
  deliveryDate,
  officeLocationId = "",
  savedDefaultOfficeLocationId = null,
  saveAsDefault = false,
  locationRequired = false,
  eligibilityLoading = false,
  variant = "drawer",
}: StaffLateOrderRequestPanelProps) {
  void orderingOpen;
  void variant;
  const router = useRouter();
  const lateOrderDrawer = useStaffLateOrderDrawerOptional();
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FieldKey | "general" | null>(null);
  const [, startTransition] = useTransition();
  const createFormRef = useRef<HTMLFormElement>(null);
  const cycleSelectRef = useRef<HTMLSelectElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
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

  const cycleOptions = useMemo(
    () =>
      eligibleCycles
        .filter((c, index, list) => {
          const key = cycleKey(c);
          return list.findIndex((item) => cycleKey(item) === key) === index;
        })
        .filter(
          (cycle) =>
            !findBlockingLateOrderSubmission(
              requests,
              cycle.provider_id,
              cycle.scheduled_delivery_date,
            ),
        ),
    [eligibleCycles, requests],
  );

  const showEntry = cycleOptions.length > 0;

  const [selectedCycleKey, setSelectedCycleKey] = useState(
    cycleOptions[0] ? cycleKey(cycleOptions[0]) : "",
  );
  const effectiveSelectedCycleKey = useMemo(() => {
    if (cycleOptions.length === 0) {
      return "";
    }

    if (cycleOptions.some((cycle) => cycleKey(cycle) === selectedCycleKey)) {
      return selectedCycleKey;
    }

    return cycleKey(cycleOptions[0]!);
  }, [cycleOptions, selectedCycleKey]);
  const selectedCycle =
    cycleOptions.find((cycle) => cycleKey(cycle) === effectiveSelectedCycleKey) ?? null;

  const blockingSubmission =
    selectedCycle != null
      ? findBlockingLateOrderSubmission(
          requests,
          selectedCycle.provider_id,
          selectedCycle.scheduled_delivery_date,
        )
      : null;

  const [summary, setSummary] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [instructions, setInstructions] = useState("");

  function clearFieldValidation() {
    setError(null);
    setInvalidField(null);
  }

  useLayoutEffect(() => {
    if (error) {
      focusFormErrorSummary(errorSummaryRef.current);
    }
  }, [error]);

  useEffect(() => {
    if (showEntry) {
      window.requestAnimationFrame(() => {
        cycleSelectRef.current?.focus();
      });
    }
  }, [showEntry]);

  if (locationRequired && !officeLocationId) {
    return (
      <p className="text-sm text-staff-instruction">
        Select a delivery location above to view eligible providers or submit a new late order.
      </p>
    );
  }

  if (eligibilityLoading && !showEntry) {
    return (
      <p className="text-sm text-staff-instruction" role="status" aria-live="polite">
        Checking late-order availability…
      </p>
    );
  }

  if (!showEntry && !blockingSubmission) {
    const hasBlockedProvidersOnly =
      eligibleCycles.length > 0 &&
      eligibleCycles.every((cycle) =>
        findBlockingLateOrderSubmission(requests, cycle.provider_id, cycle.scheduled_delivery_date),
      );
    const hasExistingSubmissionOnDate = requests.some((request) => {
      if (request.scheduled_delivery_date !== deliveryDate) {
        return false;
      }
      const status = request.status.trim().toLowerCase();
      return status === "pending" || status === "fulfilled";
    });

    if (hasBlockedProvidersOnly || hasExistingSubmissionOnDate) {
      return (
        <div className="space-y-2 text-sm text-staff-instruction">
          <p role="status">
            You already have a late order submission for this provider and delivery date.
          </p>
          <Link
            href={MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF}
            className="inline-flex min-h-10 items-center font-medium text-staff-teal hover:underline"
          >
            View late order submissions
          </Link>
        </div>
      );
    }

    return (
      <p className="text-sm text-staff-instruction">
        No late-order providers are available for this delivery date at the selected location.
      </p>
    );
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

  function setFormError(message: string, field: FieldKey | "general" = "general") {
    setError(message);
    setInvalidField(field);
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    clearFieldValidation();

    if (!validateLateOrderFields({ requireCycle: true }) || !selectedCycle) {
      return;
    }

    if (!officeLocationId) {
      setFormError("Choose a delivery location before submitting.", "general");
      return;
    }

    lateOrderDrawer?.clearSubmissionFeedback();

    startTransition(async () => {
      const result = await createStaffLateOrderRequestAction({
        providerId: selectedCycle.provider_id,
        scheduledDeliveryDate: selectedCycle.scheduled_delivery_date,
        requestedSummary: summary,
        quantity: Number.parseInt(quantity, 10),
        specialInstructions: instructions,
        officeLocationId,
        saveAsDefault,
        savedDefaultOfficeLocationId,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      if (lateOrderDrawer) {
        lateOrderDrawer.setSubmissionFeedback(
          buildLateOrderSubmitFeedback(result.defaultSaveWarning),
        );
      }
      setSummary("");
      setInstructions("");
      setQuantity("1");
      refresh();
    });
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

  if (blockingSubmission) {
    return (
      <div className="space-y-2 text-sm text-staff-instruction">
        <p role="status">
          You already have a late order submission for this provider and delivery date.
        </p>
        <Link
          href={MY_ORDERS_LATE_ORDER_SUBMISSIONS_HREF}
          className="inline-flex min-h-10 items-center font-medium text-staff-teal hover:underline"
        >
          View late order submissions
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-staff-instruction">
        Submit a late order request before the provider cutoff. HR must review and fulfill approved
        requests—submitting does not create an order by itself.
      </p>

      {errorSummary}

      {showEntry ? (
        <form
          ref={createFormRef}
          onSubmit={handleCreate}
          className="mt-4 space-y-3"
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
              value={effectiveSelectedCycleKey}
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
          <p className="text-sm text-staff-instruction">{LATE_ORDER_ONE_PER_PROVIDER_HELPER}</p>
          <Button type="submit" variant="primary" staffPrimaryCta>
            Submit late order
          </Button>
        </form>
      ) : null}
    </>
  );
}

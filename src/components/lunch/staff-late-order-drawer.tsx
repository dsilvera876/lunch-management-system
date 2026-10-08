"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  loadStaffLateOrderEligibleCyclesAction,
  type EligibleLateOrderCycle,
} from "@/app/home/staff-late-order-request-actions";
import { Button } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { IconX } from "@/components/icons/line-icons";
import { formControlLabelClassName, selectClassName } from "@/components/ui/form-field";
import { formatHumanDate } from "@/lib/format";
import {
  getOfficeLocationDisplayName,
  resolveInitialOfficeLocationId,
} from "@/lib/lunch-office-location-selection";
import {
  resolveLateOrderSaveAsDefaultCheckboxState,
  resolveLateOrderSaveAsDefaultOnLocationChange,
} from "@/lib/staff-late-order-location-save";
import {
  formatOfficeLocationLabel,
  type OfficeLocationOption,
} from "@/lib/office-locations";
import {
  collectStaffLateOrderDeliveryDates,
  collectStaffLateOrderDrawerDeliveryDates,
  filterStaffLateOrderForDeliveryDate,
  reconcileStaffLateOrderDeliveryDate,
  staffLateOrderActionLabel,
  staffLateOrderActionKind,
  staffLateOrderDrawerTitle,
  staffLateOrderDrawerVisible,
  staffLateOrderNewRequestAvailable,
  type StaffLateOrderNewRequestSummary,
  type StaffLateOrderTodayContext,
} from "@/lib/staff-late-order-today";
import {
  StaffLateOrderRequestPanel,
  type StaffLateOrderRequestPanelProps,
} from "@/components/lunch/staff-late-order-request-panel";

type DrawerContextValue = {
  jamaicaToday: string;
  orderingOpen: boolean;
  fullContext: StaffLateOrderTodayContext;
  selectedDeliveryDate: string;
  setSelectedDeliveryDate: (date: string) => void;
  deliveryDates: string[];
  highlightFromQuery: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  handleDrawerOpenChange: (open: boolean) => void;
  officeLocations: OfficeLocationOption[];
  selectedOfficeLocationId: string;
  savedDefaultOfficeLocationId: string | null;
  saveAsDefault: boolean;
  setSaveAsDefault: (value: boolean) => void;
  locationDisplayName: string | null;
  cyclesLoading: boolean;
  locationError: string | null;
  newLateOrderOpportunity: boolean;
  lateOrderSummary: StaffLateOrderNewRequestSummary | null;
  submissionFeedback: LateOrderSubmissionFeedback;
  setSubmissionFeedback: (feedback: LateOrderSubmissionFeedback) => void;
  clearSubmissionFeedback: () => void;
};

export type LateOrderSubmissionFeedback = {
  successMessage: string | null;
  warningMessage: string | null;
};

const EMPTY_SUBMISSION_FEEDBACK: LateOrderSubmissionFeedback = {
  successMessage: null,
  warningMessage: null,
};

const StaffLateOrderDrawerContext = createContext<DrawerContextValue | null>(null);

function useStaffLateOrderDrawer() {
  const value = useContext(StaffLateOrderDrawerContext);
  if (!value) {
    throw new Error("StaffLateOrderDrawer components must be used within StaffLateOrderDrawerRoot");
  }
  return value;
}

export function useStaffLateOrderDrawerOptional() {
  return useContext(StaffLateOrderDrawerContext);
}

type RootProps = Pick<StaffLateOrderRequestPanelProps, "orderingOpen" | "requests"> & {
  jamaicaToday: string;
  defaultDeliveryDate: string;
  deliveryDates: string[];
  eligibleCycles: EligibleLateOrderCycle[];
  officeLocations: OfficeLocationOption[];
  defaultOfficeLocationId: string | null;
  defaultOfficeLocationInactive: boolean;
  newLateOrderOpportunity?: boolean;
  lateOrderSummary?: StaffLateOrderNewRequestSummary | null;
  highlightFromQuery?: boolean;
  children: ReactNode;
};

export function StaffLateOrderDrawerRoot({
  jamaicaToday,
  defaultDeliveryDate,
  deliveryDates: initialDeliveryDates,
  orderingOpen,
  eligibleCycles: initialEligibleCycles,
  requests,
  officeLocations,
  defaultOfficeLocationId,
  defaultOfficeLocationInactive,
  newLateOrderOpportunity = false,
  lateOrderSummary = null,
  highlightFromQuery = false,
  children,
}: RootProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialOfficeLocationId = useMemo(
    () =>
      resolveInitialOfficeLocationId(
        officeLocations,
        defaultOfficeLocationId,
        defaultOfficeLocationInactive,
      ),
    [officeLocations, defaultOfficeLocationId, defaultOfficeLocationInactive],
  );

  const [selectedOfficeLocationId, setSelectedOfficeLocationId] = useState(initialOfficeLocationId);
  const [eligibleCycles, setEligibleCycles] = useState(initialEligibleCycles);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [saveAsDefault, setSaveAsDefault] = useState(() =>
    resolveLateOrderSaveAsDefaultCheckboxState(
      defaultOfficeLocationId,
      initialOfficeLocationId,
    ).checked,
  );
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(defaultDeliveryDate);
  const [deliveryDates, setDeliveryDates] = useState(initialDeliveryDates);

  const fullContext = useMemo(
    (): StaffLateOrderTodayContext => ({ eligibleCycles, requests }),
    [eligibleCycles, requests],
  );

  const [drawerOpen, setDrawerOpen] = useState(
    () =>
      highlightFromQuery &&
      staffLateOrderNewRequestAvailable(fullContext, newLateOrderOpportunity),
  );
  const [submissionFeedback, setSubmissionFeedbackState] =
    useState<LateOrderSubmissionFeedback>(EMPTY_SUBMISSION_FEEDBACK);

  const setSubmissionFeedback = useCallback((feedback: LateOrderSubmissionFeedback) => {
    setSubmissionFeedbackState(feedback);
  }, []);

  const clearSubmissionFeedback = useCallback(() => {
    setSubmissionFeedbackState(EMPTY_SUBMISSION_FEEDBACK);
  }, []);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      setDrawerOpen(open);
      if (!open) {
        clearSubmissionFeedback();
      }
    },
    [clearSubmissionFeedback],
  );

  const locationFetchGenerationRef = useRef(0);

  const syncDeliveryDatesForCycles = useCallback(
    (cycles: EligibleLateOrderCycle[]) => {
      const context = { eligibleCycles: cycles, requests };
      const dates =
        cycles.length > 0
          ? collectStaffLateOrderDeliveryDates(context)
          : collectStaffLateOrderDrawerDeliveryDates(context, {
              newLateOrderOpportunity,
              summary: lateOrderSummary,
              preLocationOnly: !selectedOfficeLocationId,
            });
      setDeliveryDates(dates);
      setSelectedDeliveryDate((current) =>
        reconcileStaffLateOrderDeliveryDate(dates, jamaicaToday, current),
      );
    },
    [jamaicaToday, lateOrderSummary, newLateOrderOpportunity, requests, selectedOfficeLocationId],
  );

  const beginLocationEligibilityFetch = useCallback(() => {
    const generation = locationFetchGenerationRef.current + 1;
    locationFetchGenerationRef.current = generation;
    setCyclesLoading(true);
    setLocationError(null);
    setEligibleCycles([]);
    syncDeliveryDatesForCycles([]);
    return generation;
  }, [syncDeliveryDatesForCycles]);

  const refreshCyclesForLocation = useCallback(
    async (locationId: string, generation: number) => {
      if (!locationId) {
        if (generation !== locationFetchGenerationRef.current) {
          return;
        }
        setCyclesLoading(false);
        setEligibleCycles([]);
        syncDeliveryDatesForCycles([]);
        return;
      }

      const result = await loadStaffLateOrderEligibleCyclesAction(locationId);

      if (generation !== locationFetchGenerationRef.current) {
        return;
      }

      setCyclesLoading(false);

      if (!result.ok) {
        setLocationError(result.error);
        setEligibleCycles([]);
        syncDeliveryDatesForCycles([]);
        return;
      }

      setEligibleCycles(result.eligibleCycles);
      syncDeliveryDatesForCycles(result.eligibleCycles);
    },
    [syncDeliveryDatesForCycles],
  );

  useEffect(() => {
    if (!initialOfficeLocationId || initialEligibleCycles.length > 0) {
      return;
    }

    if (
      defaultOfficeLocationId &&
      initialOfficeLocationId === defaultOfficeLocationId &&
      !defaultOfficeLocationInactive
    ) {
      return;
    }

    queueMicrotask(() => {
      const generation = beginLocationEligibilityFetch();
      void refreshCyclesForLocation(initialOfficeLocationId, generation);
    });
  }, [
    beginLocationEligibilityFetch,
    defaultOfficeLocationId,
    defaultOfficeLocationInactive,
    initialEligibleCycles.length,
    initialOfficeLocationId,
    refreshCyclesForLocation,
  ]);

  function handleSelectOfficeLocation(locationId: string) {
    if (!locationId) {
      return;
    }

    clearSubmissionFeedback();
    setSelectedOfficeLocationId(locationId);
    setLocationError(null);
    setSaveAsDefault(
      resolveLateOrderSaveAsDefaultOnLocationChange(defaultOfficeLocationId, locationId),
    );
    const generation = beginLocationEligibilityFetch();
    void refreshCyclesForLocation(locationId, generation);
  }

  const locationDisplayName = getOfficeLocationDisplayName(
    officeLocations,
    selectedOfficeLocationId,
    null,
  );

  if (!staffLateOrderDrawerVisible(fullContext, { newLateOrderOpportunity })) {
    return null;
  }

  return (
    <StaffLateOrderDrawerContext.Provider
      value={{
        jamaicaToday,
        orderingOpen,
        fullContext,
        selectedDeliveryDate,
        setSelectedDeliveryDate,
        deliveryDates,
        highlightFromQuery,
        triggerRef,
        drawerOpen,
        setDrawerOpen,
        handleDrawerOpenChange,
        officeLocations,
        selectedOfficeLocationId,
        savedDefaultOfficeLocationId: defaultOfficeLocationId,
        saveAsDefault,
        setSaveAsDefault,
        locationDisplayName,
        cyclesLoading,
        locationError,
        newLateOrderOpportunity,
        lateOrderSummary,
        submissionFeedback,
        setSubmissionFeedback,
        clearSubmissionFeedback,
      }}
    >
      {children}
      <StaffLateOrderDrawerSurface
        orderingOpen={orderingOpen}
        onSelectOfficeLocation={handleSelectOfficeLocation}
      />
    </StaffLateOrderDrawerContext.Provider>
  );
}

type TriggerProps = {
  prominent?: boolean;
  className?: string;
};

export function StaffLateOrderDrawerTrigger({ prominent = false, className = "" }: TriggerProps) {
  const {
    fullContext,
    jamaicaToday,
    triggerRef,
    setDrawerOpen,
    newLateOrderOpportunity,
    lateOrderSummary,
  } = useStaffLateOrderDrawer();
  const kind = staffLateOrderActionKind(fullContext, { newLateOrderOpportunity });
  const label = staffLateOrderActionLabel(fullContext, jamaicaToday, {
    newLateOrderOpportunity,
    summary: lateOrderSummary,
  });

  if (!label || kind !== "submit") {
    return null;
  }

  return (
    <Button
      ref={triggerRef}
      type="button"
      variant={prominent ? "primary" : "secondary"}
      staffPrimaryCta={prominent}
      className={className}
      onClick={() => setDrawerOpen(true)}
    >
      {label}
    </Button>
  );
}

function StaffLateOrderDrawerSurface({
  orderingOpen,
  onSelectOfficeLocation,
}: {
  orderingOpen: boolean;
  onSelectOfficeLocation: (locationId: string) => void;
}) {
  const {
    drawerOpen,
    handleDrawerOpenChange,
    triggerRef,
    jamaicaToday,
    fullContext,
    selectedDeliveryDate,
    setSelectedDeliveryDate,
    deliveryDates,
    officeLocations,
    selectedOfficeLocationId,
    savedDefaultOfficeLocationId,
    saveAsDefault,
    setSaveAsDefault,
    cyclesLoading,
    locationError,
    submissionFeedback,
    clearSubmissionFeedback,
  } = useStaffLateOrderDrawer();
  const titleId = useId();
  const deliveryFieldId = useId();
  const locationFieldId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const scopedContext = useMemo(
    () => filterStaffLateOrderForDeliveryDate(fullContext, selectedDeliveryDate),
    [fullContext, selectedDeliveryDate],
  );

  const drawerTitle = staffLateOrderDrawerTitle(selectedDeliveryDate, jamaicaToday);
  const saveAsDefaultControl = resolveLateOrderSaveAsDefaultCheckboxState(
    savedDefaultOfficeLocationId,
    selectedOfficeLocationId,
  );

  function handleDeliveryDateChange(date: string) {
    clearSubmissionFeedback();
    setSelectedDeliveryDate(date);
  }

  return (
    <FocusTrapPopover
      open={drawerOpen}
      onOpenChange={handleDrawerOpenChange}
      triggerRef={triggerRef}
      labelId={titleId}
      modal
      anchorPosition={false}
      initialFocusRef={headingRef}
      className="fixed inset-0 z-[60] flex justify-end"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 motion-reduce:transition-none"
        aria-label="Close late order drawer"
        onClick={() => handleDrawerOpenChange(false)}
      />
      <div
        id="late-order-request"
        className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-xl motion-reduce:transition-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {drawerTitle}
            </h2>
            {selectedDeliveryDate ? (
              <p className="mt-1 text-sm text-staff-instruction">
                {formatHumanDate(selectedDeliveryDate)}
              </p>
            ) : null}

            {officeLocations.length > 0 ? (
              <div className="mt-3">
                <label htmlFor={locationFieldId} className={formControlLabelClassName}>
                  Delivery location
                </label>
                <select
                  id={locationFieldId}
                  className={`${selectClassName} mt-1 w-full`}
                  value={selectedOfficeLocationId}
                  onChange={(event) => onSelectOfficeLocation(event.target.value)}
                >
                  {!selectedOfficeLocationId ? (
                    <option value="" disabled>
                      Select a location
                    </option>
                  ) : null}
                  {officeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {formatOfficeLocationLabel(location.name, location.address)}
                    </option>
                  ))}
                </select>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={saveAsDefaultControl.disabled ? saveAsDefaultControl.checked : saveAsDefault}
                    disabled={saveAsDefaultControl.disabled}
                    onChange={(event) => setSaveAsDefault(event.target.checked)}
                    className="mt-1 size-4 shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span>Save as my default delivery location</span>
                </label>
                {locationError ? (
                  <p className="mt-2 text-sm text-red-700" role="alert">
                    {locationError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {deliveryDates.length > 1 ? (
              <div className="mt-3">
                <label htmlFor={deliveryFieldId} className={formControlLabelClassName}>
                  Delivery date
                </label>
                <select
                  id={deliveryFieldId}
                  className={`${selectClassName} mt-1 w-full`}
                  value={selectedDeliveryDate}
                  onChange={(event) => handleDeliveryDateChange(event.target.value)}
                >
                  {deliveryDates.map((date) => (
                    <option key={date} value={date}>
                      {formatHumanDate(date)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            aria-label="Close late order drawer"
            onClick={() => handleDrawerOpenChange(false)}
          >
            <IconX size={18} />
          </Button>
        </header>
        {submissionFeedback.successMessage || submissionFeedback.warningMessage ? (
          <div className="space-y-2 border-b border-border px-5 py-3">
            {submissionFeedback.successMessage ? (
              <FormActionStatus variant="success">{submissionFeedback.successMessage}</FormActionStatus>
            ) : null}
            {submissionFeedback.warningMessage ? (
              <FormActionStatus variant="warning">{submissionFeedback.warningMessage}</FormActionStatus>
            ) : null}
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <StaffLateOrderRequestPanel
            variant="drawer"
            orderingOpen={orderingOpen}
            eligibleCycles={scopedContext.eligibleCycles}
            requests={scopedContext.requests}
            deliveryDate={selectedDeliveryDate}
            officeLocationId={selectedOfficeLocationId}
            savedDefaultOfficeLocationId={savedDefaultOfficeLocationId}
            saveAsDefault={saveAsDefault}
            locationRequired={officeLocations.length > 0 && !selectedOfficeLocationId}
            eligibilityLoading={cyclesLoading}
          />
        </div>
      </div>
    </FocusTrapPopover>
  );
}

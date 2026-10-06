"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { FocusTrapPopover } from "@/components/ui/focus-trap-popover";
import { IconX } from "@/components/icons/line-icons";
import { formControlLabelClassName, selectClassName } from "@/components/ui/form-field";
import { formatHumanDate } from "@/lib/format";
import {
  filterStaffLateOrderForDeliveryDate,
  staffLateOrderCreateAvailable,
  staffLateOrderDrawerTitle,
  staffLateOrderDrawerVisible,
  staffLateOrderTriggerLabel,
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
};

const StaffLateOrderDrawerContext = createContext<DrawerContextValue | null>(null);

function useStaffLateOrderDrawer() {
  const value = useContext(StaffLateOrderDrawerContext);
  if (!value) {
    throw new Error("StaffLateOrderDrawer components must be used within StaffLateOrderDrawerRoot");
  }
  return value;
}

type RootProps = Pick<
  StaffLateOrderRequestPanelProps,
  "orderingOpen" | "eligibleCycles" | "requests"
> & {
  jamaicaToday: string;
  defaultDeliveryDate: string;
  deliveryDates: string[];
  highlightFromQuery?: boolean;
  children: ReactNode;
};

export function StaffLateOrderDrawerRoot({
  jamaicaToday,
  defaultDeliveryDate,
  deliveryDates,
  orderingOpen,
  eligibleCycles,
  requests,
  highlightFromQuery = false,
  children,
}: RootProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fullContext = useMemo(
    (): StaffLateOrderTodayContext => ({ eligibleCycles, requests }),
    [eligibleCycles, requests],
  );
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(defaultDeliveryDate);
  const [drawerOpen, setDrawerOpen] = useState(
    () =>
      highlightFromQuery &&
      !orderingOpen &&
      staffLateOrderCreateAvailable(fullContext),
  );

  useEffect(() => {
    if (!highlightFromQuery || !staffLateOrderDrawerVisible(fullContext)) {
      return;
    }

    window.requestAnimationFrame(() => {
      triggerRef.current?.focus({ preventScroll: true });
    });
  }, [fullContext, highlightFromQuery]);

  if (!staffLateOrderDrawerVisible(fullContext)) {
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
      }}
    >
      {children}
      <StaffLateOrderDrawerSurface orderingOpen={orderingOpen} />
    </StaffLateOrderDrawerContext.Provider>
  );
}

type TriggerProps = {
  prominent?: boolean;
  className?: string;
};

export function StaffLateOrderDrawerTrigger({ prominent = false, className = "" }: TriggerProps) {
  const { fullContext, jamaicaToday, orderingOpen, triggerRef, setDrawerOpen } =
    useStaffLateOrderDrawer();
  const label = staffLateOrderTriggerLabel(fullContext, jamaicaToday, { orderingOpen, prominent });

  if (!label) {
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

function StaffLateOrderDrawerSurface({ orderingOpen }: { orderingOpen: boolean }) {
  const {
    drawerOpen,
    setDrawerOpen,
    triggerRef,
    jamaicaToday,
    fullContext,
    selectedDeliveryDate,
    setSelectedDeliveryDate,
    deliveryDates,
  } = useStaffLateOrderDrawer();
  const titleId = useId();
  const deliveryFieldId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const scopedContext = useMemo(
    () => filterStaffLateOrderForDeliveryDate(fullContext, selectedDeliveryDate),
    [fullContext, selectedDeliveryDate],
  );

  const drawerTitle = staffLateOrderDrawerTitle(selectedDeliveryDate, jamaicaToday);

  return (
    <FocusTrapPopover
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
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
        onClick={() => setDrawerOpen(false)}
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
            <p className="mt-1 text-sm text-staff-instruction">{formatHumanDate(selectedDeliveryDate)}</p>
            {deliveryDates.length > 1 ? (
              <div className="mt-3">
                <label htmlFor={deliveryFieldId} className={formControlLabelClassName}>
                  Delivery date
                </label>
                <select
                  id={deliveryFieldId}
                  className={`${selectClassName} mt-1 w-full`}
                  value={selectedDeliveryDate}
                  onChange={(event) => setSelectedDeliveryDate(event.target.value)}
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
            onClick={() => setDrawerOpen(false)}
          >
            <IconX size={18} />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <StaffLateOrderRequestPanel
            key={selectedDeliveryDate}
            variant="drawer"
            orderingOpen={orderingOpen}
            eligibleCycles={scopedContext.eligibleCycles}
            requests={scopedContext.requests}
            deliveryDate={selectedDeliveryDate}
          />
        </div>
      </div>
    </FocusTrapPopover>
  );
}

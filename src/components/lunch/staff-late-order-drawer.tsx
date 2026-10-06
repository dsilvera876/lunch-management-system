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
import { formatHumanDate } from "@/lib/format";
import {
  LATE_ORDER_DRAWER_TITLE,
  staffLateOrderCreateAvailable,
  staffLateOrderDrawerVisible,
  staffLateOrderTriggerLabel,
  type StaffLateOrderTodayContext,
} from "@/lib/staff-late-order-today";
import {
  StaffLateOrderRequestPanel,
  type StaffLateOrderRequestPanelProps,
} from "@/components/lunch/staff-late-order-request-panel";

type DrawerContextValue = {
  deliveryDate: string;
  jamaicaToday: string;
  orderingOpen: boolean;
  context: StaffLateOrderTodayContext;
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

type RootProps = StaffLateOrderRequestPanelProps & {
  deliveryDate: string;
  jamaicaToday: string;
  highlightFromQuery?: boolean;
  children: ReactNode;
};

export function StaffLateOrderDrawerRoot({
  deliveryDate,
  jamaicaToday,
  orderingOpen,
  eligibleCycles,
  requests,
  highlightFromQuery = false,
  children,
}: RootProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const context = useMemo(
    (): StaffLateOrderTodayContext => ({ eligibleCycles, requests }),
    [eligibleCycles, requests],
  );
  const [drawerOpen, setDrawerOpen] = useState(
    () =>
      highlightFromQuery &&
      !orderingOpen &&
      staffLateOrderCreateAvailable({ eligibleCycles, requests }),
  );

  useEffect(() => {
    if (!highlightFromQuery || !staffLateOrderDrawerVisible(context)) {
      return;
    }

    window.requestAnimationFrame(() => {
      triggerRef.current?.focus({ preventScroll: true });
    });
  }, [context, highlightFromQuery]);

  if (!staffLateOrderDrawerVisible(context)) {
    return null;
  }

  return (
    <StaffLateOrderDrawerContext.Provider
      value={{
        deliveryDate,
        jamaicaToday,
        orderingOpen,
        context,
        highlightFromQuery,
        triggerRef,
        drawerOpen,
        setDrawerOpen,
      }}
    >
      {children}
      <StaffLateOrderDrawerSurface
        deliveryDate={deliveryDate}
        orderingOpen={orderingOpen}
        eligibleCycles={eligibleCycles}
        requests={requests}
      />
    </StaffLateOrderDrawerContext.Provider>
  );
}

type TriggerProps = {
  prominent?: boolean;
  className?: string;
};

export function StaffLateOrderDrawerTrigger({ prominent = false, className = "" }: TriggerProps) {
  const { context, orderingOpen, triggerRef, setDrawerOpen } = useStaffLateOrderDrawer();
  const label = staffLateOrderTriggerLabel(context, { orderingOpen, prominent });

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

function StaffLateOrderDrawerSurface({
  deliveryDate,
  orderingOpen,
  eligibleCycles,
  requests,
}: StaffLateOrderRequestPanelProps & { deliveryDate: string }) {
  const { drawerOpen, setDrawerOpen, triggerRef } = useStaffLateOrderDrawer();
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

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
          <div>
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {LATE_ORDER_DRAWER_TITLE}
            </h2>
            <p className="mt-1 text-sm text-staff-instruction">{formatHumanDate(deliveryDate)}</p>
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
            variant="drawer"
            orderingOpen={orderingOpen}
            eligibleCycles={eligibleCycles}
            requests={requests}
            deliveryDate={deliveryDate}
          />
        </div>
      </div>
    </FocusTrapPopover>
  );
}

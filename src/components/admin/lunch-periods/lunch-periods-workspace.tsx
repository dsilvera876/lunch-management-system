"use client";

import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  LUNCH_PERIOD_SUCCESS_TOAST_DURATION_MS,
  lunchPeriodActionErrorMessage,
  type LunchPeriodActionErrorCode,
  type LunchPeriodActionResult,
} from "@/lib/lunch-period-action-feedback";

type LunchPeriodMutationAction = (
  formData: FormData,
) => Promise<LunchPeriodActionResult>;

type MutationFormProps = Omit<
  ComponentPropsWithoutRef<"form">,
  "action" | "children"
> & {
  mutationAction: LunchPeriodMutationAction;
  successMessage: string;
  focusAfterSuccessId: string;
  onSuccess?: () => void;
  children: ReactNode;
};

type LunchPeriodMutationContextValue = {
  mutationPending: boolean;
  beginMutation: () => number | null;
  isCurrentMutation: (generation: number) => boolean;
  finishMutation: (generation: number) => void;
  restoreFocus: (targetId: string, generation: number) => void;
};

const LunchPeriodMutationContext =
  createContext<LunchPeriodMutationContextValue | null>(null);

function useLunchPeriodMutationContext() {
  const context = useContext(LunchPeriodMutationContext);
  if (!context) {
    throw new Error(
      "LunchPeriodMutationForm must be used within LunchPeriodsWorkspace",
    );
  }
  return context;
}

export function LunchPeriodMutationForm({
  mutationAction,
  successMessage,
  focusAfterSuccessId,
  onSuccess,
  children,
  onSubmit,
  ...formProps
}: MutationFormProps) {
  const { showToast } = useToast();
  const {
    mutationPending,
    beginMutation,
    isCurrentMutation,
    finishMutation,
    restoreFocus,
  } = useLunchPeriodMutationContext();
  const mountedRef = useRef(true);
  const submissionQueuedRef = useRef(false);
  const submittingRef = useRef(false);
  const submissionGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const executeAction = useCallback(
    async (
      previousResult: LunchPeriodActionResult | null,
      formData: FormData,
    ): Promise<LunchPeriodActionResult | null> => {
      const generation = submissionGenerationRef.current;
      if (submittingRef.current || generation === null) {
        submissionQueuedRef.current = false;
        return previousResult;
      }

      submittingRef.current = true;

      try {
        const result = await mutationAction(formData);

        if (!mountedRef.current || !isCurrentMutation(generation)) {
          return previousResult;
        }

        if (!result.success) {
          return result;
        }

        onSuccess?.();
        showToast({
          title: successMessage,
          durationMs: LUNCH_PERIOD_SUCCESS_TOAST_DURATION_MS,
        });
        restoreFocus(focusAfterSuccessId, generation);
        return result;
      } catch {
        if (!mountedRef.current || !isCurrentMutation(generation)) {
          return previousResult;
        }

        return { success: false, error: "unexpected" };
      } finally {
        submissionQueuedRef.current = false;
        submittingRef.current = false;
        submissionGenerationRef.current = null;
        finishMutation(generation);
      }
    },
    [
      finishMutation,
      focusAfterSuccessId,
      isCurrentMutation,
      mutationAction,
      onSuccess,
      restoreFocus,
      showToast,
      successMessage,
    ],
  );

  const [actionResult, submitAction, pending] = useActionState<
    LunchPeriodActionResult | null,
    FormData
  >(executeAction, null);

  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      if (submissionQueuedRef.current) {
        event.preventDefault();
        return;
      }

      const generation = beginMutation();
      if (generation === null) {
        event.preventDefault();
        return;
      }

      submissionQueuedRef.current = true;
      submissionGenerationRef.current = generation;
      onSubmit?.(event);
      if (event.defaultPrevented) {
        submissionQueuedRef.current = false;
        submissionGenerationRef.current = null;
        finishMutation(generation);
      }
    },
    [beginMutation, finishMutation, onSubmit],
  );

  const errorCode: LunchPeriodActionErrorCode | null =
    !pending && actionResult && !actionResult.success
      ? actionResult.error
      : null;

  return (
    <form
      {...formProps}
      action={submitAction}
      aria-busy={pending || undefined}
      onSubmit={handleSubmit}
    >
      {errorCode ? (
        <FormActionStatus variant="error" className="mb-4">
          {lunchPeriodActionErrorMessage(errorCode)}
        </FormActionStatus>
      ) : null}
      <fieldset disabled={pending || mutationPending} className="contents">
        {children}
      </fieldset>
      <span
        className={pending ? "mt-2 inline-flex text-xs font-medium text-muted" : "sr-only"}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {pending ? "Saving lunch period changes." : ""}
      </span>
    </form>
  );
}

export function LunchPeriodsWorkspace({ children }: { children: ReactNode }) {
  const mountedRef = useRef(true);
  const mutationLockRef = useRef(false);
  const mutationGenerationRef = useRef(0);
  const activeMutationGenerationRef = useRef<number | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const [mutationPending, setMutationPending] = useState(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      mutationLockRef.current = false;
      activeMutationGenerationRef.current = null;
      mutationGenerationRef.current += 1;
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }
    };
  }, []);

  const beginMutation = useCallback(() => {
    if (!mountedRef.current || mutationLockRef.current) {
      return null;
    }

    const generation = mutationGenerationRef.current + 1;
    mutationGenerationRef.current = generation;
    mutationLockRef.current = true;
    setMutationPending(true);
    activeMutationGenerationRef.current = generation;
    return generation;
  }, []);

  const isCurrentMutation = useCallback((generation: number) => {
    return (
      mountedRef.current && activeMutationGenerationRef.current === generation
    );
  }, []);

  const isCurrentFocusGeneration = useCallback((generation: number) => {
    return mountedRef.current && mutationGenerationRef.current === generation;
  }, []);

  const finishMutation = useCallback((generation: number) => {
    if (activeMutationGenerationRef.current !== generation) {
      return;
    }

    mutationLockRef.current = false;
    activeMutationGenerationRef.current = null;
    if (mountedRef.current) {
      setMutationPending(false);
    }
  }, []);

  const restoreFocus = useCallback((targetId: string, generation: number) => {
    if (!isCurrentMutation(generation)) {
      return;
    }

    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }

    let remainingAttempts = 120;
    const focusWhenReady = () => {
      if (!isCurrentFocusGeneration(generation)) {
        focusFrameRef.current = null;
        return;
      }

      const target = document.getElementById(targetId);
      if (target instanceof HTMLElement && !target.matches(":disabled")) {
        target.focus({ preventScroll: true });
        focusFrameRef.current = null;
        return;
      }

      remainingAttempts -= 1;
      if (remainingAttempts > 0) {
        focusFrameRef.current = window.requestAnimationFrame(focusWhenReady);
      } else {
        focusFrameRef.current = null;
      }
    };

    focusFrameRef.current = window.requestAnimationFrame(focusWhenReady);
  }, [isCurrentFocusGeneration, isCurrentMutation]);

  const contextValue = useMemo(
    () => ({
      mutationPending,
      beginMutation,
      isCurrentMutation,
      finishMutation,
      restoreFocus,
    }),
    [beginMutation, finishMutation, isCurrentMutation, mutationPending, restoreFocus],
  );

  return (
    <ToastProvider>
      <LunchPeriodMutationContext.Provider value={contextValue}>
        {children}
      </LunchPeriodMutationContext.Provider>
    </ToastProvider>
  );
}

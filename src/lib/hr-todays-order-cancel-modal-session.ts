/** Draft fields cleared when a cancel session ends or the order changes. */
export type HrCancelModalDraftFields = {
  reason: string;
  error: string | null;
  submitting: boolean;
};

export const EMPTY_HR_CANCEL_MODAL_DRAFT: HrCancelModalDraftFields = {
  reason: "",
  error: null,
  submitting: false,
};

/** Drops an abandoned or completed cancel draft so the next open starts empty. */
export function hrCancelModalDraftOnSessionEnd(): HrCancelModalDraftFields {
  return { ...EMPTY_HR_CANCEL_MODAL_DRAFT };
}

/**
 * A shared modal instance must not keep a reason typed for a different order.
 * Each Today’s Orders row mounts its own modal; this still clears if `order` changes.
 */
export function hrCancelModalDraftForOrder(
  previousOrderId: string | null,
  nextOrderId: string,
  draft: HrCancelModalDraftFields,
): HrCancelModalDraftFields {
  if (previousOrderId !== null && previousOrderId !== nextOrderId) {
    return hrCancelModalDraftOnSessionEnd();
  }
  return draft;
}

/** Ignore a second Cancel order activation while the first request is in flight. */
export function shouldStartHrCancelSubmit(submitting: boolean): boolean {
  return !submitting;
}

export type HrCancelSubmitCompletion =
  | "apply-error"
  | "dismiss-and-notify"
  | "notify-only"
  | "ignore";

/**
 * A close or order switch invalidates the visible session, but a request that
 * already succeeded must still notify the page so it can refresh. Failures
 * after that point are ignored so they cannot land on a new session.
 */
export function hrCancelSubmitCompletion(input: {
  sessionMatches: boolean;
  ok: boolean;
}): HrCancelSubmitCompletion {
  if (input.ok) {
    return input.sessionMatches ? "dismiss-and-notify" : "notify-only";
  }
  return input.sessionMatches ? "apply-error" : "ignore";
}

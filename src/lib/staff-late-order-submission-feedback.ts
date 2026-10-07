export const LATE_ORDER_SUBMIT_SUCCESS_MESSAGE = "Late order submitted for review.";

export type LateOrderSubmissionFeedback = {
  successMessage: string | null;
  warningMessage: string | null;
};

export const EMPTY_LATE_ORDER_SUBMISSION_FEEDBACK: LateOrderSubmissionFeedback = {
  successMessage: null,
  warningMessage: null,
};

export function buildLateOrderSubmitFeedback(defaultSaveWarning?: string): LateOrderSubmissionFeedback {
  return {
    successMessage: LATE_ORDER_SUBMIT_SUCCESS_MESSAGE,
    warningMessage: defaultSaveWarning ?? null,
  };
}

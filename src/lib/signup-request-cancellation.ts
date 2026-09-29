import type { SignupRequestRow } from "@/lib/signup-request-presentation";

export type SignupCancellationReason =
  | "incorrect_email"
  | "duplicate_request"
  | "no_longer_needed"
  | "other";

export const SIGNUP_CANCELLATION_REASON_OPTIONS: {
  value: SignupCancellationReason;
  label: string;
}[] = [
  { value: "incorrect_email", label: "Incorrect email address" },
  { value: "duplicate_request", label: "Duplicate request" },
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "other", label: "Other" },
];

export function signupCancellationReasonLabel(
  reason: string | null | undefined,
): string | null {
  if (!reason) {
    return null;
  }

  return (
    SIGNUP_CANCELLATION_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? null
  );
}

export function signupRequestCanCancel(request: SignupRequestRow): boolean {
  if (request.created_profile_id !== null) {
    return false;
  }

  return request.status === "pending" || request.status === "approved";
}

export function mapCancelSignupRequestMessage(outcomeCode: string, message: string): string {
  switch (outcomeCode) {
    case "auth_account_exists":
    case "auth_cleanup_incomplete":
      return "Account setup cleanup is still in progress. Try cancelling again in a moment.";
    case "auth_cleanup_required":
      return message;
    case "business_history":
      return "This account has lunch history and cannot be removed from signup review. Deactivate the account from User Management instead.";
    case "unrelated_auth_identity":
      return "This signup request cannot be cancelled safely. Contact an administrator.";
    case "completed":
      return "This signup request is already linked to a user account.";
    case "not_cancellable":
      return message || "This signup request cannot be cancelled.";
    case "invalid_reason":
      return "Select a cancellation reason.";
    case "not_found":
      return "This signup request could not be found.";
    default:
      return message || "Unable to cancel this signup request.";
  }
}

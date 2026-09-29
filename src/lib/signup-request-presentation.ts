export type SignupRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type SignupRequestRow = {
  request_id: string;
  full_name: string;
  email: string;
  status: SignupRequestStatus;
  requested_at: string;
  requested_employee_id: string | null;
  created_profile_id: string | null;
  invite_sent_at: string | null;
  invite_last_error: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  /** Auth onboarding finished (invite accepted and/or first sign-in). */
  onboarding_established: boolean;
  total_count: number;
};

export function signupRequestNeedsInvitationResume(row: SignupRequestRow): boolean {
  return (
    row.status === "approved" &&
    !row.onboarding_established &&
    row.created_profile_id === null
  );
}

export function signupRequestOnboardingIncomplete(row: SignupRequestRow): boolean {
  return row.status === "approved" && !row.onboarding_established;
}

export const SIGNUP_REQUEST_PAGE_SIZE = 25;

export function signupRequestCountLabel(visible: number, total: number): string {
  if (total === 0) {
    return "No requests";
  }

  if (visible === total) {
    return total === 1 ? "1 request" : `${total} requests`;
  }

  return `Showing ${visible} of ${total} requests`;
}

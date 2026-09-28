export type UserDeletionReasonCategory = "test_account" | "duplicate_error" | "other";

export type UserDeletionEligibility = {
  profileId: string;
  canDelete: boolean;
  blockerCodes: string[];
  blockerSummary: string | null;
};

export type PermanentDeleteUserResult =
  | { success: "complete"; profileId: string }
  | { success: "partial"; profileId: string; message: string }
  | {
      success: false;
      error:
        | "invalid"
        | "unauthorized"
        | "ineligible"
        | "auth"
        | "database"
        | "confirm_email";
      message: string;
    };

export function parseUserDeletionEligibility(raw: unknown): UserDeletionEligibility | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const profileId = row.profile_id;
  if (typeof profileId !== "string") {
    return null;
  }

  const blockerCodes = Array.isArray(row.blocker_codes)
    ? row.blocker_codes.filter((code): code is string => typeof code === "string")
    : [];

  return {
    profileId,
    canDelete: row.can_delete === true,
    blockerCodes,
    blockerSummary:
      typeof row.blocker_summary === "string" ? row.blocker_summary : null,
  };
}

export function emailsMatchForDeletionConfirmation(
  typed: string,
  accountEmail: string,
): boolean {
  return typed.trim().toLowerCase() === accountEmail.trim().toLowerCase();
}

export function sanitizePermanentDeleteErrorMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return "Unable to delete this account. Try again or contact support.";
  }

  if (/password|secret|token|jwt|service_role|postgres|sql/i.test(trimmed)) {
    return "Unable to delete this account. Try again or contact support.";
  }

  return trimmed;
}

export function canShowPermanentDeleteInUserManagement(viewerRole: string): boolean {
  return viewerRole === "admin" || viewerRole === "owner";
}

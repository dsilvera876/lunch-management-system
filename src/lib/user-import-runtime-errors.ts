import { INVITE_DELIVERY_FAILURE_MESSAGE, LINK_FAILURE_MESSAGE } from "@/lib/signup-request-invite";

export const USER_IMPORT_RUNTIME_ERROR_CODES = [
  "INVALID_EMAIL",
  "ACCOUNT_CREATE_FAILED",
  "INVITATION_PREP_FAILED",
  "INVITATION_QUEUE_FAILED",
  "EMPLOYEE_ID_CONFLICT",
  "USER_STATE_CHANGED",
  "SYSTEM_CONFIGURATION",
  "TEMPORARY_SERVICE_FAILURE",
  "UNKNOWN",
] as const;

export type UserImportRuntimeErrorCode = (typeof USER_IMPORT_RUNTIME_ERROR_CODES)[number];

export type ClassifiedUserImportRuntimeError = {
  code: UserImportRuntimeErrorCode;
  userMessage: string;
};

export const userImportRuntimeUserFacingMessages = {
  INVALID_EMAIL: "Email address is invalid.",
  ACCOUNT_CREATE_FAILED:
    "We couldn't create this user's account. Please try again or contact an administrator.",
  INVITATION_PREP_FAILED:
    "We couldn't prepare this user's account invitation. Please try again or contact an administrator.",
  INVITATION_QUEUE_FAILED:
    "The account was created, but the setup invitation could not be queued. You can retry the invitation from Users.",
  SYSTEM_CONFIGURATION:
    "We couldn't prepare this user's account invitation because the system email setup is incomplete. Please contact an administrator.",
  TEMPORARY_SERVICE_FAILURE:
    "A temporary service problem prevented this user from being imported. Please try again.",
  USER_STATE_CHANGED:
    "This user's account changed after the file was reviewed. Review the user in Users before trying again.",
  UNKNOWN:
    "This user could not be imported. Please contact an administrator if the problem continues.",
} as const satisfies Record<
  Exclude<UserImportRuntimeErrorCode, "EMPLOYEE_ID_CONFLICT">,
  string
>;

const PASS_THROUGH_USER_MESSAGES = new Set<string>([
  userImportRuntimeUserFacingMessages.INVALID_EMAIL,
  userImportRuntimeUserFacingMessages.ACCOUNT_CREATE_FAILED,
  userImportRuntimeUserFacingMessages.INVITATION_PREP_FAILED,
  userImportRuntimeUserFacingMessages.INVITATION_QUEUE_FAILED,
  userImportRuntimeUserFacingMessages.SYSTEM_CONFIGURATION,
  userImportRuntimeUserFacingMessages.TEMPORARY_SERVICE_FAILURE,
  userImportRuntimeUserFacingMessages.USER_STATE_CHANGED,
  userImportRuntimeUserFacingMessages.UNKNOWN,
  INVITE_DELIVERY_FAILURE_MESSAGE,
  LINK_FAILURE_MESSAGE,
  "Existing inactive user — review required.",
  "Updated existing user profile.",
  "Created — invitation queued.",
]);

function employeeIdConflictMessage(employeeId: string): string {
  return `Employee ID ${employeeId} is already assigned to another user.`;
}

function looksTechnical(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /app_origin|must be configured|server-side auth redirect/.test(lower) ||
    /^(error:|pgrst|postgres|supabase|auth api|rpc |function |relation |violates)/.test(lower) ||
    /\bP0001\b/.test(message) ||
    /[A-Z]{2,}_[A-Z0-9_]+/.test(message) ||
    /unexpected rpc|user import claim failed/i.test(message)
  );
}

export function classifyUserImportRuntimeError(input: {
  technicalMessage: string;
  employeeId?: string | null;
}): ClassifiedUserImportRuntimeError {
  const technicalMessage = input.technicalMessage.trim();
  const lower = technicalMessage.toLowerCase();

  if (!technicalMessage) {
    return { code: "UNKNOWN", userMessage: userImportRuntimeUserFacingMessages.UNKNOWN };
  }

  if (PASS_THROUGH_USER_MESSAGES.has(technicalMessage)) {
    if (technicalMessage === INVITE_DELIVERY_FAILURE_MESSAGE) {
      return {
        code: "INVITATION_QUEUE_FAILED",
        userMessage: userImportRuntimeUserFacingMessages.INVITATION_QUEUE_FAILED,
      };
    }
    if (technicalMessage === LINK_FAILURE_MESSAGE) {
      return {
        code: "INVITATION_PREP_FAILED",
        userMessage: userImportRuntimeUserFacingMessages.INVITATION_PREP_FAILED,
      };
    }
    const code = inferCodeFromUserMessage(technicalMessage);
    return { code, userMessage: technicalMessage };
  }

  const duplicateMatch = technicalMessage.match(
    /^Employee ID ([0-9]{4}) is already assigned to another user\.?$/i,
  );
  if (duplicateMatch) {
    return {
      code: "EMPLOYEE_ID_CONFLICT",
      userMessage: employeeIdConflictMessage(duplicateMatch[1] ?? input.employeeId ?? "0000"),
    };
  }

  if (input.employeeId && /employee id|already assigned|duplicate employee id/i.test(lower)) {
    return {
      code: "EMPLOYEE_ID_CONFLICT",
      userMessage: employeeIdConflictMessage(input.employeeId),
    };
  }

  if (/invalid email|email address is invalid|malformed email|missing @/.test(lower)) {
    return { code: "INVALID_EMAIL", userMessage: userImportRuntimeUserFacingMessages.INVALID_EMAIL };
  }

  if (
    /app_origin|must be configured for server-side auth|email setup is incomplete|smtp.*not configured/.test(
      lower,
    )
  ) {
    return {
      code: "SYSTEM_CONFIGURATION",
      userMessage: userImportRuntimeUserFacingMessages.SYSTEM_CONFIGURATION,
    };
  }

  if (
    /could not be queued|queue failed|account setup email could not be sent|retry the invitation from users/i.test(
      lower,
    )
  ) {
    return {
      code: "INVITATION_QUEUE_FAILED",
      userMessage: userImportRuntimeUserFacingMessages.INVITATION_QUEUE_FAILED,
    };
  }

  if (
    /invite link|link could not|signup authorization could not|authorization could not|prepare signup|unable to prepare signup|invite failed|link failed|generate link/i.test(
      lower,
    )
  ) {
    return {
      code: "INVITATION_PREP_FAILED",
      userMessage: userImportRuntimeUserFacingMessages.INVITATION_PREP_FAILED,
    };
  }

  if (
    /matched user could not be found|user changed while|not found during import|signup request not found|unable to update existing user profile/i.test(
      lower,
    )
  ) {
    return {
      code: "USER_STATE_CHANGED",
      userMessage: userImportRuntimeUserFacingMessages.USER_STATE_CHANGED,
    };
  }

  if (looksTechnical(technicalMessage)) {
    if (/app_origin|must be configured|smtp|mail/.test(lower)) {
      return {
        code: "SYSTEM_CONFIGURATION",
        userMessage: userImportRuntimeUserFacingMessages.SYSTEM_CONFIGURATION,
      };
    }
    return { code: "UNKNOWN", userMessage: userImportRuntimeUserFacingMessages.UNKNOWN };
  }

  if (
    /timeout|timed out|\b503\b|\b502\b|\b504\b|network|fetch failed|connection|econnrefused|service unavailable|too many requests|temporarily unavailable/i.test(
      lower,
    )
  ) {
    return {
      code: "TEMPORARY_SERVICE_FAILURE",
      userMessage: userImportRuntimeUserFacingMessages.TEMPORARY_SERVICE_FAILURE,
    };
  }

  if (
    /already (registered|exists|been registered)|inviteuserbyemail|unable to create user account|could not create user/i.test(
      lower,
    )
  ) {
    return {
      code: "ACCOUNT_CREATE_FAILED",
      userMessage: userImportRuntimeUserFacingMessages.ACCOUNT_CREATE_FAILED,
    };
  }

  return { code: "UNKNOWN", userMessage: userImportRuntimeUserFacingMessages.UNKNOWN };
}

function inferCodeFromUserMessage(message: string): UserImportRuntimeErrorCode {
  if (message === userImportRuntimeUserFacingMessages.INVALID_EMAIL) return "INVALID_EMAIL";
  if (message === userImportRuntimeUserFacingMessages.ACCOUNT_CREATE_FAILED) return "ACCOUNT_CREATE_FAILED";
  if (message === userImportRuntimeUserFacingMessages.INVITATION_PREP_FAILED) return "INVITATION_PREP_FAILED";
  if (message === userImportRuntimeUserFacingMessages.INVITATION_QUEUE_FAILED) return "INVITATION_QUEUE_FAILED";
  if (message === userImportRuntimeUserFacingMessages.SYSTEM_CONFIGURATION) return "SYSTEM_CONFIGURATION";
  if (message === userImportRuntimeUserFacingMessages.TEMPORARY_SERVICE_FAILURE) return "TEMPORARY_SERVICE_FAILURE";
  if (message === userImportRuntimeUserFacingMessages.USER_STATE_CHANGED) return "USER_STATE_CHANGED";
  if (/^Employee ID [0-9]{4} is already assigned/.test(message)) return "EMPLOYEE_ID_CONFLICT";
  return "UNKNOWN";
}

export function sanitizeUserImportResultMessage(
  rawMessage: string | null | undefined,
  options: { employeeId?: string | null; status?: string } = {},
): string {
  const trimmed = rawMessage?.trim();
  if (!trimmed) {
    return "—";
  }

  if (options.status && options.status !== "failed") {
    return trimmed;
  }

  return classifyUserImportRuntimeError({
    technicalMessage: trimmed,
    employeeId: options.employeeId,
  }).userMessage;
}

export function logUserImportRuntimeError(input: {
  rowNumber: number;
  email?: string | null;
  code: UserImportRuntimeErrorCode;
  technicalMessage: string;
}): void {
  const safeEmail = input.email?.trim().toLowerCase() || "unknown";
  console.error(
    `[bulk-user-import] row=${input.rowNumber} email=${safeEmail} code=${input.code} detail=${input.technicalMessage}`,
  );
}

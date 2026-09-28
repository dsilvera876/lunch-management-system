import { mapSetEmployeeIdError, validateEmployeeIdField } from "@/lib/employee-id";
import { buildAuthConfirmUrl } from "@/lib/mail/auth-email-templates";
import { getApplicationOrigin } from "@/lib/request-origin";

export const INVITE_DELIVERY_FAILURE_MESSAGE =
  "User approved, but the account setup email could not be sent. You can retry the invitation.";

export const LINK_FAILURE_MESSAGE =
  "Account setup progressed, but the request could not be linked. You can retry the invitation.";

export const EMPLOYEE_ID_AFTER_INVITE_FAILURE_PREFIX =
  "Account created, but Employee ID could not be saved:";

export type SignupRequestInviteState = {
  requestId: string;
  email: string;
  fullName: string;
  status: "pending" | "approved" | "rejected";
  createdProfileId: string | null;
  requestedEmployeeId: string | null;
};

export type AdminInviteClient = {
  inviteUserByEmail: (
    email: string,
    options: { data: { full_name: string }; redirectTo: string },
  ) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  generateInviteLink: (
    email: string,
    options: { data: { full_name: string }; redirectTo: string },
  ) => Promise<{
    data: { user: { id: string }; tokenHash: string } | null;
    error: { message: string } | null;
  }>;
};

export type AccountSetupEmailQueueClient = {
  enqueueAccountSetupInvite: (input: {
    requestId: string;
    to: string;
    fullName: string;
    setupUrl: string;
  }) => Promise<{ ok: boolean; errorMessage?: string }>;
};

export type SignupInviteDbClient = {
  markApproved: (
    requestId: string,
    employeeId: string | null,
  ) => Promise<
    | {
        ok: true;
        row: {
          email: string;
          fullName: string;
          status: string;
          createdProfileId: string | null;
          requestedEmployeeId: string | null;
        };
      }
    | { ok: false; errorMessage: string }
  >;
  getRequest: (requestId: string) => Promise<SignupRequestInviteState | null>;
  lookupProfileIdByEmail: (email: string) => Promise<string | null>;
  waitForProfileId: (userId: string) => Promise<string | null>;
  recordInviteFailure: (requestId: string, message: string) => Promise<void>;
  linkProfile: (requestId: string, profileId: string) => Promise<{ ok: boolean; errorMessage?: string }>;
  setEmployeeId: (profileId: string, employeeId: string) => Promise<{ ok: boolean; errorMessage?: string }>;
};

export type OrchestrateSignupInviteResult =
  | { success: true; warning?: string }
  | { success: false; error: string; recoverable: boolean };

export function sanitizeInviteErrorMessage(raw: string): string {
  return raw
    .replace(/(password|secret|token|apikey|authorization|bearer)[=:][^\s]+/gi, "$1=[redacted]")
    .replace(/(\?|&)(token_hash|access_token|refresh_token|code)=[^&\s]+/gi, "$1$2=[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, 500);
}

export function signupRequestNeedsInvitationRetry(state: SignupRequestInviteState): boolean {
  return state.status === "approved" && state.createdProfileId === null;
}

function isAlreadyRegisteredError(message: string): boolean {
  return /already (registered|exists|been registered)/i.test(message);
}

async function sendGeneratedInviteLink(input: {
  requestId: string;
  admin: AdminInviteClient;
  queue: AccountSetupEmailQueueClient;
  emailAddress: string;
  fullName: string;
  redirectTo: string;
}): Promise<{ profileId: string | null; errorMessage: string | null }> {
  const link = await input.admin.generateInviteLink(input.emailAddress, {
    data: { full_name: input.fullName },
    redirectTo: input.redirectTo,
  });

  if (link.error || !link.data?.tokenHash || !link.data.user?.id) {
    return {
      profileId: link.data?.user?.id ?? null,
      errorMessage: link.error?.message ?? "Invite link could not be generated.",
    };
  }

  const setupUrl = buildAuthConfirmUrl({
    tokenHash: link.data.tokenHash,
    actionType: "invite",
    redirectTo: input.redirectTo,
    applicationOrigin: getApplicationOrigin(),
  });

  const queued = await input.queue.enqueueAccountSetupInvite({
    requestId: input.requestId,
    to: input.emailAddress,
    fullName: input.fullName,
    setupUrl,
  });

  if (!queued.ok) {
    return { profileId: link.data.user.id, errorMessage: queued.errorMessage ?? "Queue failed" };
  }

  return { profileId: link.data.user.id, errorMessage: null };
}

async function deliverAccountSetupInvite(input: {
  requestId: string;
  admin: AdminInviteClient;
  queue: AccountSetupEmailQueueClient;
  emailAddress: string;
  fullName: string;
  redirectTo: string;
}): Promise<{ profileId: string | null; errorMessage: string | null; inviteTriggered: boolean }> {
  const invited = await input.admin.inviteUserByEmail(input.emailAddress, {
    data: { full_name: input.fullName },
    redirectTo: input.redirectTo,
  });

  if (!invited.error && invited.data.user?.id) {
    return { profileId: invited.data.user.id, errorMessage: null, inviteTriggered: true };
  }

  const inviteErrorMessage = invited.error?.message ?? "Invite failed";

  if (isAlreadyRegisteredError(inviteErrorMessage)) {
    const direct = await sendGeneratedInviteLink(input);
    return { ...direct, inviteTriggered: direct.errorMessage === null };
  }

  return { profileId: null, errorMessage: inviteErrorMessage, inviteTriggered: false };
}

export async function orchestrateSignupRequestInvite(input: {
  db: SignupInviteDbClient;
  admin: AdminInviteClient;
  queue: AccountSetupEmailQueueClient;
  requestId: string;
  employeeIdInput: string;
  redirectTo: string;
}): Promise<OrchestrateSignupInviteResult> {
  const employeeValidation = validateEmployeeIdField(input.employeeIdInput);
  if (!employeeValidation.ok) {
    return { success: false, error: employeeValidation.message, recoverable: true };
  }

  const current = await input.db.getRequest(input.requestId);
  if (!current) {
    return { success: false, error: "Signup request not found.", recoverable: false };
  }

  if (current.status === "rejected") {
    return { success: false, error: "This request was rejected.", recoverable: false };
  }

  if (current.status === "approved" && current.createdProfileId !== null) {
    const employeeIdToApply =
      employeeValidation.value ?? current.requestedEmployeeId;

    if (employeeIdToApply) {
      const employeeResult = await input.db.setEmployeeId(
        current.createdProfileId,
        employeeIdToApply,
      );
      if (!employeeResult.ok) {
        return {
          success: false,
          error: `${EMPLOYEE_ID_AFTER_INVITE_FAILURE_PREFIX} ${employeeResult.errorMessage ?? "Please set it from the Users directory."}`,
          recoverable: true,
        };
      }
    }

    return { success: true };
  }

  const approved = await input.db.markApproved(input.requestId, employeeValidation.value);
  if (!approved.ok) {
    return {
      success: false,
      error: mapSetEmployeeIdError(approved.errorMessage),
      recoverable: true,
    };
  }

  const { email, fullName } = approved.row;
  const employeeIdToApply = employeeValidation.value ?? approved.row.requestedEmployeeId;

  const stateAfterApproval: SignupRequestInviteState = {
    ...current,
    status: "approved",
    createdProfileId: approved.row.createdProfileId ?? current.createdProfileId,
    requestedEmployeeId: approved.row.requestedEmployeeId ?? current.requestedEmployeeId,
  };

  let profileId =
    approved.row.createdProfileId ??
    current.createdProfileId ??
    (await input.db.lookupProfileIdByEmail(email));

  const needsDelivery =
    profileId === null || signupRequestNeedsInvitationRetry(stateAfterApproval);

  if (needsDelivery) {
    if (profileId !== null) {
      const direct = await sendGeneratedInviteLink({
        requestId: input.requestId,
        admin: input.admin,
        queue: input.queue,
        emailAddress: email,
        fullName,
        redirectTo: input.redirectTo,
      });

      profileId = direct.profileId ?? profileId;

      if (direct.errorMessage !== null) {
        await input.db.recordInviteFailure(
          input.requestId,
          sanitizeInviteErrorMessage(direct.errorMessage ?? "Invite failed"),
        );
        return {
          success: false,
          error: INVITE_DELIVERY_FAILURE_MESSAGE,
          recoverable: true,
        };
      }
    } else {
      const delivered = await deliverAccountSetupInvite({
        requestId: input.requestId,
        admin: input.admin,
        queue: input.queue,
        emailAddress: email,
        fullName,
        redirectTo: input.redirectTo,
      });

      if (!delivered.profileId) {
        profileId = await input.db.lookupProfileIdByEmail(email);
      } else {
        profileId = delivered.profileId;
      }

      if (!delivered.inviteTriggered || profileId === null) {
        await input.db.recordInviteFailure(
          input.requestId,
          sanitizeInviteErrorMessage(delivered.errorMessage ?? "Invite failed"),
        );
        return {
          success: false,
          error: INVITE_DELIVERY_FAILURE_MESSAGE,
          recoverable: true,
        };
      }
    }
  }

  if (profileId === null) {
    return {
      success: false,
      error: INVITE_DELIVERY_FAILURE_MESSAGE,
      recoverable: true,
    };
  }

  const resolvedProfileId = (await input.db.waitForProfileId(profileId)) ?? profileId;

  const linkResult = await input.db.linkProfile(input.requestId, resolvedProfileId);
  if (!linkResult.ok) {
    await input.db.recordInviteFailure(
      input.requestId,
      sanitizeInviteErrorMessage(linkResult.errorMessage ?? "Link failed"),
    );
    return {
      success: true,
      warning: LINK_FAILURE_MESSAGE,
    };
  }

  if (employeeIdToApply) {
    const employeeResult = await input.db.setEmployeeId(
      resolvedProfileId,
      employeeIdToApply,
    );
    if (!employeeResult.ok) {
      return {
        success: true,
        warning: `${EMPLOYEE_ID_AFTER_INVITE_FAILURE_PREFIX} ${employeeResult.errorMessage ?? "Set it from the Users directory."}`,
      };
    }
  }

  return { success: true };
}

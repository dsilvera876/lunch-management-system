import { mapSetEmployeeIdError, validateEmployeeIdField } from "@/lib/employee-id";

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
  onboardingEstablished: boolean;
};

export type AdminInviteClient = {
  inviteUserByEmail: (
    email: string,
    options: { data: { full_name: string }; redirectTo: string },
  ) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  requestPasswordRecovery: (
    email: string,
    options: {
      redirectTo: string;
      accountSetup: { nonce: string; expectedAuthUserId: string };
    },
  ) => Promise<{ error: { message: string } | null }>;
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
  prepareAccountSetupRecovery: (
    requestId: string,
    expectedProfileId: string,
    nonce: string,
  ) => Promise<{
    outcome: "prepared" | "completed" | "error";
    errorMessage?: string;
  }>;
  linkProfile: (requestId: string, profileId: string) => Promise<{ ok: boolean; errorMessage?: string }>;
  setEmployeeId: (profileId: string, employeeId: string) => Promise<{ ok: boolean; errorMessage?: string }>;
};

export type OrchestrateSignupInviteResult =
  | { success: true; outcome: "queued" | "already_complete"; warning?: string }
  | { success: false; error: string; recoverable: boolean };

export function sanitizeInviteErrorMessage(raw: string): string {
  return raw
    .replace(/(password|secret|token|apikey|authorization|bearer)[=:][^\s]+/gi, "$1=[redacted]")
    .replace(/(\?|&)(token_hash|access_token|refresh_token|code)=[^&\s]+/gi, "$1$2=[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, 500);
}

export function signupRequestNeedsInvitationRetry(state: SignupRequestInviteState): boolean {
  return state.status === "approved" && !state.onboardingEstablished;
}

function isAlreadyRegisteredError(message: string): boolean {
  return /already (registered|exists|been registered)/i.test(message);
}

type AccountSetupRecoveryResult =
  | { outcome: "queued" | "completed" }
  | { outcome: "failed"; errorMessage: string };

async function sendAccountSetupRecovery(input: {
  requestId: string;
  db: SignupInviteDbClient;
  admin: AdminInviteClient;
  emailAddress: string;
  redirectTo: string;
  expectedProfileId: string;
}): Promise<AccountSetupRecoveryResult> {
  const nonce = crypto.randomUUID();
  const prepared = await input.db.prepareAccountSetupRecovery(
    input.requestId,
    input.expectedProfileId,
    nonce,
  );

  if (prepared.outcome === "completed") {
    return { outcome: "completed" };
  }

  if (prepared.outcome !== "prepared") {
    return {
      outcome: "failed",
      errorMessage: prepared.errorMessage ?? "Account setup recovery could not be prepared.",
    };
  }

  const recovery = await input.admin.requestPasswordRecovery(input.emailAddress, {
    redirectTo: input.redirectTo,
    accountSetup: { nonce, expectedAuthUserId: input.expectedProfileId },
  });

  if (recovery.error) {
    await input.db.recordInviteFailure(
      input.requestId,
      sanitizeInviteErrorMessage(recovery.error.message),
    );
    return { outcome: "failed", errorMessage: recovery.error.message };
  }

  return { outcome: "queued" };
}

function recoveryResultToOrchestration(
  result: AccountSetupRecoveryResult,
): OrchestrateSignupInviteResult {
  if (result.outcome === "failed") {
    return {
      success: false,
      error: INVITE_DELIVERY_FAILURE_MESSAGE,
      recoverable: true,
    };
  }

  return {
    success: true,
    outcome: result.outcome === "completed" ? "already_complete" : "queued",
  };
}

async function deliverAccountSetupInvite(input: {
  admin: AdminInviteClient;
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

  return { profileId: null, errorMessage: inviteErrorMessage, inviteTriggered: false };
}

export async function orchestrateSignupRequestInvite(input: {
  db: SignupInviteDbClient;
  admin: AdminInviteClient;
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

    if (current.onboardingEstablished) {
      return { success: true, outcome: "already_complete" };
    }

    const recovered = await sendAccountSetupRecovery({
      requestId: input.requestId,
      db: input.db,
      admin: input.admin,
      emailAddress: current.email,
      redirectTo: input.redirectTo,
      expectedProfileId: current.createdProfileId,
    });

    return recoveryResultToOrchestration(recovered);
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
    onboardingEstablished: current.onboardingEstablished,
  };

  let profileId =
    approved.row.createdProfileId ??
    current.createdProfileId ??
    (await input.db.lookupProfileIdByEmail(email));
  let profileLinked = stateAfterApproval.createdProfileId !== null;

  const needsDelivery =
    profileId === null || signupRequestNeedsInvitationRetry(stateAfterApproval);

  if (needsDelivery) {
    if (profileId !== null) {
      const resolvedProfileId = (await input.db.waitForProfileId(profileId)) ?? profileId;
      const linkResult = await input.db.linkProfile(input.requestId, resolvedProfileId);
      if (!linkResult.ok) {
        await input.db.recordInviteFailure(
          input.requestId,
          sanitizeInviteErrorMessage(linkResult.errorMessage ?? "Link failed"),
        );
        return {
          success: false,
          error: LINK_FAILURE_MESSAGE,
          recoverable: true,
        };
      }

      profileId = resolvedProfileId;
      profileLinked = true;

      const direct = await sendAccountSetupRecovery({
        requestId: input.requestId,
        db: input.db,
        admin: input.admin,
        emailAddress: email,
        redirectTo: input.redirectTo,
        expectedProfileId: profileId,
      });

      return recoveryResultToOrchestration(direct);
    } else {
      const delivered = await deliverAccountSetupInvite({
        admin: input.admin,
        emailAddress: email,
        fullName,
        redirectTo: input.redirectTo,
      });

      if (!delivered.profileId) {
        profileId = await input.db.lookupProfileIdByEmail(email);
      } else {
        profileId = delivered.profileId;
      }

      if (!delivered.inviteTriggered && isAlreadyRegisteredError(delivered.errorMessage ?? "")) {
        if (profileId === null) {
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

        const resolvedProfileId = (await input.db.waitForProfileId(profileId)) ?? profileId;
        const linkResult = await input.db.linkProfile(input.requestId, resolvedProfileId);
        if (!linkResult.ok) {
          await input.db.recordInviteFailure(
            input.requestId,
            sanitizeInviteErrorMessage(linkResult.errorMessage ?? "Link failed"),
          );
          return {
            success: false,
            error: LINK_FAILURE_MESSAGE,
            recoverable: true,
          };
        }

        profileId = resolvedProfileId;
        profileLinked = true;

        const recovered = await sendAccountSetupRecovery({
          requestId: input.requestId,
          db: input.db,
          admin: input.admin,
          emailAddress: email,
          redirectTo: input.redirectTo,
          expectedProfileId: profileId,
        });

        return recoveryResultToOrchestration(recovered);
      } else if (!delivered.inviteTriggered || profileId === null) {
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

  if (!profileLinked) {
    const linkResult = await input.db.linkProfile(input.requestId, resolvedProfileId);
    if (!linkResult.ok) {
      await input.db.recordInviteFailure(
        input.requestId,
        sanitizeInviteErrorMessage(linkResult.errorMessage ?? "Link failed"),
      );
      return {
        success: true,
        outcome: "queued",
        warning: LINK_FAILURE_MESSAGE,
      };
    }
  }

  if (employeeIdToApply) {
    const employeeResult = await input.db.setEmployeeId(
      resolvedProfileId,
      employeeIdToApply,
    );
    if (!employeeResult.ok) {
      return {
        success: true,
        outcome: "queued",
        warning: `${EMPLOYEE_ID_AFTER_INVITE_FAILURE_PREFIX} ${employeeResult.errorMessage ?? "Set it from the Users directory."}`,
      };
    }
  }

  return { success: true, outcome: "queued" };
}

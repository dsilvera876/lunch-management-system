export type UserImportRowRecord = {
  id: string;
  batch_id: string;
  row_number: number;
  full_name: string;
  email: string;
  normalized_email: string;
  employee_id: string | null;
  classification: string;
  action_code: string;
  profile_id: string | null;
  signup_request_id: string | null;
};

export type UserImportExecutionPlan =
  | { mode: "skip"; message: string }
  | { mode: "update"; profileId: string }
  | { mode: "invite" }
  | { mode: "incompatible"; technicalMessage: string };

const INVITE_ACTION_CODES = new Set([
  "create_and_invite",
  "approve_and_invite",
  "resume_invite",
  "authorize_and_invite",
]);

export function planUserImportRowExecution(input: {
  row: UserImportRowRecord;
  resolvedProfileId: string | null;
  accountStatus?: string | null;
  role?: string | null;
}): UserImportExecutionPlan {
  const { row, resolvedProfileId, accountStatus, role } = input;

  if (row.classification === "existing_inactive" || accountStatus === "inactive") {
    return {
      mode: "skip",
      message: "Existing inactive user — review required.",
    };
  }

  if (
    resolvedProfileId &&
    role &&
    ["owner", "admin", "accounts", "hr"].includes(role) &&
    row.action_code !== "update_existing"
  ) {
    return {
      mode: "incompatible",
      technicalMessage:
        "Import row no longer matches a creatable user because a privileged account now exists for this email.",
    };
  }

  if (row.action_code === "update_existing") {
    if (resolvedProfileId) {
      return { mode: "update", profileId: resolvedProfileId };
    }
    return { mode: "invite" };
  }

  if (INVITE_ACTION_CODES.has(row.action_code)) {
    return { mode: "invite" };
  }

  return {
    mode: "incompatible",
    technicalMessage: `Unsupported import action ${row.action_code} for row ${row.row_number}.`,
  };
}

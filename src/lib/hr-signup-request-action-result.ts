export type SignupRequestMutationResult =
  | { success: true; outcome?: "queued" | "already_complete"; warning?: string }
  | { success: false; error: string };

export type SignupDrawerActionOutcome =
  | {
      kind: "success";
      message: string;
      closeDrawer: true;
      refreshList: true;
    }
  | { kind: "partial"; warning: string; closeDrawer: false; refreshList: true }
  | { kind: "error"; error: string; closeDrawer: false; refreshList: boolean };

export function resolveSignupDrawerActionOutcome(
  result: SignupRequestMutationResult,
): SignupDrawerActionOutcome {
  if (!result.success) {
    return {
      kind: "error",
      error: result.error,
      closeDrawer: false,
      refreshList: true,
    };
  }

  if (result.warning) {
    return {
      kind: "partial",
      warning: result.warning,
      closeDrawer: false,
      refreshList: true,
    };
  }

  return {
    kind: "success",
    message:
      result.outcome === "already_complete"
        ? "Account setup is already complete."
        : "Invitation queued successfully.",
    closeDrawer: true,
    refreshList: true,
  };
}

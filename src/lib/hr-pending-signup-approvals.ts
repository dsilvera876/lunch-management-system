import type { SupabaseClient } from "@supabase/supabase-js";

import type { UserRole } from "@/lib/roles";

export const HR_SIGNUP_APPROVALS_PATH = "/admin/users?view=approvals";

export type HrPendingSignupApprovalAlert = {
  count: number;
  title: string;
  message: string;
  href: string;
  actionLabel: string;
};

export function buildHrPendingSignupApprovalAlert(
  count: number,
): HrPendingSignupApprovalAlert | null {
  if (count <= 0) {
    return null;
  }

  const noun = count === 1 ? "user is" : "users are";

  return {
    count,
    title: "Pending user approvals",
    message: `${count} ${noun} waiting for approval.`,
    href: HR_SIGNUP_APPROVALS_PATH,
    actionLabel: "Review requests",
  };
}

export async function getHrPendingSignupApprovalCount(
  supabase: SupabaseClient,
  role: UserRole,
): Promise<number> {
  if (role !== "hr") {
    return 0;
  }

  const { data, error } = await supabase.rpc("count_pending_signup_requests");

  if (error || data === null) {
    return 0;
  }

  return Number(data);
}

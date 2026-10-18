import { type EmailOtpType } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import {
  getAccountSetupRecoveryNonce,
  getAuthConfirmFailurePathForNext,
  getAuthConfirmSuccessPath,
  resolveSafeAuthConfirmNextPath,
} from "@/lib/auth-recovery";
import { getPostLoginPath } from "@/lib/navigation";
import { gateApplicationProfileAfterAuth } from "@/lib/post-login-gate";
import { getApplicationOrigin, getExternalUrl } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const nextParam = request.nextUrl.searchParams.get("next");
  const safeNext = resolveSafeAuthConfirmNextPath(
    nextParam,
    getApplicationOrigin(),
  );

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      getExternalUrl(request, getAuthConfirmFailurePathForNext(type, safeNext)),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(
      getExternalUrl(request, getAuthConfirmFailurePathForNext(type, safeNext)),
    );
  }

  const recoveryNonce =
    type === "recovery" ? getAccountSetupRecoveryNonce(safeNext) : null;
  const requiresOnboardingAuthorization =
    type === "invite" || (type === "recovery" && recoveryNonce !== null);

  if (requiresOnboardingAuthorization) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const service = createServiceClient();
    const { data: authorized, error: authorizationError } = await service.rpc(
      "service_authorize_signup_onboarding",
      {
        p_user_id: user?.id ?? null,
        p_auth_action_type: type,
        p_nonce: recoveryNonce,
      },
    );

    if (authorizationError || authorized !== true) {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(
        getExternalUrl(request, getAuthConfirmFailurePathForNext(type, safeNext)),
      );
    }
  }

  revalidatePath("/", "layout");

  const defaultSuccessPath = getAuthConfirmSuccessPath(type);
  const successPath = recoveryNonce
    ? "/account/update-password?invite=1"
    : safeNext ?? (defaultSuccessPath === "post-login" ? null : defaultSuccessPath);

  if (successPath) {
    return NextResponse.redirect(getExternalUrl(request, successPath));
  }

  const gate = await gateApplicationProfileAfterAuth(supabase);

  if (gate.allowed) {
    return NextResponse.redirect(
      getExternalUrl(request, getPostLoginPath(gate.role)),
    );
  }

  return NextResponse.redirect(getExternalUrl(request, gate.redirectTo));
}

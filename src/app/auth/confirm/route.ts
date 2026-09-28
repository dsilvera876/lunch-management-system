import { type EmailOtpType } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import {
  getAuthConfirmFailurePath,
  getAuthConfirmSuccessPath,
  resolveSafeAuthConfirmNextPath,
} from "@/lib/auth-recovery";
import { getPostLoginPath } from "@/lib/navigation";
import { getApplicationOrigin, getExternalUrl } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      getExternalUrl(request, getAuthConfirmFailurePath(type)),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(
      getExternalUrl(request, getAuthConfirmFailurePath(type)),
    );
  }

  revalidatePath("/", "layout");

  const nextParam = request.nextUrl.searchParams.get("next");
  const safeNext = resolveSafeAuthConfirmNextPath(
    nextParam,
    getApplicationOrigin(),
  );
  const defaultSuccessPath = getAuthConfirmSuccessPath(type);
  const successPath =
    safeNext ?? (defaultSuccessPath === "post-login" ? null : defaultSuccessPath);

  if (successPath) {
    return NextResponse.redirect(getExternalUrl(request, successPath));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return NextResponse.redirect(
      getExternalUrl(request, getPostLoginPath(profile?.role ?? "staff")),
    );
  }

  return NextResponse.redirect(getExternalUrl(request, "/home"));
}

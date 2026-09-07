import { type EmailOtpType } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginPath } from "@/lib/navigation";
import { getExternalUrl } from "@/lib/request-origin";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      revalidatePath("/", "layout");

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
  }

  return NextResponse.redirect(
    getExternalUrl(request, "/login?error=confirmation"),
  );
}

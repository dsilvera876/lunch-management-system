import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getPostLoginPath } from "@/lib/navigation";

export default async function HomePage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  redirect(getPostLoginPath(profile.role));
}
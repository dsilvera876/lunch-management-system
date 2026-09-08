"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function updateDefaultOfficeLocation(formData: FormData) {
  await requireProfile();

  const officeLocationId = formData.get("officeLocationId");

  if (typeof officeLocationId !== "string" || officeLocationId.length === 0) {
    redirect("/account?locationError=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_my_default_office_location", {
    p_office_location_id: officeLocationId,
  });

  if (error) {
    redirect("/account?locationError=save");
  }

  revalidatePath("/account");
  revalidatePath("/lunch");
  redirect("/account?locationUpdated=1");
}

export async function clearDefaultOfficeLocation() {
  await requireProfile();

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_my_default_office_location", {
    p_office_location_id: null,
  });

  if (error) {
    redirect("/account?locationError=save");
  }

  revalidatePath("/account");
  revalidatePath("/lunch");
  redirect("/account?locationUpdated=1");
}

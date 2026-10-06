"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SaveMyDefaultOfficeLocationResult =
  | { ok: true }
  | { ok: false; errorCode: "invalid" | "save" | "unauthorized" };

export async function saveMyDefaultOfficeLocation(
  officeLocationId: string,
): Promise<SaveMyDefaultOfficeLocationResult> {
  await requireProfile();

  if (!officeLocationId) {
    return { ok: false, errorCode: "invalid" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("set_my_default_office_location", {
    p_office_location_id: officeLocationId,
  });

  if (error) {
    const normalized = error.message.toLowerCase();
    if (
      normalized.includes("authentication required") ||
      normalized.includes("not authorized")
    ) {
      return { ok: false, errorCode: "unauthorized" };
    }

    return { ok: false, errorCode: "save" };
  }

  revalidatePath("/account");
  revalidatePath("/lunch");

  return { ok: true };
}

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

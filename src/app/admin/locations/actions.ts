"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeOfficeLocationName } from "@/lib/office-locations";

export async function createOfficeLocation(formData: FormData) {
  await requireHrAdminOrOwner();

  const name = formData.get("name");
  const description = formData.get("description");
  const address = formData.get("address");

  if (typeof name !== "string") {
    redirect("/admin/locations?error=invalid");
  }

  const normalizedName = normalizeOfficeLocationName(name);

  if (normalizedName.length === 0) {
    redirect("/admin/locations?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("office_locations").insert({
    name: normalizedName,
    description:
      typeof description === "string" && description.trim().length > 0
        ? description.trim()
        : null,
    address:
      typeof address === "string" && address.trim().length > 0
        ? address.trim()
        : null,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") {
      redirect("/admin/locations?error=duplicate");
    }

    redirect("/admin/locations?error=create");
  }

  revalidatePath("/admin/locations");
  redirect("/admin/locations?created=1");
}

export async function updateOfficeLocation(formData: FormData) {
  await requireHrAdminOrOwner();

  const id = formData.get("id");
  const name = formData.get("name");
  const description = formData.get("description");
  const address = formData.get("address");

  if (typeof id !== "string" || typeof name !== "string") {
    redirect("/admin/locations?error=invalid");
  }

  const normalizedName = normalizeOfficeLocationName(name);

  if (normalizedName.length === 0) {
    redirect(`/admin/locations/${id}?error=invalid`);
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("office_locations")
    .update({
      name: normalizedName,
      description:
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : null,
      address:
        typeof address === "string" && address.trim().length > 0
          ? address.trim()
          : null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      redirect(`/admin/locations/${id}?error=duplicate`);
    }

    redirect(`/admin/locations/${id}?error=update`);
  }

  revalidatePath("/admin/locations");
  revalidatePath(`/admin/locations/${id}`);
  redirect(`/admin/locations/${id}?updated=1`);
}

export async function toggleOfficeLocationActive(formData: FormData) {
  await requireHrAdminOrOwner();

  const id = formData.get("id");
  const active = formData.get("active");

  if (typeof id !== "string" || typeof active !== "string") {
    redirect("/admin/locations?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("office_locations")
    .update({ is_active: active !== "true" })
    .eq("id", id);

  if (error) {
    redirect(`/admin/locations/${id}?error=status`);
  }

  revalidatePath("/admin/locations");
  revalidatePath(`/admin/locations/${id}`);
  redirect(`/admin/locations/${id}?statusUpdated=1`);
}

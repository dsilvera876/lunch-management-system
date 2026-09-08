"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createProvider(formData: FormData) {
  await requireHrAdminOrOwner();

  const name = formData.get("name");
  const description = formData.get("description");

  if (typeof name !== "string" || typeof description !== "string") {
    redirect("/admin/providers?error=invalid");
  }

  if (name.trim().length === 0) {
    redirect("/admin/providers?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("lunch_providers").insert({
    name: name.trim(),
    description: description.trim() || null,
    active: true,
  });

  if (error) {
    if (error.code === "23505") {
      redirect("/admin/providers?error=duplicate");
    }

    redirect("/admin/providers?error=create");
  }

  revalidatePath("/admin/providers");
  redirect("/admin/providers?created=1");
}

export async function updateProvider(formData: FormData) {
  await requireHrAdminOrOwner();

  const id = formData.get("id");
  const name = formData.get("name");
  const description = formData.get("description");

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    name.trim().length === 0
  ) {
    redirect("/admin/providers?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("lunch_providers")
    .update({
      name: name.trim(),
      description: description.trim() || null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      redirect(`/admin/providers/${id}?error=duplicate`);
    }

    redirect(`/admin/providers/${id}?error=update`);
  }

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);

  redirect(`/admin/providers/${id}?updated=1`);
}

export async function toggleProviderActive(formData: FormData) {
  await requireHrAdminOrOwner();

  const id = formData.get("id");
  const active = formData.get("active");

  if (typeof id !== "string" || typeof active !== "string") {
    redirect("/admin/providers?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("lunch_providers")
    .update({ active: active !== "true" })
    .eq("id", id);

  if (error) {
    redirect(`/admin/providers/${id}?error=status`);
  }

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);

  redirect(`/admin/providers/${id}?statusUpdated=1`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManageProviders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseProviderIconKey } from "@/lib/provider-icons";
import { isProviderInUseDeletionError } from "@/lib/unused-record-deletion";
import {
  mapProviderOrderEmailDbError,
  parseProviderOrderEmailFromForm,
  readProviderActiveFromForm,
  validateProviderOrderEmailInput,
} from "@/app/admin/providers/provider-mutations";

export async function createProvider(formData: FormData) {
  await requireManageProviders();

  const name = formData.get("name");
  const description = formData.get("description");

  if (typeof name !== "string" || typeof description !== "string") {
    redirect("/admin/providers?error=invalid");
  }

  if (name.trim().length === 0) {
    redirect("/admin/providers?error=invalid");
  }

  const active = readProviderActiveFromForm(formData, true);
  const primaryOrderEmail = parseProviderOrderEmailFromForm(formData);
  const emailError = validateProviderOrderEmailInput(active, primaryOrderEmail);
  if (emailError) {
    redirect(`/admin/providers?error=${emailError}`);
  }

  const supabase = await createClient();

  const iconKey = parseProviderIconKey(formData.get("iconKey"));

  const { error } = await supabase.from("lunch_providers").insert({
    name: name.trim(),
    description: description.trim() || null,
    icon_key: iconKey,
    active,
    primary_order_email: primaryOrderEmail,
  });

  if (error) {
    if (error.code === "23505") {
      redirect("/admin/providers?error=duplicate");
    }

    const providerEmailError = mapProviderOrderEmailDbError(error.message);
    if (providerEmailError) {
      redirect(`/admin/providers?error=${providerEmailError}`);
    }

    redirect("/admin/providers?error=create");
  }

  revalidatePath("/admin/providers");
  redirect("/admin/providers?created=1");
}

export async function updateProvider(formData: FormData) {
  await requireManageProviders();

  const id = formData.get("id");
  const name = formData.get("name");
  const description = formData.get("description");
  const active = readProviderActiveFromForm(formData, true);

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    name.trim().length === 0
  ) {
    redirect("/admin/providers?error=invalid");
  }

  const primaryOrderEmail = parseProviderOrderEmailFromForm(formData);
  const emailError = validateProviderOrderEmailInput(active, primaryOrderEmail);
  if (emailError) {
    redirect(`/admin/providers/${id}/edit?error=${emailError}`);
  }

  const iconKey = parseProviderIconKey(formData.get("iconKey"));

  const supabase = await createClient();

  const { error } = await supabase
    .from("lunch_providers")
    .update({
      name: name.trim(),
      description: description.trim() || null,
      icon_key: iconKey,
      primary_order_email: primaryOrderEmail,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      redirect(`/admin/providers/${id}/edit?error=duplicate`);
    }

    const providerEmailError = mapProviderOrderEmailDbError(error.message);
    if (providerEmailError) {
      redirect(`/admin/providers/${id}/edit?error=${providerEmailError}`);
    }

    redirect(`/admin/providers/${id}/edit?error=update`);
  }

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);
  revalidatePath(`/admin/providers/${id}/edit`);

  redirect(`/admin/providers/${id}/edit?updated=1`);
}

export async function toggleProviderActive(formData: FormData) {
  await requireManageProviders();

  const id = formData.get("id");
  const active = formData.get("active");

  if (typeof id !== "string" || typeof active !== "string") {
    redirect("/admin/providers?error=invalid");
  }

  const supabase = await createClient();
  const currentlyActive = active === "true";
  const activating = !currentlyActive;

  if (activating) {
    const { data: provider, error: loadError } = await supabase
      .from("lunch_providers")
      .select("primary_order_email")
      .eq("id", id)
      .single();

    if (loadError || !provider) {
      redirect(`/admin/providers/${id}/edit?error=status`);
    }

    const emailError = validateProviderOrderEmailInput(true, provider.primary_order_email?.trim() || null);
    if (emailError) {
      redirect(`/admin/providers/${id}/edit?error=activate-email-required`);
    }
  }

  const { error } = await supabase
    .from("lunch_providers")
    .update({ active: activating })
    .eq("id", id);

  if (error) {
    const providerEmailError = mapProviderOrderEmailDbError(error.message);
    if (providerEmailError) {
      redirect(`/admin/providers/${id}/edit?error=activate-email-required`);
    }

    redirect(`/admin/providers/${id}/edit?error=status`);
  }

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);
  revalidatePath(`/admin/providers/${id}/edit`);

  redirect(`/admin/providers/${id}/edit?statusUpdated=1`);
}

export async function deleteUnusedProvider(formData: FormData) {
  await requireManageProviders();

  const id = formData.get("id");

  if (typeof id !== "string" || id.length === 0) {
    redirect("/admin/providers?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_unused_lunch_provider", {
    p_provider_id: id,
  });

  if (error) {
    if (isProviderInUseDeletionError(error.message)) {
      redirect(`/admin/providers/${id}/edit?error=in-use`);
    }

    if (error.message.includes("Not authorized")) {
      redirect(`/admin/providers/${id}/edit?error=unauthorized`);
    }

    redirect(`/admin/providers/${id}/edit?error=delete`);
  }

  revalidatePath("/admin/providers");
  revalidatePath(`/admin/providers/${id}`);
  revalidatePath(`/admin/providers/${id}/edit`);
  redirect("/admin/providers?deleted=1");
}

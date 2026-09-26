"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeOfficeLocationName,
  type OfficeLocation,
} from "@/lib/office-locations";
import {
  isOfficeLocationInUseDeletionError,
} from "@/lib/unused-record-deletion";
import type {
  OfficeLocationDeleteError,
  OfficeLocationMutationError,
} from "@/lib/office-locations-presentation";

const LOCATION_SELECT = "id, name, description, address, is_active";

type ParsedLocationFields =
  | {
      ok: true;
      name: string;
      description: string | null;
      address: string | null;
    }
  | { ok: false; error: "invalid" };

function parseLocationFields(formData: FormData): ParsedLocationFields {
  const name = formData.get("name");

  if (typeof name !== "string") {
    return { ok: false, error: "invalid" };
  }

  const normalizedName = normalizeOfficeLocationName(name);

  if (normalizedName.length === 0) {
    return { ok: false, error: "invalid" };
  }

  const description = formData.get("description");
  const address = formData.get("address");

  return {
    ok: true,
    name: normalizedName,
    description:
      typeof description === "string" && description.trim().length > 0
        ? description.trim()
        : null,
    address:
      typeof address === "string" && address.trim().length > 0
        ? address.trim()
        : null,
  };
}

export type CreateOfficeLocationInlineResult =
  | { success: true; location: OfficeLocation }
  | { success: false; error: OfficeLocationMutationError };

export type UpdateOfficeLocationInlineResult =
  | { success: true; location: OfficeLocation }
  | { success: false; error: OfficeLocationMutationError };

export type ToggleOfficeLocationActiveInlineResult =
  | { success: true; location: OfficeLocation }
  | { success: false; error: OfficeLocationMutationError };

export type DeleteOfficeLocationInlineResult =
  | { success: true }
  | { success: false; error: OfficeLocationDeleteError };

async function loadOfficeLocation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<OfficeLocation | null> {
  const { data, error } = await supabase
    .from("office_locations")
    .select(LOCATION_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as OfficeLocation;
}

export async function createOfficeLocationInline(
  formData: FormData,
): Promise<CreateOfficeLocationInlineResult> {
  await requireHrAdminOrOwner();

  const parsed = parseLocationFields(formData);

  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }

  const supabase = await createClient();

  const { data: location, error } = await supabase
    .from("office_locations")
    .insert({
      name: parsed.name,
      description: parsed.description,
      address: parsed.address,
      is_active: true,
    })
    .select(LOCATION_SELECT)
    .single();

  if (error || !location) {
    if (error?.code === "23505") {
      return { success: false, error: "duplicate" };
    }

    return { success: false, error: "create" };
  }

  revalidatePath("/admin/locations");
  return { success: true, location: location as OfficeLocation };
}

export async function updateOfficeLocationInline(
  formData: FormData,
): Promise<UpdateOfficeLocationInlineResult> {
  await requireHrAdminOrOwner();

  const id = formData.get("id");

  if (typeof id !== "string" || id.length === 0) {
    return { success: false, error: "invalid" };
  }

  const parsed = parseLocationFields(formData);

  if (!parsed.ok) {
    return { success: false, error: parsed.error };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("office_locations")
    .update({
      name: parsed.name,
      description: parsed.description,
      address: parsed.address,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "duplicate" };
    }

    return { success: false, error: "update" };
  }

  const location = await loadOfficeLocation(supabase, id);

  if (!location) {
    return { success: false, error: "update" };
  }

  revalidatePath("/admin/locations");
  return { success: true, location };
}

export async function toggleOfficeLocationActiveInline(
  locationId: string,
  currentlyActive: boolean,
): Promise<ToggleOfficeLocationActiveInlineResult> {
  await requireHrAdminOrOwner();

  if (locationId.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("office_locations")
    .update({ is_active: !currentlyActive })
    .eq("id", locationId);

  if (error) {
    return { success: false, error: "status" };
  }

  const location = await loadOfficeLocation(supabase, locationId);

  if (!location) {
    return { success: false, error: "status" };
  }

  revalidatePath("/admin/locations");
  return { success: true, location };
}

export async function deleteUnusedOfficeLocationInline(
  locationId: string,
): Promise<DeleteOfficeLocationInlineResult> {
  await requireHrAdminOrOwner();

  if (locationId.length === 0) {
    return { success: false, error: "invalid" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_unused_office_location", {
    p_office_location_id: locationId,
  });

  if (error) {
    if (isOfficeLocationInUseDeletionError(error.message)) {
      return { success: false, error: "in-use" };
    }

    if (error.message.includes("Not authorized")) {
      return { success: false, error: "unauthorized" };
    }

    return { success: false, error: "delete" };
  }

  revalidatePath("/admin/locations");
  return { success: true };
}

export async function createOfficeLocation(formData: FormData) {
  const result = await createOfficeLocationInline(formData);

  if (!result.success) {
    if (result.error === "duplicate") {
      redirect("/admin/locations?error=duplicate");
    }

    redirect("/admin/locations?error=create");
  }

  redirect("/admin/locations?created=1");
}

export async function updateOfficeLocation(formData: FormData) {
  const id = formData.get("id");
  const result = await updateOfficeLocationInline(formData);

  if (!result.success) {
    const locationId = typeof id === "string" ? id : "invalid";

    if (result.error === "duplicate") {
      redirect(`/admin/locations/${locationId}?error=duplicate`);
    }

    redirect(`/admin/locations/${locationId}?error=update`);
  }

  redirect(`/admin/locations/${result.location.id}?updated=1`);
}

export async function toggleOfficeLocationActive(formData: FormData) {
  const id = formData.get("id");
  const active = formData.get("active");

  if (typeof id !== "string" || typeof active !== "string") {
    redirect("/admin/locations?error=invalid");
  }

  const result = await toggleOfficeLocationActiveInline(id, active === "true");

  if (!result.success) {
    redirect(`/admin/locations/${id}?error=status`);
  }

  redirect(`/admin/locations/${id}?statusUpdated=1`);
}

export async function deleteUnusedOfficeLocation(formData: FormData) {
  const id = formData.get("id");

  if (typeof id !== "string" || id.length === 0) {
    redirect("/admin/locations?error=invalid");
  }

  const result = await deleteUnusedOfficeLocationInline(id);

  if (!result.success) {
    if (result.error === "in-use") {
      redirect(`/admin/locations/${id}?error=in-use`);
    }

    if (result.error === "unauthorized") {
      redirect(`/admin/locations/${id}?error=unauthorized`);
    }

    redirect(`/admin/locations/${id}?error=delete`);
  }

  redirect("/admin/locations?deleted=1");
}

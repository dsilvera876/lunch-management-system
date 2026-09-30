"use server";

import { revalidatePath } from "next/cache";
import { requireMutateHrOperationalData, requireHrOperationalRead } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  previewBusinessCalendarEntryImpact,
  type BusinessCalendarEntryImpact,
} from "@/lib/business-calendar-server";
import type {
  BusinessCalendarEntryType,
  BusinessCalendarScope,
} from "@/lib/business-calendar-presentation";

function parseEntryForm(formData: FormData) {
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw.length > 0 ? idRaw : null;
  const calendarDate = String(formData.get("calendarDate") ?? "").trim();
  const entryType = String(formData.get("entryType") ?? "") as BusinessCalendarEntryType;
  const scope = String(formData.get("scope") ?? "") as BusinessCalendarScope;
  const officeLocationIdRaw = formData.get("officeLocationId");
  const officeLocationId =
    scope === "location" && typeof officeLocationIdRaw === "string"
      ? officeLocationIdRaw
      : null;
  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const acknowledgeImpact = formData.get("acknowledgeImpact") === "true";

  return {
    id,
    calendarDate,
    entryType,
    scope,
    officeLocationId,
    name,
    notes,
    acknowledgeImpact,
  };
}

export async function previewBusinessCalendarEntryImpactAction(
  formData: FormData,
): Promise<BusinessCalendarEntryImpact> {
  await requireHrOperationalRead();
  const parsed = parseEntryForm(formData);

  return previewBusinessCalendarEntryImpact({
    id: parsed.id,
    calendarDate: parsed.calendarDate,
    entryType: parsed.entryType,
    scope: parsed.scope,
    officeLocationId: parsed.officeLocationId,
  });
}

export async function saveBusinessCalendarEntry(formData: FormData) {
  await requireMutateHrOperationalData();
  const supabase = await createClient();
  const parsed = parseEntryForm(formData);

  const { error } = await supabase.rpc("upsert_manual_business_calendar_entry", {
    p_id: parsed.id,
    p_calendar_date: parsed.calendarDate,
    p_entry_type: parsed.entryType,
    p_scope: parsed.scope,
    p_office_location_id: parsed.officeLocationId,
    p_name: parsed.name,
    p_notes: parsed.notes.length > 0 ? parsed.notes : null,
    p_acknowledge_impact: parsed.acknowledgeImpact,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/settings/business-calendar");
}

export async function archiveBusinessCalendarEntry(entryId: string) {
  await requireMutateHrOperationalData();
  const supabase = await createClient();

  const { error } = await supabase.rpc("archive_business_calendar_entry", {
    p_id: entryId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/settings/business-calendar");
}

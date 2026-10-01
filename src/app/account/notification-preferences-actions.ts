"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setStaffNotificationPreferenceAction(input: {
  eventKey: string;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_my_notification_preference", {
    p_event_key: input.eventKey,
    p_enabled: input.enabled,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/account");
  return { ok: true };
}

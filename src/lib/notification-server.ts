import { createClient } from "@/lib/supabase/server";

export type StaffNotificationPreferenceRow = {
  event_key: string;
  display_name: string;
  description: string;
  personal_enabled: boolean;
  global_enabled: boolean;
  globally_disabled: boolean;
};

export type AdminNotificationEventRow = {
  event_key: string;
  display_name: string;
  description: string;
  global_enabled: boolean;
  send_time: string | null;
  minutes_before_deadline: number | null;
  timing_mode: string;
  timing_configurable: boolean;
  user_configurable: boolean;
  has_template: boolean;
};

export async function fetchMyNotificationPreferences(): Promise<
  StaffNotificationPreferenceRow[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_notification_preferences");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as StaffNotificationPreferenceRow[];
}

export async function fetchAdminNotificationEvents(
  audience: "staff" | "hr" | "accounts" | "provider" | "admin",
): Promise<AdminNotificationEventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_admin_notification_events", {
    p_audience: audience,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AdminNotificationEventRow[];
}

import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  mapSupportSessionFromRpcData,
  type ActiveSupportSession,
} from "@/lib/support-mode";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchActiveSupportSession(
  supabase?: SupabaseClient,
): Promise<ActiveSupportSession | null> {
  noStore();
  const client = supabase ?? (await createClient());
  const { data, error } = await client.rpc("get_support_session_status");

  if (error) {
    console.error("[support-mode] get_support_session_status failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return mapSupportSessionFromRpcData(data);
}

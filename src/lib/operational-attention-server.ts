import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canAccessOperationalAttentionInbox,
  mapOperationalAttentionRows,
  type OperationalAttentionInboxRow,
  type OperationalAttentionItem,
} from "@/lib/operational-attention";
import type { UserRole } from "@/lib/roles";

export async function getOperationalAttentionUnreadCount(
  supabase: SupabaseClient,
  role: UserRole,
): Promise<number> {
  if (!canAccessOperationalAttentionInbox(role)) {
    return 0;
  }

  const { data, error } = await supabase.rpc("count_my_unread_operational_attention_items");

  if (error || data === null) {
    return 0;
  }

  return Number(data);
}

export async function listOperationalAttentionItems(
  supabase: SupabaseClient,
  role: UserRole,
): Promise<OperationalAttentionItem[]> {
  if (!canAccessOperationalAttentionInbox(role)) {
    return [];
  }

  const { data, error } = await supabase.rpc("list_my_operational_attention_items", {
    p_limit: 20,
  });

  if (error || !data) {
    return [];
  }

  return mapOperationalAttentionRows(data as OperationalAttentionInboxRow[]);
}

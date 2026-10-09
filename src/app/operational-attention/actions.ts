"use server";

import { getCurrentProfile } from "@/lib/auth";
import {
  canAccessOperationalAttentionInbox,
  type OperationalAttentionInboxRow,
  mapOperationalAttentionRows,
} from "@/lib/operational-attention";
import { createClient } from "@/lib/supabase/server";

export type OperationalAttentionInboxResult =
  | {
      ok: true;
      items: ReturnType<typeof mapOperationalAttentionRows>;
      unreadCount: number;
    }
  | { ok: false; error: string };

export async function loadOperationalAttentionInbox(): Promise<OperationalAttentionInboxResult> {
  const profile = await getCurrentProfile();

  if (!profile || !canAccessOperationalAttentionInbox(profile.role)) {
    return { ok: false, error: "Operational attention inbox access required" };
  }

  const supabase = await createClient();

  const [listResult, countResult] = await Promise.all([
    supabase.rpc("list_my_operational_attention_items", { p_limit: 20 }),
    supabase.rpc("count_my_unread_operational_attention_items"),
  ]);

  if (listResult.error) {
    return { ok: false, error: listResult.error.message };
  }

  if (countResult.error) {
    return { ok: false, error: countResult.error.message };
  }

  return {
    ok: true,
    items: mapOperationalAttentionRows(
      (listResult.data ?? []) as OperationalAttentionInboxRow[],
    ),
    unreadCount: Number(countResult.data ?? 0),
  };
}

export async function refreshOperationalAttentionUnreadCount(): Promise<
  { ok: true; unreadCount: number } | { ok: false; error: string }
> {
  const profile = await getCurrentProfile();

  if (!profile || !canAccessOperationalAttentionInbox(profile.role)) {
    return { ok: false, error: "Operational attention inbox access required" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_my_unread_operational_attention_items");

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, unreadCount: Number(data ?? 0) };
}

export async function markOperationalAttentionItemRead(
  itemId: string,
): Promise<{ ok: true; updated: boolean } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();

  if (!profile || !canAccessOperationalAttentionInbox(profile.role)) {
    return { ok: false, error: "Operational attention inbox access required" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_operational_attention_item_read", {
    p_item_id: itemId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, updated: Boolean(data) };
}

export async function markAllOperationalAttentionItemsRead(): Promise<
  { ok: true; updatedCount: number } | { ok: false; error: string }
> {
  const profile = await getCurrentProfile();

  if (!profile || !canAccessOperationalAttentionInbox(profile.role)) {
    return { ok: false, error: "Operational attention inbox access required" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_my_operational_attention_items_read");

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, updatedCount: Number(data ?? 0) };
}

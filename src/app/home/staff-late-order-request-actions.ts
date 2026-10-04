"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type StaffLateOrderRequestRow = {
  id: string;
  provider_id: string;
  provider_name: string;
  order_date: string;
  scheduled_delivery_date: string;
  status: string;
  requested_summary: string;
  quantity: number;
  special_instructions: string | null;
  decline_reason: string | null;
  fulfilled_order_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EligibleLateOrderCycle = {
  provider_id: string;
  provider_name: string;
  order_date: string;
  scheduled_delivery_date: string;
};

export async function loadStaffLateOrderRequestContext(): Promise<{
  eligibleCycles: EligibleLateOrderCycle[];
  requests: StaffLateOrderRequestRow[];
}> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: cycles }, { data: requests, error }] = await Promise.all([
    supabase.rpc("list_staff_late_order_eligible_cycles"),
    supabase.rpc("get_my_staff_late_order_requests"),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  void profile;

  return {
    eligibleCycles: (cycles ?? []) as EligibleLateOrderCycle[],
    requests: (requests ?? []) as StaffLateOrderRequestRow[],
  };
}

export async function createStaffLateOrderRequestAction(input: {
  providerId: string;
  scheduledDeliveryDate: string;
  requestedSummary: string;
  quantity: number;
  specialInstructions?: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_staff_late_order_request", {
    p_provider_id: input.providerId,
    p_scheduled_delivery_date: input.scheduledDeliveryDate,
    p_requested_summary: input.requestedSummary,
    p_quantity: input.quantity,
    p_special_instructions: input.specialInstructions ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, requestId: String(data) };
}

export async function updateStaffLateOrderRequestAction(input: {
  requestId: string;
  requestedSummary: string;
  quantity: number;
  specialInstructions?: string;
  expectedUpdatedAt: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_staff_late_order_request", {
    p_request_id: input.requestId,
    p_requested_summary: input.requestedSummary,
    p_quantity: input.quantity,
    p_special_instructions: input.specialInstructions ?? null,
    p_expected_updated_at: input.expectedUpdatedAt,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function cancelStaffLateOrderRequestAction(
  requestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.rpc("cancel_staff_late_order_request", {
    p_request_id: requestId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

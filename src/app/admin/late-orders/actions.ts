"use server";

import { requireViewAllOrders } from "@/lib/auth";
import { executeSupplementalDispatch } from "@/lib/late-order-supplement-dispatch";
import { createClient } from "@/lib/supabase/server";

export type LateOrderActionResult =
  | { success: true; dispatchId?: string }
  | { success: false; error: string };

export async function createHrLateOrderAction(input: {
  profileId: string;
  providerId: string;
  deliveryDate: string;
  items: unknown;
  specialInstructions?: string;
  officeLocationId: string;
}): Promise<LateOrderActionResult> {
  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "HR late-order access required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_hr_late_order", {
    p_profile_id: input.profileId,
    p_provider_id: input.providerId,
    p_delivery_date: input.deliveryDate,
    p_items: input.items,
    p_special_instructions: input.specialInstructions ?? null,
    p_office_location_id: input.officeLocationId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, dispatchId: String(data) };
}

export async function sendProviderLateOrderSupplementAction(input: {
  providerId: string;
  deliveryDate: string;
}): Promise<LateOrderActionResult> {
  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "HR late-order access required." };
  }

  const supabase = await createClient();

  const { data: claimData, error: claimError } = await supabase.rpc(
    "claim_provider_late_order_supplement",
    {
      p_provider_id: input.providerId,
      p_scheduled_delivery_date: input.deliveryDate,
    },
  );

  if (claimError) {
    return { success: false, error: claimError.message };
  }

  const claim = claimData as {
    dispatch_id: string;
    provider_email: string;
    order_ids: string[];
  };

  const result = await executeSupplementalDispatch(supabase, claim, {
    providerId: input.providerId,
    deliveryDate: input.deliveryDate,
    finalizeRpc: "finalize_provider_late_order_supplement",
  });

  if (!result.success) {
    return {
      success: false,
      error: result.attentionRequired
        ? "Email outcome uncertain. Dispatch requires HR review before retry."
        : result.error,
    };
  }

  return { success: true, dispatchId: result.dispatchId };
}

export async function acknowledgeDispatchNotReceivedAction(input: {
  dispatchId: string;
}): Promise<LateOrderActionResult> {
  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "HR late-order access required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_provider_late_order_dispatch_not_received", {
    p_dispatch_id: input.dispatchId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, dispatchId: input.dispatchId };
}

export async function acknowledgeDispatchReceivedAction(input: {
  dispatchId: string;
}): Promise<LateOrderActionResult> {
  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "HR late-order access required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_provider_late_order_dispatch_received", {
    p_dispatch_id: input.dispatchId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, dispatchId: input.dispatchId };
}

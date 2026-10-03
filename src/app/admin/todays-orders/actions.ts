"use server";

import { requireMutateHrOperationalData } from "@/lib/auth";
import { executePrimaryProviderDispatch } from "@/lib/provider-primary-order-dispatch";
import { createClient } from "@/lib/supabase/server";

export type PrimaryOrderActionResult =
  | { success: true; dispatchId: string }
  | { success: false; error: string };

export async function sendProviderPrimaryOrderAction(input: {
  providerId: string;
  deliveryDate: string;
  resendOfDispatchId?: string | null;
}): Promise<PrimaryOrderActionResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR operational mutation access required." };
  }

  const supabase = await createClient();

  const { data: claimData, error: claimError } = await supabase.rpc(
    "claim_provider_primary_order_manual",
    {
      p_provider_id: input.providerId,
      p_scheduled_delivery_date: input.deliveryDate,
      p_resend_of_dispatch_id: input.resendOfDispatchId ?? null,
    },
  );

  if (claimError) {
    return { success: false, error: claimError.message };
  }

  const claim = claimData as {
    dispatch_id: string;
    provider_email: string | null;
    order_ids: string[];
    email_snapshot?: unknown;
  };

  const result = await executePrimaryProviderDispatch(supabase, claim, {
    providerId: input.providerId,
    deliveryDate: input.deliveryDate,
    finalizeRpc: "finalize_provider_primary_order",
    persistSnapshotRpc: "persist_provider_primary_order_email_snapshot",
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

export async function acknowledgePrimaryDispatchNotReceivedAction(input: {
  dispatchId: string;
}): Promise<PrimaryOrderActionResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR operational mutation access required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_provider_primary_order_dispatch_not_received", {
    p_dispatch_id: input.dispatchId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, dispatchId: input.dispatchId };
}

export async function acknowledgePrimaryDispatchReceivedAction(input: {
  dispatchId: string;
}): Promise<PrimaryOrderActionResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR operational mutation access required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_provider_primary_order_dispatch_received", {
    p_dispatch_id: input.dispatchId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, dispatchId: input.dispatchId };
}

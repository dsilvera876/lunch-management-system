"use server";

import { requireMutateHrOperationalData } from "@/lib/auth";
import {
  mapHrOrderMutationError,
  normalizeHrOrderMutationReason,
  type OrderItemsAuditLine,
} from "@/lib/hr-todays-order-mutation";
import { executePrimaryProviderDispatch } from "@/lib/provider-primary-order-dispatch";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

export type HrStaffOrderMutationResult =
  | { ok: true }
  | { ok: false; error: string };

export type HrStaffOrderEditMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  item_type: string;
  unit_label: string;
  display_category: string | null;
};

export type HrStaffOrderEditContext = {
  orderId: string;
  updatedAt: string;
  providerName: string;
  orderDate: string;
  deliveryDate: string;
  mealQuantity: number | null;
  items: OrderItemsAuditLine[];
  menuItems: HrStaffOrderEditMenuItem[];
};

export async function fetchHrStaffOrderEditContextAction(
  orderId: string,
): Promise<
  | { ok: true; context: HrStaffOrderEditContext }
  | { ok: false; error: string }
> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { ok: false, error: "HR operational mutation access required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fetch_hr_staff_order_edit_context", {
    p_order_id: orderId,
  });

  if (error) {
    return { ok: false, error: mapHrOrderMutationError(error.message) };
  }

  const payload = data as {
    order_id: string;
    updated_at: string;
    provider_name: string;
    order_date: string;
    delivery_date: string;
    meal_quantity: number | null;
    items: OrderItemsAuditLine[];
    menu_items: HrStaffOrderEditMenuItem[];
  };

  return {
    ok: true,
    context: {
      orderId: payload.order_id,
      updatedAt: payload.updated_at,
      providerName: payload.provider_name,
      orderDate: payload.order_date,
      deliveryDate: payload.delivery_date,
      mealQuantity: payload.meal_quantity,
      items: payload.items ?? [],
      menuItems: (payload.menu_items ?? []).map((item) => ({
        ...item,
        price: Number(item.price),
      })),
    },
  };
}

export async function hrModifyStaffOrderAction(input: {
  orderId: string;
  items: Record<string, unknown>;
  reason: string;
  expectedUpdatedAt: string;
}): Promise<HrStaffOrderMutationResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { ok: false, error: "You do not have permission to change employee orders." };
  }

  const reason = normalizeHrOrderMutationReason(input.reason);
  if (!reason) {
    return { ok: false, error: "Enter a reason for this HR change." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_modify_staff_order", {
    p_order_id: input.orderId,
    p_items: input.items,
    p_reason: reason,
    p_expected_updated_at: input.expectedUpdatedAt,
  });

  if (error) {
    return { ok: false, error: mapHrOrderMutationError(error.message) };
  }

  revalidatePath("/admin/todays-orders");
  return { ok: true };
}

export async function hrCancelStaffOrderAction(input: {
  orderId: string;
  reason: string;
  expectedUpdatedAt: string;
}): Promise<HrStaffOrderMutationResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { ok: false, error: "You do not have permission to change employee orders." };
  }

  const reason = normalizeHrOrderMutationReason(input.reason);
  if (!reason) {
    return { ok: false, error: "Enter a reason for this HR change." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_cancel_staff_order", {
    p_order_id: input.orderId,
    p_reason: reason,
    p_expected_updated_at: input.expectedUpdatedAt,
  });

  if (error) {
    return { ok: false, error: mapHrOrderMutationError(error.message) };
  }

  revalidatePath("/admin/todays-orders");
  return { ok: true };
}

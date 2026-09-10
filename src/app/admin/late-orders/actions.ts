"use server";

import { requireViewAllOrders } from "@/lib/auth";
import { executeSupplementalDispatch } from "@/lib/late-order-supplement-dispatch";
import type { MenuItemType } from "@/lib/menu-items";
import {
  buildSnapshotOrderPayload,
  hasSelectedOrderItems,
} from "@/lib/order-payload";
import { createClient } from "@/lib/supabase/server";

export type HrLateOrderSnapshotMenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  itemType: MenuItemType;
  unitLabel: string;
  displayCategory: string | null;
};

export type LoadHrLateOrderSnapshotMenuResult =
  | {
      success: true;
      status: string;
      orderDate: string;
      deliveryDate: string;
      menuItems: HrLateOrderSnapshotMenuItem[];
    }
  | { success: false; error: string };

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

export async function loadHrLateOrderSnapshotMenuAction(input: {
  providerId: string;
  deliveryDate: string;
}): Promise<LoadHrLateOrderSnapshotMenuResult> {
  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "HR late-order access required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fetch_hr_late_order_snapshot_menu", {
    p_provider_id: input.providerId,
    p_delivery_date: input.deliveryDate,
  });

  if (error) {
    console.error("Failed to load HR late-order snapshot menu", {
      message: error.message,
      code: error.code,
    });
    return { success: false, error: "Unable to load menu for this cycle." };
  }

  const payload = data as {
    status?: string;
    order_date?: string;
    delivery_date?: string;
    menu_items?: Array<{
      id: string;
      name: string;
      description: string | null;
      price: number | string;
      item_type: string;
      unit_label: string;
      display_category: string | null;
    }>;
  };

  const menuItems = (payload.menu_items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: Number(item.price),
    itemType: item.item_type as MenuItemType,
    unitLabel: item.unit_label,
    displayCategory: item.display_category,
  }));

  return {
    success: true,
    status: payload.status ?? "unknown",
    orderDate: String(payload.order_date ?? ""),
    deliveryDate: String(payload.delivery_date ?? input.deliveryDate),
    menuItems,
  };
}

export async function createHrLateOrderFormAction(
  formData: FormData,
): Promise<LateOrderActionResult> {
  const profileId = String(formData.get("profileId") ?? "");
  const providerId = String(formData.get("providerId") ?? "");
  const deliveryDate = String(formData.get("deliveryDate") ?? "");
  const officeLocationId = String(formData.get("officeLocationId") ?? "");
  const specialInstructionsRaw = formData.get("specialInstructions");
  const specialInstructions =
    typeof specialInstructionsRaw === "string" ? specialInstructionsRaw : "";

  const items = buildSnapshotOrderPayload(formData);

  if (!hasSelectedOrderItems(items)) {
    return { success: false, error: "Select at least one menu item." };
  }

  return createHrLateOrderAction({
    profileId,
    providerId,
    deliveryDate,
    items,
    specialInstructions,
    officeLocationId,
  });
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

"use server";

import { requireMutateHrOperationalData, requireViewAllOrders } from "@/lib/auth";
import { executeSupplementalDispatch } from "@/lib/late-order-supplement-dispatch";
import type { MenuItemType } from "@/lib/menu-items";
import {
  buildSnapshotOrderPayload,
  hasSelectedOrderItems,
} from "@/lib/order-payload";
import {
  fetchHrLateOrderCreationCyclesForProvider,
  isDeliveryDateAllowedForHrLateOrderCreation,
} from "@/lib/hr-late-order-create";
import { LATE_ORDER_EMPLOYEE_REQUIRED_MESSAGE } from "@/lib/late-orders-presentation";
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

export type HrLateOrderPreviewEmployee = {
  id: string;
  name: string;
  email: string;
};

export type SearchHrLateOrderPreviewEmployeesResult =
  | { success: true; employees: HrLateOrderPreviewEmployee[] }
  | { success: false; error: string };

export type LateOrderActionResult =
  | { success: true; dispatchId?: string }
  | { success: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSnapshotMenuPayload(
  data: unknown,
  fallbackDeliveryDate: string,
): LoadHrLateOrderSnapshotMenuResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { success: false, error: "The menu response was invalid." };
  }

  const payload = data as Record<string, unknown>;
  if (!Array.isArray(payload.menu_items)) {
    return { success: false, error: "The menu response was invalid." };
  }

  const menuItems: HrLateOrderSnapshotMenuItem[] = [];
  for (const rawItem of payload.menu_items) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      return { success: false, error: "The menu response was invalid." };
    }
    const item = rawItem as Record<string, unknown>;
    const price = Number(item.price);
    if (
      typeof item.id !== "string" ||
      !UUID_PATTERN.test(item.id) ||
      typeof item.name !== "string" ||
      !Number.isFinite(price) ||
      price < 0 ||
      !["main", "side", "standalone"].includes(String(item.item_type)) ||
      typeof item.unit_label !== "string"
    ) {
      return { success: false, error: "The menu response was invalid." };
    }
    menuItems.push({
      id: item.id,
      name: item.name,
      description: typeof item.description === "string" ? item.description : null,
      price,
      itemType: item.item_type as MenuItemType,
      unitLabel: item.unit_label,
      displayCategory:
        typeof item.display_category === "string" ? item.display_category : null,
    });
  }

  return {
    success: true,
    status: typeof payload.status === "string" ? payload.status : "unknown",
    orderDate: typeof payload.order_date === "string" ? payload.order_date : "",
    deliveryDate:
      typeof payload.delivery_date === "string"
        ? payload.delivery_date
        : fallbackDeliveryDate,
    menuItems,
  };
}

export async function searchHrLateOrderPreviewEmployeesAction(
  search: string,
): Promise<SearchHrLateOrderPreviewEmployeesResult> {
  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "HR late-order access required." };
  }

  if (search.trim().length < 2) {
    return { success: true, employees: [] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_hr_late_order_preview_employees", {
    p_search: search,
    p_limit: 20,
  });

  if (error) {
    console.error("Failed to search HR late-order preview employees", {
      message: error.message,
      code: error.code,
    });
    return { success: false, error: "Unable to search employees right now." };
  }

  if (!Array.isArray(data)) {
    return { success: false, error: "The employee search response was invalid." };
  }

  const employees: HrLateOrderPreviewEmployee[] = [];
  for (const rawRow of data) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
      return { success: false, error: "The employee search response was invalid." };
    }
    const row = rawRow as Record<string, unknown>;
    if (
      typeof row.profile_id !== "string" ||
      !UUID_PATTERN.test(row.profile_id) ||
      typeof row.full_name !== "string" ||
      typeof row.email !== "string"
    ) {
      return { success: false, error: "The employee search response was invalid." };
    }
    employees.push({ id: row.profile_id, name: row.full_name, email: row.email });
  }

  return { success: true, employees };
}

export async function fulfillStaffLateOrderRequestAction(input: {
  requestId: string;
  items: unknown;
  specialInstructions?: string;
  officeLocationId: string;
}): Promise<LateOrderActionResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR late-order mutation access required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fulfill_staff_late_order_request", {
    p_request_id: input.requestId,
    p_items: input.items,
    p_special_instructions: input.specialInstructions ?? null,
    p_office_location_id: input.officeLocationId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, dispatchId: String(data) };
}

export async function declineStaffLateOrderRequestAction(input: {
  requestId: string;
  declineReason: string;
}): Promise<LateOrderActionResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR late-order mutation access required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_staff_late_order_request", {
    p_request_id: input.requestId,
    p_decline_reason: input.declineReason,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function createHrLateOrderAction(input: {
  profileId: string;
  providerId: string;
  deliveryDate: string;
  items: unknown;
  specialInstructions?: string;
  officeLocationId: string;
}): Promise<LateOrderActionResult> {
  try {
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR late-order mutation access required." };
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
  profileId?: string;
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
    p_profile_id: input.profileId ?? null,
  });

  if (error) {
    console.error("Failed to load HR late-order snapshot menu", {
      message: error.message,
      code: error.code,
    });
    return {
      success: false,
      error: "Unable to load the menu for this provider and delivery date.",
    };
  }

  return parseSnapshotMenuPayload(data, input.deliveryDate);
}

export async function loadHrLateOrderPreviewMenuAction(input: {
  providerId: string;
  deliveryDate: string;
  profileId?: string;
  officeLocationId?: string;
}): Promise<LoadHrLateOrderSnapshotMenuResult> {
  try {
    await requireViewAllOrders();
  } catch {
    return { success: false, error: "HR late-order access required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_hr_late_order_menu", {
    p_provider_id: input.providerId,
    p_delivery_date: input.deliveryDate,
    p_profile_id: input.profileId ?? null,
    p_office_location_id: input.officeLocationId ?? null,
  });

  if (error) {
    console.error("Failed to load HR late-order preview menu", {
      message: error.message,
      code: error.code,
    });
    return {
      success: false,
      error: "Unable to load the menu preview for this provider and delivery date.",
    };
  }

  return parseSnapshotMenuPayload(data, input.deliveryDate);
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

  if (!profileId.trim()) {
    return { success: false, error: LATE_ORDER_EMPLOYEE_REQUIRED_MESSAGE };
  }

  const items = buildSnapshotOrderPayload(formData);

  if (!hasSelectedOrderItems(items)) {
    return { success: false, error: "Select at least one menu item." };
  }

  const supabase = await createClient();
  const now = new Date();
  const actionableCycles = await fetchHrLateOrderCreationCyclesForProvider(
    supabase,
    providerId,
    now,
  );

  if (!isDeliveryDateAllowedForHrLateOrderCreation(actionableCycles, deliveryDate)) {
    return {
      success: false,
      error: "Selected delivery cycle is not open for late orders for this provider.",
    };
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
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR late-order mutation access required." };
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
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR late-order mutation access required." };
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
    await requireMutateHrOperationalData();
  } catch {
    return { success: false, error: "HR late-order mutation access required." };
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

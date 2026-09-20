"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  buildProviderOrderPayload,
  buildSnapshotOrderPayload,
  hasSelectedOrderItems,
} from "@/lib/order-payload";
import { createClient } from "@/lib/supabase/server";
import {
  assertCheckoutDraftsMatchLoadedMenus,
  buildCheckoutRpcPayload,
  validateLunchCart,
} from "@/lib/lunch-checkout";
import type { LunchCartEntry } from "@/lib/lunch-cart";
import type {
  SubmitLunchCheckoutResult,
  SubmitProviderOrderResult,
} from "@/lib/submit-provider-order-result";
import { getStaffOrderingContext } from "@/lib/staff-ordering";
import { loadProviderMenusForOrderDate } from "@/lib/staff-provider-menu";
function getOrderErrorCode(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("deadline")) {
    return "deadline";
  }

  if (
    normalized.includes("ordering is not open") ||
    normalized.includes("not available on weekends")
  ) {
    return "closed";
  }

  if (normalized.includes("lunch period has been finalized")) {
    return "finalized";
  }

  if (
    normalized.includes("main item requires") ||
    normalized.includes("side items require") ||
    normalized.includes("only one main") ||
    normalized.includes("meal quantity") ||
    normalized.includes("meal bundle") ||
    normalized.includes("duplicate menu items") ||
    normalized.includes("must contain at least one item") ||
    normalized.includes("standalone-only orders")
  ) {
    return "composition";
  }

  if (normalized.includes("special instructions are too long")) {
    return "instructions";
  }

  if (
    normalized.includes("delivery location is required") ||
    normalized.includes("delivery location is invalid or inactive")
  ) {
    return "location";
  }

  if (
    normalized.includes("menu item is invalid") ||
    normalized.includes("inactive") ||
    normalized.includes("not available")
  ) {
    return "unavailable-item";
  }

  if (normalized.includes("only submitted orders")) {
    return "locked";
  }

  if (
    normalized.includes("not authorized") ||
    normalized.includes("authentication required")
  ) {
    return "unauthorized";
  }

  return "generic";
}

export async function submitProviderOrder(
  formData: FormData,
): Promise<SubmitProviderOrderResult> {
  await requireProfile();

  const providerId = formData.get("providerId");
  const orderDate = formData.get("orderDate");
  const providerIdString = typeof providerId === "string" ? providerId : null;

  if (typeof providerId !== "string" || typeof orderDate !== "string") {
    return { ok: false, errorCode: "invalid", providerId: providerIdString };
  }

  const order = buildProviderOrderPayload(formData);
  const specialInstructions = formData.get("specialInstructions");
  const officeLocationId = formData.get("officeLocationId");
  const saveAsDefault = formData.get("saveAsDefault");

  if (!hasSelectedOrderItems(order)) {
    return { ok: false, errorCode: "empty", providerId };
  }

  if (typeof officeLocationId !== "string" || officeLocationId.length === 0) {
    return { ok: false, errorCode: "location", providerId };
  }

  if (
    typeof specialInstructions === "string" &&
    specialInstructions.trim().length > 500
  ) {
    return { ok: false, errorCode: "instructions", providerId };
  }

  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("submit_provider_order", {
    p_provider_id: providerId,
    p_order_date: orderDate,
    p_items: order,
    p_special_instructions:
      typeof specialInstructions === "string" ? specialInstructions : null,
    p_office_location_id: officeLocationId,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    return { ok: false, errorCode, providerId };
  }

  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, errorCode: "generic", providerId };
  }

  if (saveAsDefault === "on") {
    await supabase.rpc("set_my_default_office_location", {
      p_office_location_id: officeLocationId,
    });
  }

  revalidatePath("/lunch");
  revalidatePath("/my-orders");
  revalidatePath(`/lunch/providers/${providerId}`);
  revalidatePath(`/lunch/orders/${orderId}`);

  return { ok: true, orderId, providerId };
}

type SubmitCheckoutInput = {
  orderDate: string;
  officeLocationId: string;
  saveAsDefault: boolean;
  cartEntries: LunchCartEntry[];
};

export async function submitLunchCheckout(
  input: SubmitCheckoutInput,
): Promise<SubmitLunchCheckoutResult> {
  const profile = await requireProfile();

  const { orderDate, officeLocationId, saveAsDefault, cartEntries } = input;

  if (!orderDate || !officeLocationId) {
    return {
      ok: false,
      errorCode: "location",
      providerId: null,
      providerName: null,
      message: null,
    };
  }

  const ctx = await getStaffOrderingContext(profile.id);

  if (!ctx.orderingOpen || !ctx.orderWeekday) {
    return {
      ok: false,
      errorCode: "closed",
      providerId: null,
      providerName: null,
      message: null,
    };
  }

  const supabase = await createClient();
  const providers = await loadProviderMenusForOrderDate(
    supabase,
    ctx.orderDate,
    ctx.orderWeekday,
  );

  const checkout = validateLunchCart(providers, cartEntries);

  if (!checkout.canSubmit) {
    return {
      ok: false,
      errorCode: checkout.entries.length === 0 ? "empty" : "composition",
      providerId: checkout.entries.find((entry) => !entry.validation.valid)?.providerId ?? null,
      providerName:
        checkout.entries.find((entry) => !entry.validation.valid)?.providerName ?? null,
      message: checkout.guidanceMessage,
    };
  }

  if (orderDate !== ctx.orderDate) {
    return {
      ok: false,
      errorCode: "closed",
      providerId: null,
      providerName: null,
      message: null,
    };
  }

  const menuAlignment = assertCheckoutDraftsMatchLoadedMenus(providers, checkout.entries);
  if (!menuAlignment.ok) {
    return {
      ok: false,
      errorCode: "unavailable-item",
      providerId: menuAlignment.providerId,
      providerName: menuAlignment.providerName,
      message: `${menuAlignment.providerName}: One or more menu items are no longer available. Refresh the page and try again.`,
    };
  }

  const rpcPayload = buildCheckoutRpcPayload(checkout.entries);

  const { data, error } = await supabase.rpc("submit_provider_checkout", {
    p_order_date: ctx.orderDate,
    p_office_location_id: officeLocationId,
    p_provider_orders: rpcPayload,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    return {
      ok: false,
      errorCode,
      providerId: null,
      providerName: null,
      message: error.message,
    };
  }

  const parsed = data as {
    order_group_id?: string;
    order_ids?: string[];
  } | null;

  const orderGroupId = parsed?.order_group_id;
  const orderIds = parsed?.order_ids ?? [];

  if (!orderGroupId || orderIds.length !== checkout.entries.length) {
    return {
      ok: false,
      errorCode: "generic",
      providerId: null,
      providerName: null,
      message: null,
    };
  }

  if (saveAsDefault) {
    await supabase.rpc("set_my_default_office_location", {
      p_office_location_id: officeLocationId,
    });
  }

  revalidatePath("/lunch");
  revalidatePath("/my-orders");
  for (const entry of checkout.entries) {
    revalidatePath(`/lunch/providers/${entry.providerId}`);
  }
  for (const orderId of orderIds) {
    revalidatePath(`/lunch/orders/${orderId}`);
  }

  return {
    ok: true,
    orderGroupId,
    orderIds,
    providerIds: checkout.entries.map((entry) => entry.providerId),
    providerNames: checkout.entries.map((entry) => entry.providerName),
  };
}

export async function submitLunchOrder(formData: FormData) {
  await requireProfile();

  const lunchDayId = formData.get("lunchDayId");

  if (typeof lunchDayId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const order = buildSnapshotOrderPayload(formData);
  const officeLocationId = formData.get("officeLocationId");

  if (!hasSelectedOrderItems(order)) {
    redirect(`/lunch/${lunchDayId}?error=empty`);
  }

  if (typeof officeLocationId !== "string" || officeLocationId.length === 0) {
    redirect(`/lunch/${lunchDayId}?error=location`);
  }

  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("submit_order", {
    p_lunch_day_id: lunchDayId,
    p_items: order,
    p_office_location_id: officeLocationId,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/${lunchDayId}?error=${errorCode}`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/${lunchDayId}`);
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?ordered=1`);
}

export async function updateLunchOrder(formData: FormData) {
  await requireProfile();

  const orderId = formData.get("orderId");

  if (typeof orderId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const order = buildSnapshotOrderPayload(formData);
  const specialInstructions = formData.get("specialInstructions");
  const officeLocationId = formData.get("officeLocationId");

  if (!hasSelectedOrderItems(order)) {
    redirect(`/lunch/orders/${orderId}?error=empty&edit=1`);
  }

  if (typeof officeLocationId !== "string" || officeLocationId.length === 0) {
    redirect(`/lunch/orders/${orderId}?error=location&edit=1`);
  }

  if (
    typeof specialInstructions === "string" &&
    specialInstructions.trim().length > 500
  ) {
    redirect(`/lunch/orders/${orderId}?error=instructions&edit=1`);
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("replace_order_items", {
    p_order_id: orderId,
    p_items: order,
    p_special_instructions:
      typeof specialInstructions === "string" ? specialInstructions : null,
    p_office_location_id: officeLocationId,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/orders/${orderId}?error=${errorCode}&edit=1`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?updated=1`);
}

export async function cancelLunchOrder(formData: FormData) {
  await requireProfile();

  const orderId = formData.get("orderId");

  if (typeof orderId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/orders/${orderId}?error=${errorCode}`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?cancelled=1`);
}

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

export async function submitProviderOrder(formData: FormData) {
  await requireProfile();

  const providerId = formData.get("providerId");
  const orderDate = formData.get("orderDate");

  if (typeof providerId !== "string" || typeof orderDate !== "string") {
    redirect("/lunch?error=invalid");
  }

  const order = buildProviderOrderPayload(formData);
  const specialInstructions = formData.get("specialInstructions");

  if (!hasSelectedOrderItems(order)) {
    redirect(`/lunch/providers/${providerId}?error=empty`);
  }

  if (
    typeof specialInstructions === "string" &&
    specialInstructions.trim().length > 500
  ) {
    redirect(`/lunch/providers/${providerId}?error=instructions`);
  }

  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("submit_provider_order", {
    p_provider_id: providerId,
    p_order_date: orderDate,
    p_items: order,
    p_special_instructions:
      typeof specialInstructions === "string" ? specialInstructions : null,
  });

  if (error) {
    const errorCode = getOrderErrorCode(error.message);
    redirect(`/lunch/providers/${providerId}?error=${errorCode}`);
  }

  revalidatePath("/lunch");
  revalidatePath(`/lunch/providers/${providerId}`);
  revalidatePath(`/lunch/orders/${orderId}`);

  redirect(`/lunch/orders/${orderId}?ordered=1`);
}

export async function submitLunchOrder(formData: FormData) {
  await requireProfile();

  const lunchDayId = formData.get("lunchDayId");

  if (typeof lunchDayId !== "string") {
    redirect("/lunch?error=invalid");
  }

  const order = buildSnapshotOrderPayload(formData);

  if (!hasSelectedOrderItems(order)) {
    redirect(`/lunch/${lunchDayId}?error=empty`);
  }

  const supabase = await createClient();

  const { data: orderId, error } = await supabase.rpc("submit_order", {
    p_lunch_day_id: lunchDayId,
    p_items: order,
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

  if (!hasSelectedOrderItems(order)) {
    redirect(`/lunch/orders/${orderId}?error=empty&edit=1`);
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

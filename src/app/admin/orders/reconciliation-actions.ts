"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildSnapshotOrderPayload } from "@/lib/order-payload";
import {
  DELIVERY_ISSUE_TYPES,
  DELIVERY_RESOLUTION_TYPES,
  type DeliveryIssueType,
  type DeliveryResolutionType,
} from "@/lib/delivery-reconciliation";

function sanitizeReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/admin/orders")) {
    return "/admin/orders";
  }

  return value;
}

function redirectWithResult(returnTo: string, key: string) {
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}${key}=1`);
}

function redirectWithError(returnTo: string, key: string) {
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${key}`);
}

function readIssueType(value: FormDataEntryValue | null): DeliveryIssueType | null {
  if (typeof value !== "string") {
    return null;
  }

  return DELIVERY_ISSUE_TYPES.includes(value as DeliveryIssueType)
    ? (value as DeliveryIssueType)
    : null;
}

function readResolutionType(
  value: FormDataEntryValue | null,
): DeliveryResolutionType | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  return DELIVERY_RESOLUTION_TYPES.includes(value as DeliveryResolutionType)
    ? (value as DeliveryResolutionType)
    : null;
}

async function runReconciliationRpc(
  returnTo: string,
  runner: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
  successKey: string,
  errorKey: string,
) {
  await requireFulfillOrders();
  const supabase = await createClient();
  const { error } = await runner(supabase);

  if (error) {
    redirectWithError(returnTo, errorKey);
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/provider", "layout");
  revalidatePath("/my-orders");
  revalidatePath("/financials");

  redirectWithResult(returnTo, successKey);
}

export async function markOrderDelivered(formData: FormData) {
  const orderId = formData.get("orderId");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));
  const actualDeliveryDate = formData.get("actualDeliveryDate");

  if (typeof orderId !== "string") {
    redirectWithError(returnTo, "invalid");
  }

  await runReconciliationRpc(
    returnTo,
    (supabase) =>
      supabase.rpc("mark_order_delivered", {
        p_order_id: orderId,
        p_actual_delivery_date:
          typeof actualDeliveryDate === "string" && actualDeliveryDate
            ? actualDeliveryDate
            : undefined,
      }),
    "delivered",
    "deliver",
  );
}

export async function reportOrderDeliveryIssue(formData: FormData) {
  const orderId = formData.get("orderId");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));
  const issueType = readIssueType(formData.get("issueType"));
  const resolutionType = readResolutionType(formData.get("resolutionType"));
  const hrNotes = formData.get("hrNotes");

  if (typeof orderId !== "string" || !issueType) {
    redirectWithError(returnTo, "invalid");
  }

  await runReconciliationRpc(
    returnTo,
    (supabase) =>
      supabase.rpc("report_order_delivery_issue", {
        p_order_id: orderId,
        p_issue_type: issueType,
        p_hr_notes: typeof hrNotes === "string" ? hrNotes : undefined,
        p_resolution_type: resolutionType ?? undefined,
      }),
    "issue-reported",
    "issue",
  );
}

export async function updateOrderDeliveryResolution(formData: FormData) {
  const orderId = formData.get("orderId");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));
  const resolutionType = readResolutionType(formData.get("resolutionType"));
  const hrNotes = formData.get("hrNotes");

  if (typeof orderId !== "string" || !resolutionType) {
    redirectWithError(returnTo, "invalid");
  }

  await runReconciliationRpc(
    returnTo,
    (supabase) =>
      supabase.rpc("update_order_delivery_resolution", {
        p_order_id: orderId,
        p_resolution_type: resolutionType,
        p_hr_notes: typeof hrNotes === "string" ? hrNotes : undefined,
      }),
    "resolution-updated",
    "resolution",
  );
}

export async function confirmOrderDeliveryResolved(formData: FormData) {
  const orderId = formData.get("orderId");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));
  const actualDeliveryDate = formData.get("actualDeliveryDate");

  if (typeof orderId !== "string") {
    redirectWithError(returnTo, "invalid");
  }

  await runReconciliationRpc(
    returnTo,
    (supabase) =>
      supabase.rpc("confirm_order_delivery_resolved", {
        p_order_id: orderId,
        p_actual_delivery_date:
          typeof actualDeliveryDate === "string" && actualDeliveryDate
            ? actualDeliveryDate
            : undefined,
      }),
    "resolved",
    "confirm",
  );
}

export async function resolveOrderNoCharge(formData: FormData) {
  const orderId = formData.get("orderId");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));
  const hrNotes = formData.get("hrNotes");

  if (typeof orderId !== "string") {
    redirectWithError(returnTo, "invalid");
  }

  await runReconciliationRpc(
    returnTo,
    (supabase) =>
      supabase.rpc("resolve_order_no_charge", {
        p_order_id: orderId,
        p_hr_notes: typeof hrNotes === "string" ? hrNotes : undefined,
      }),
    "waived",
    "waive",
  );
}

export async function updateOrderHrDeliveryNotes(formData: FormData) {
  const orderId = formData.get("orderId");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));
  const hrNotes = formData.get("hrNotes");

  if (typeof orderId !== "string" || typeof hrNotes !== "string") {
    redirectWithError(returnTo, "invalid");
  }

  await runReconciliationRpc(
    returnTo,
    (supabase) =>
      supabase.rpc("update_order_hr_delivery_notes", {
        p_order_id: orderId,
        p_hr_notes: hrNotes,
      }),
    "notes-updated",
    "notes",
  );
}

export async function adjustOperationalOrderItems(formData: FormData) {
  const orderId = formData.get("orderId");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));
  const reason = formData.get("reason");

  if (typeof orderId !== "string") {
    redirectWithError(returnTo, "invalid");
  }

  const itemsPayload = buildSnapshotOrderPayload(formData);

  await runReconciliationRpc(
    returnTo,
    (supabase) =>
      supabase.rpc("adjust_operational_order_items", {
        p_order_id: orderId,
        p_items: itemsPayload,
        p_reason: typeof reason === "string" ? reason : undefined,
      }),
    "adjusted",
    "adjust",
  );
}

/** @deprecated Use markOrderDelivered */
export async function fulfillOrder(formData: FormData) {
  await markOrderDelivered(formData);
}

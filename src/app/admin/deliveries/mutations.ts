"use server";

import { requireFulfillOrders } from "@/lib/auth";
import { getJamaicaTodayDate } from "@/lib/datetime";
import {
  DELIVERY_ISSUE_TYPES,
  DELIVERY_RESOLUTION_TYPES,
  type DeliveryIssueType,
  type DeliveryResolutionType,
} from "@/lib/delivery-reconciliation";
import type { DeliveryOrderPatch } from "@/lib/deliveries";
import { createClient } from "@/lib/supabase/server";

export type DeliveryMutationResult =
  | { success: true; patch: DeliveryOrderPatch }
  | { success: false; error: string };

function readIssueType(value: unknown): DeliveryIssueType | null {
  if (typeof value !== "string") {
    return null;
  }

  return DELIVERY_ISSUE_TYPES.includes(value as DeliveryIssueType)
    ? (value as DeliveryIssueType)
    : null;
}

function readResolutionType(value: unknown): DeliveryResolutionType | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  return DELIVERY_RESOLUTION_TYPES.includes(value as DeliveryResolutionType)
    ? (value as DeliveryResolutionType)
    : null;
}

async function runDeliveryMutation(
  runner: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { message: string } | null }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireFulfillOrders();
  } catch {
    return { ok: false, error: "Delivery reconciliation access required" };
  }

  const supabase = await createClient();
  const { error } = await runner(supabase);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function markOrderDeliveredMutation(input: {
  orderId: string;
  actualDeliveryDate?: string;
}): Promise<DeliveryMutationResult> {
  const actualDate = input.actualDeliveryDate?.trim() || getJamaicaTodayDate();
  const result = await runDeliveryMutation((supabase) =>
    supabase.rpc("mark_order_delivered", {
      p_order_id: input.orderId,
      p_actual_delivery_date: actualDate,
    }),
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    patch: {
      id: input.orderId,
      deliveryState: "delivered",
      financialDisposition: "chargeable",
      status: "fulfilled",
      actualDeliveryDate: actualDate,
      deliveryIssueType: null,
      deliveryResolutionType: null,
    },
  };
}

export async function reportOrderDeliveryIssueMutation(input: {
  orderId: string;
  issueType: string;
  resolutionType?: string;
  hrNotes?: string;
}): Promise<DeliveryMutationResult> {
  const issueType = readIssueType(input.issueType);

  if (!issueType) {
    return { success: false, error: "Invalid delivery issue type" };
  }

  const resolutionType = readResolutionType(input.resolutionType ?? null);
  const hrNotes = input.hrNotes?.trim() || null;
  const result = await runDeliveryMutation((supabase) =>
    supabase.rpc("report_order_delivery_issue", {
      p_order_id: input.orderId,
      p_issue_type: issueType,
      p_hr_notes: hrNotes ?? undefined,
      p_resolution_type: resolutionType ?? undefined,
    }),
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    patch: {
      id: input.orderId,
      deliveryState: "issue_open",
      financialDisposition: "on_hold",
      deliveryIssueType: issueType,
      deliveryResolutionType: resolutionType,
      hrDeliveryNotes: hrNotes,
    },
  };
}

export async function updateOrderDeliveryResolutionMutation(input: {
  orderId: string;
  resolutionType: string;
  hrNotes?: string;
}): Promise<DeliveryMutationResult> {
  const resolutionType = readResolutionType(input.resolutionType);

  if (!resolutionType) {
    return { success: false, error: "Invalid delivery resolution type" };
  }

  const hrNotes = input.hrNotes?.trim() || null;
  const result = await runDeliveryMutation((supabase) =>
    supabase.rpc("update_order_delivery_resolution", {
      p_order_id: input.orderId,
      p_resolution_type: resolutionType,
      p_hr_notes: hrNotes ?? undefined,
    }),
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    patch: {
      id: input.orderId,
      deliveryResolutionType: resolutionType,
      hrDeliveryNotes: hrNotes,
      financialDisposition: "on_hold",
    },
  };
}

export async function confirmOrderDeliveryResolvedMutation(input: {
  orderId: string;
  actualDeliveryDate?: string;
}): Promise<DeliveryMutationResult> {
  const actualDate = input.actualDeliveryDate?.trim() || getJamaicaTodayDate();
  const result = await runDeliveryMutation((supabase) =>
    supabase.rpc("confirm_order_delivery_resolved", {
      p_order_id: input.orderId,
      p_actual_delivery_date: actualDate,
    }),
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    patch: {
      id: input.orderId,
      deliveryState: "resolved",
      financialDisposition: "chargeable",
      status: "fulfilled",
      actualDeliveryDate: actualDate,
    },
  };
}

export async function resolveOrderNoChargeMutation(input: {
  orderId: string;
  hrNotes?: string;
}): Promise<DeliveryMutationResult> {
  const hrNotes = input.hrNotes?.trim() || null;
  const result = await runDeliveryMutation((supabase) =>
    supabase.rpc("resolve_order_no_charge", {
      p_order_id: input.orderId,
      p_hr_notes: hrNotes ?? undefined,
    }),
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    patch: {
      id: input.orderId,
      deliveryState: "resolved",
      financialDisposition: "waived",
      hrDeliveryNotes: hrNotes,
    },
  };
}

export async function updateOrderHrDeliveryNotesMutation(input: {
  orderId: string;
  hrNotes: string;
}): Promise<DeliveryMutationResult> {
  const hrNotes = input.hrNotes.trim() || null;
  const result = await runDeliveryMutation((supabase) =>
    supabase.rpc("update_order_hr_delivery_notes", {
      p_order_id: input.orderId,
      p_hr_notes: hrNotes ?? "",
    }),
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    patch: {
      id: input.orderId,
      hrDeliveryNotes: hrNotes,
    },
  };
}

"use server";

import { revalidatePath } from "next/cache";

import { saveMyDefaultOfficeLocation } from "@/app/account/actions";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isInactiveLateOrderEligibilityError,
  LATE_ORDER_DEFAULT_SAVE_WARNING,
  shouldSaveDefaultOnLateOrderSubmit,
} from "@/lib/staff-late-order-location-save";

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

async function fetchEligibleLateOrderCycles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  officeLocationId?: string | null,
): Promise<EligibleLateOrderCycle[]> {
  const { data, error } = await supabase.rpc("list_staff_late_order_eligible_cycles", {
    p_office_location_id: officeLocationId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as EligibleLateOrderCycle[];
}

export async function loadStaffLateOrderEligibleCyclesAction(
  officeLocationId: string,
): Promise<{ ok: true; eligibleCycles: EligibleLateOrderCycle[] } | { ok: false; error: string }> {
  await requireProfile();

  if (!officeLocationId) {
    return { ok: false, error: "Delivery location is required" };
  }

  const supabase = await createClient();

  try {
    const eligibleCycles = await fetchEligibleLateOrderCycles(supabase, officeLocationId);
    return { ok: true, eligibleCycles };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load late-order options";
    return { ok: false, error: message };
  }
}

export async function loadStaffLateOrderRequestContext(options?: {
  /** Active saved default only; omit or null when default is missing or inactive. */
  officeLocationId?: string | null;
}): Promise<{
  eligibleCycles: EligibleLateOrderCycle[];
  requests: StaffLateOrderRequestRow[];
}> {
  await requireProfile();
  const supabase = await createClient();

  const { data: requests, error: requestsError } = await supabase.rpc(
    "get_my_staff_late_order_requests",
  );

  if (requestsError) {
    throw new Error(requestsError.message);
  }

  let eligibleCycles: EligibleLateOrderCycle[] = [];

  try {
    eligibleCycles = await fetchEligibleLateOrderCycles(
      supabase,
      options?.officeLocationId ?? null,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isInactiveLateOrderEligibilityError(message)) {
      eligibleCycles = [];
    } else {
      throw error;
    }
  }

  return {
    eligibleCycles,
    requests: (requests ?? []) as StaffLateOrderRequestRow[],
  };
}

export async function createStaffLateOrderRequestAction(input: {
  providerId: string;
  scheduledDeliveryDate: string;
  requestedSummary: string;
  quantity: number;
  specialInstructions?: string;
  officeLocationId: string;
  saveAsDefault?: boolean;
  savedDefaultOfficeLocationId?: string | null;
}): Promise<
  | { ok: true; requestId: string; defaultSaveWarning?: string }
  | { ok: false; error: string }
> {
  await requireProfile();
  const supabase = await createClient();

  if (!input.officeLocationId) {
    return { ok: false, error: "Delivery location is required" };
  }

  const { data, error } = await supabase.rpc("create_staff_late_order_request", {
    p_provider_id: input.providerId,
    p_scheduled_delivery_date: input.scheduledDeliveryDate,
    p_requested_summary: input.requestedSummary,
    p_quantity: input.quantity,
    p_special_instructions: input.specialInstructions ?? null,
    p_office_location_id: input.officeLocationId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  let defaultSaveWarning: string | undefined;

  if (
    shouldSaveDefaultOnLateOrderSubmit(
      input.saveAsDefault === true,
      input.savedDefaultOfficeLocationId ?? null,
      input.officeLocationId,
    )
  ) {
    const saveResult = await saveMyDefaultOfficeLocation(input.officeLocationId);
    if (!saveResult.ok) {
      defaultSaveWarning = LATE_ORDER_DEFAULT_SAVE_WARNING;
    }
  }

  revalidatePath("/home");
  revalidatePath("/lunch");
  revalidatePath("/account");

  return { ok: true, requestId: String(data), defaultSaveWarning };
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

  revalidatePath("/home");
  revalidatePath("/lunch");

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

  revalidatePath("/home");
  revalidatePath("/lunch");

  return { ok: true };
}

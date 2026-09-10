"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHrAdminOrOwner } from "@/lib/auth";
import {
  isValidProviderOrderEmail,
  parseTimeValue,
  validateAutomaticSupplementSchedule,
  type LateOrderDeadlineDay,
  type ProviderLateOrderSettings,
  type SupplementalDispatchMode,
} from "@/lib/late-orders";
import { getDeliveryDateForOrderDate, getJamaicaTodayDate } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";

function readDeadlineDay(value: FormDataEntryValue | null): LateOrderDeadlineDay | null {
  if (value === "order_day" || value === "delivery_day") {
    return value;
  }

  return null;
}

function readDispatchMode(value: FormDataEntryValue | null): SupplementalDispatchMode {
  return value === "automatic" ? "automatic" : "manual";
}

export async function updateProviderLateOrderSettings(formData: FormData) {
  await requireHrAdminOrOwner();

  const id = formData.get("id");

  if (typeof id !== "string") {
    redirect("/admin/providers?error=invalid");
  }

  const acceptsLateOrders = formData.get("acceptsLateOrders") === "true";
  const settings: ProviderLateOrderSettings = {
    acceptsLateOrders,
    lateOrderDeadlineDay: acceptsLateOrders
      ? readDeadlineDay(formData.get("lateOrderDeadlineDay"))
      : null,
    lateOrderDeadlineTime: acceptsLateOrders
      ? parseTimeValue(String(formData.get("lateOrderDeadlineTime") ?? ""))
      : null,
    supplementalDispatchMode: readDispatchMode(formData.get("supplementalDispatchMode")),
    automaticSupplementSendDay:
      readDispatchMode(formData.get("supplementalDispatchMode")) === "automatic"
        ? readDeadlineDay(formData.get("automaticSupplementSendDay"))
        : null,
    automaticSupplementSendTime:
      readDispatchMode(formData.get("supplementalDispatchMode")) === "automatic"
        ? parseTimeValue(String(formData.get("automaticSupplementSendTime") ?? ""))
        : null,
    primaryOrderEmail: String(formData.get("primaryOrderEmail") ?? "").trim() || null,
  };

  if (acceptsLateOrders && (!settings.lateOrderDeadlineDay || !settings.lateOrderDeadlineTime)) {
    redirect(`/admin/providers/${id}?error=late-settings`);
  }

  if (settings.primaryOrderEmail && !isValidProviderOrderEmail(settings.primaryOrderEmail)) {
    redirect(`/admin/providers/${id}?error=late-email`);
  }

  const orderDate = getJamaicaTodayDate();
  const deliveryDate = getDeliveryDateForOrderDate(orderDate);

  if (deliveryDate) {
    const validationError = validateAutomaticSupplementSchedule(
      settings,
      orderDate,
      deliveryDate,
    );

    if (validationError) {
      redirect(`/admin/providers/${id}?error=late-schedule`);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lunch_providers")
    .update({
      accepts_late_orders: settings.acceptsLateOrders,
      late_order_deadline_day: settings.lateOrderDeadlineDay,
      late_order_deadline_time: settings.lateOrderDeadlineTime,
      supplemental_dispatch_mode: settings.supplementalDispatchMode,
      automatic_supplement_send_day: settings.automaticSupplementSendDay,
      automatic_supplement_send_time: settings.automaticSupplementSendTime,
      primary_order_email: settings.primaryOrderEmail,
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/providers/${id}?error=late-update`);
  }

  revalidatePath(`/admin/providers/${id}`);
  redirect(`/admin/providers/${id}?lateUpdated=1`);
}

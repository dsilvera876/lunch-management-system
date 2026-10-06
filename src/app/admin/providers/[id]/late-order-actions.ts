"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMutateHrOperationalData } from "@/lib/auth";
import {
  parseTimeValue,
  validateAutomaticSupplementSchedule,
  validateDeliveryDayLateOrderCutoff,
  type LateOrderDeadlineDay,
  type ProviderLateOrderSettings,
  type SupplementalDispatchMode,
} from "@/lib/late-orders";
import { getJamaicaTodayDate } from "@/lib/datetime";
import { fetchDeliveryDateForOrderDate } from "@/lib/business-calendar-server";
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
  await requireMutateHrOperationalData();

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
  };

  if (acceptsLateOrders && (!settings.lateOrderDeadlineDay || !settings.lateOrderDeadlineTime)) {
    redirect(`/admin/providers/${id}/edit?error=late-settings`);
  }

  const deliveryDayCutoffError = validateDeliveryDayLateOrderCutoff(settings);
  if (deliveryDayCutoffError) {
    redirect(`/admin/providers/${id}/edit?error=late-cutoff-noon`);
  }

  const orderDate = getJamaicaTodayDate();
  const deliveryDate = await fetchDeliveryDateForOrderDate(orderDate, null);

  if (deliveryDate) {
    const validationError = validateAutomaticSupplementSchedule(
      settings,
      orderDate,
      deliveryDate,
    );

    if (validationError) {
      redirect(`/admin/providers/${id}/edit?error=late-schedule`);
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
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/providers/${id}/edit?error=late-update`);
  }

  revalidatePath(`/admin/providers/${id}`);
  revalidatePath(`/admin/providers/${id}/edit`);
  redirect(`/admin/providers/${id}/edit?lateUpdated=1`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function fulfillOrder(formData: FormData) {
  await requireFulfillOrders();

  const orderId = formData.get("orderId");

  if (typeof orderId !== "string") {
    redirect("/admin/orders?error=invalid");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("fulfill_order", {
    p_order_id: orderId,
  });

  if (error) {
    redirect("/admin/orders?error=fulfill");
  }

  revalidatePath("/admin/orders");

  redirect("/admin/orders?fulfilled=1");
}
import { getDeliveryDisplayLinePairs } from "@/lib/deliveries";
import {
  assertSupplementalEmailPayloadSafe,
  buildSupplementalEmailBody,
  buildSupplementalEmailSubject,
} from "@/lib/late-orders";
import {
  sendTransactionalEmail,
  type SendEmailResult,
} from "@/lib/mail/smtp2go";
import type { OperationalOrder } from "@/lib/operational-orders";
import {
  logOperationalOrdersQueryError,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SupplementDispatchClaim = {
  dispatch_id: string;
  provider_email: string;
  order_ids: string[];
};

type FinalizeRpcName =
  | "finalize_provider_late_order_supplement"
  | "worker_finalize_provider_late_order_supplement";

export type SupplementDispatchExecutionResult =
  | { success: true; dispatchId: string; orderCount: number }
  | { success: false; dispatchId?: string; error: string; attentionRequired?: boolean };

export async function executeSupplementalDispatch(
  supabase: SupabaseClient,
  claim: SupplementDispatchClaim,
  input: {
    providerId: string;
    deliveryDate: string;
    finalizeRpc: FinalizeRpcName;
    dryRun?: boolean;
  },
): Promise<SupplementDispatchExecutionResult> {
  const orderIds = claim.order_ids ?? [];

  if (orderIds.length === 0) {
    await finalizeDispatch(supabase, input.finalizeRpc, {
      dispatchId: claim.dispatch_id,
      success: false,
      errorSummary: "No eligible late orders found.",
    });
    return { success: false, dispatchId: claim.dispatch_id, error: "No eligible late orders found." };
  }

  const { data: provider } = await supabase
    .from("lunch_providers")
    .select("name")
    .eq("id", input.providerId)
    .single();

  const { data: orderRows, error: ordersError } = await supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .in("id", orderIds);

  if (ordersError || !orderRows) {
    if (ordersError) {
      logOperationalOrdersQueryError("late-order-supplement-dispatch", ordersError);
    }
    await finalizeDispatch(supabase, input.finalizeRpc, {
      dispatchId: claim.dispatch_id,
      success: false,
      errorSummary: "Unable to load late orders for email.",
    });
    return {
      success: false,
      dispatchId: claim.dispatch_id,
      error: "Unable to load late orders for email.",
    };
  }

  const orders = orderRows
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is OperationalOrder => order !== null);

  const ordersByOffice = groupOrdersByOffice(orders);
  const emailPayload = {
    providerName: provider?.name ?? "Provider",
    deliveryDate: input.deliveryDate,
    ordersByOffice: ordersByOffice.map((office) => ({
      officeName: office.name,
      orders: office.orders.map((order) => {
        const pairs = getDeliveryDisplayLinePairs(order);
        return {
          employeeName: order.employeeName,
          officeLocationName: order.officeLocationName,
          orderLines: pairs.orderLines,
          quantityLines: pairs.quantityLines,
          specialInstructions: order.specialInstructions,
        };
      }),
    })),
  };

  assertSupplementalEmailPayloadSafe(emailPayload);

  const subject = buildSupplementalEmailSubject({
    providerName: emailPayload.providerName,
    deliveryDate: input.deliveryDate,
  });
  const text = buildSupplementalEmailBody(emailPayload);

  if (input.dryRun) {
    await finalizeDispatch(supabase, input.finalizeRpc, {
      dispatchId: claim.dispatch_id,
      success: false,
      errorSummary: "Dry run — email not sent.",
    });
    return {
      success: false,
      dispatchId: claim.dispatch_id,
      error: "Dry run — email not sent.",
    };
  }

  const sendResult = await sendTransactionalEmail({
    to: claim.provider_email,
    subject,
    text,
  });

  const finalizeResult = await finalizeDispatchFromSendResult(
    supabase,
    input.finalizeRpc,
    claim.dispatch_id,
    sendResult,
  );

  if (finalizeResult.error) {
    return {
      success: false,
      dispatchId: claim.dispatch_id,
      error: finalizeResult.error,
      attentionRequired: finalizeResult.attentionRequired,
    };
  }

  if (!sendResult.success) {
    return {
      success: false,
      dispatchId: claim.dispatch_id,
      error: sendResult.error,
      attentionRequired: sendResult.ambiguous,
    };
  }

  return {
    success: true,
    dispatchId: claim.dispatch_id,
    orderCount: orderIds.length,
  };
}

async function finalizeDispatchFromSendResult(
  supabase: SupabaseClient,
  finalizeRpc: FinalizeRpcName,
  dispatchId: string,
  sendResult: SendEmailResult,
): Promise<{ error?: string; attentionRequired?: boolean }> {
  if (sendResult.success) {
    const { error } = await finalizeDispatch(supabase, finalizeRpc, {
      dispatchId,
      success: true,
      transportMetadata: sendResult.metadata ?? null,
    });
    return error ? { error } : {};
  }

  if (sendResult.ambiguous) {
    const { error } = await finalizeDispatch(supabase, finalizeRpc, {
      dispatchId,
      success: false,
      attentionRequired: true,
      errorSummary: sendResult.error,
    });
    return error ? { error } : { attentionRequired: true };
  }

  const { error } = await finalizeDispatch(supabase, finalizeRpc, {
    dispatchId,
    success: false,
    errorSummary: sendResult.error,
  });
  return error ? { error } : {};
}

async function finalizeDispatch(
  supabase: SupabaseClient,
  finalizeRpc: FinalizeRpcName,
  input: {
    dispatchId: string;
    success: boolean;
    errorSummary?: string | null;
    transportMetadata?: Record<string, unknown> | null;
    attentionRequired?: boolean;
  },
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc(finalizeRpc, {
    p_dispatch_id: input.dispatchId,
    p_success: input.success,
    p_error_summary: input.errorSummary ?? null,
    p_transport_metadata: input.transportMetadata ?? null,
    p_attention_required: input.attentionRequired ?? false,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

function groupOrdersByOffice(orders: OperationalOrder[]): Array<{
  name: string;
  orders: OperationalOrder[];
}> {
  const map = new Map<string, OperationalOrder[]>();

  for (const order of orders) {
    const name = order.officeLocationName || "No delivery location";
    const bucket = map.get(name) ?? [];
    bucket.push(order);
    map.set(name, bucket);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, officeOrders]) => ({ name, orders: officeOrders }));
}

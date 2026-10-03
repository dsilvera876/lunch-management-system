import {
  assertPrimaryOrdersProviderScoped,
  buildPrimaryProviderEmailHtml,
  buildPrimaryProviderEmailPayload,
  buildPrimaryProviderEmailSubject,
  buildPrimaryProviderEmailText,
  parsePrimaryProviderEmailSnapshot,
  serializePrimaryProviderEmailSnapshot,
  type PrimaryProviderEmailPayload,
} from "@/lib/provider-primary-order-email";
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

export type PrimaryDispatchClaim = {
  dispatch_id: string;
  provider_email: string | null;
  provider_name?: string;
  order_ids: string[];
  email_snapshot?: unknown;
};

type FinalizeRpcName =
  | "finalize_provider_primary_order"
  | "worker_finalize_provider_primary_order";

type PersistSnapshotRpcName =
  | "persist_provider_primary_order_email_snapshot"
  | "worker_persist_provider_primary_order_email_snapshot";

export type PrimaryDispatchExecutionResult =
  | { success: true; dispatchId: string; orderCount: number }
  | { success: false; dispatchId?: string; error: string; attentionRequired?: boolean };

export async function executePrimaryProviderDispatch(
  supabase: SupabaseClient,
  claim: PrimaryDispatchClaim,
  input: {
    providerId: string;
    deliveryDate: string;
    finalizeRpc: FinalizeRpcName;
    persistSnapshotRpc: PersistSnapshotRpcName;
    dryRun?: boolean;
  },
): Promise<PrimaryDispatchExecutionResult> {
  const orderIds = claim.order_ids ?? [];

  if (orderIds.length === 0) {
    await finalizeDispatch(supabase, input.finalizeRpc, {
      dispatchId: claim.dispatch_id,
      success: false,
      errorSummary: "No eligible normal orders found.",
    });
    return {
      success: false,
      dispatchId: claim.dispatch_id,
      error: "No eligible normal orders found.",
    };
  }

  const recipient = claim.provider_email?.trim() ?? "";
  if (!recipient) {
    await finalizeDispatch(supabase, input.finalizeRpc, {
      dispatchId: claim.dispatch_id,
      success: false,
      errorSummary: "Provider order email is not configured.",
    });
    return {
      success: false,
      dispatchId: claim.dispatch_id,
      error: "Provider order email is not configured.",
    };
  }

  let emailPayload: PrimaryProviderEmailPayload | null = parsePrimaryProviderEmailSnapshot(
    claim.email_snapshot,
  );

  if (!emailPayload) {
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
        logOperationalOrdersQueryError("provider-primary-order-dispatch", ordersError);
      }
      await finalizeDispatch(supabase, input.finalizeRpc, {
        dispatchId: claim.dispatch_id,
        success: false,
        errorSummary: "Unable to load orders for provider email.",
      });
      return {
        success: false,
        dispatchId: claim.dispatch_id,
        error: "Unable to load orders for provider email.",
      };
    }

    const orders = orderRows
      .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
      .filter((order): order is OperationalOrder => order !== null);

    try {
      assertPrimaryOrdersProviderScoped(orders, input.providerId, input.deliveryDate);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid order scope.";
      await finalizeDispatch(supabase, input.finalizeRpc, {
        dispatchId: claim.dispatch_id,
        success: false,
        errorSummary: message,
      });
      return { success: false, dispatchId: claim.dispatch_id, error: message };
    }

    emailPayload = buildPrimaryProviderEmailPayload(orders, {
      providerId: input.providerId,
      providerName: provider?.name ?? claim.provider_name ?? "Provider",
      deliveryDate: input.deliveryDate,
    });

    if (!emailPayload) {
      await finalizeDispatch(supabase, input.finalizeRpc, {
        dispatchId: claim.dispatch_id,
        success: false,
        errorSummary: "No qualifying order content for provider email.",
      });
      return {
        success: false,
        dispatchId: claim.dispatch_id,
        error: "No qualifying order content for provider email.",
      };
    }

    const { error: persistError } = await supabase.rpc(input.persistSnapshotRpc, {
      p_dispatch_id: claim.dispatch_id,
      p_email_snapshot: serializePrimaryProviderEmailSnapshot(emailPayload),
    });

    if (persistError) {
      await finalizeDispatch(supabase, input.finalizeRpc, {
        dispatchId: claim.dispatch_id,
        success: false,
        errorSummary: "Unable to persist provider email snapshot.",
      });
      return {
        success: false,
        dispatchId: claim.dispatch_id,
        error: persistError.message,
      };
    }
  }

  const subject = buildPrimaryProviderEmailSubject({
    providerName: emailPayload.providerName,
    deliveryDate: input.deliveryDate,
  });
  const text = buildPrimaryProviderEmailText(emailPayload);
  const html = buildPrimaryProviderEmailHtml(emailPayload);

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
    to: recipient,
    subject,
    text,
    html,
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

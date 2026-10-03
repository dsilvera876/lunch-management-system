import { executeSupplementalDispatch } from "@/lib/late-order-supplement-dispatch";
import {
  executePrimaryProviderDispatch,
  type PrimaryDispatchExecutionResult,
} from "@/lib/provider-primary-order-dispatch";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PrimaryDispatchExecutor = (
  supabase: SupabaseClient,
  claim: {
    dispatch_id: string;
    provider_email: string | null;
    order_ids: string[];
    email_snapshot?: unknown;
  },
  input: {
    providerId: string;
    deliveryDate: string;
    finalizeRpc: "finalize_provider_primary_order" | "worker_finalize_provider_primary_order";
    persistSnapshotRpc:
      | "persist_provider_primary_order_email_snapshot"
      | "worker_persist_provider_primary_order_email_snapshot";
    dryRun?: boolean;
  },
) => Promise<PrimaryDispatchExecutionResult>;

export type SupplementDispatchExecutor = typeof executeSupplementalDispatch;

export type AutomaticDispatchExecutors = {
  executePrimary?: PrimaryDispatchExecutor;
  executeSupplement?: SupplementDispatchExecutor;
};

export async function runAutomaticPrimaryDispatch(
  supabase: SupabaseClient,
  dryRun: boolean,
  executePrimary: PrimaryDispatchExecutor = executePrimaryProviderDispatch,
): Promise<number> {
  const { data: primarySwept, error: primarySweepError } = await supabase.rpc(
    "worker_sweep_stale_pending_primary_dispatches",
  );

  if (primarySweepError) {
    console.error(`Stale primary dispatch sweep failed: ${primarySweepError.message}`);
    return 1;
  }

  if ((primarySwept ?? 0) > 0) {
    console.log(`Marked stale pending primary dispatches for review: count=${primarySwept}`);
  }

  const { data: primaryBatches, error: primaryListError } = await supabase.rpc(
    "worker_list_due_automatic_primary_batches",
  );

  if (primaryListError) {
    console.error(`Automatic primary listing failed: ${primaryListError.message}`);
    return 1;
  }

  const batches = (primaryBatches ?? []) as Array<{
    provider_id: string;
    scheduled_delivery_date: string;
    order_date: string;
  }>;

  if (batches.length === 0) {
    console.log("No automatic primary provider orders due");
    return 0;
  }

  let failures = 0;

  for (const batch of batches) {
    if (dryRun) {
      console.log(
        `Dry run: would attempt automatic primary provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date}`,
      );
      continue;
    }

    const { data: claimData, error: claimError } = await supabase.rpc(
      "worker_claim_automatic_provider_primary_order",
      {
        p_provider_id: batch.provider_id,
        p_scheduled_delivery_date: batch.scheduled_delivery_date,
        p_order_date: batch.order_date,
      },
    );

    if (claimError) {
      console.error(
        `Automatic primary claim failed: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date} error=${claimError.message}`,
      );
      failures += 1;
      continue;
    }

    const claimResult = claimData as {
      action: "send" | "no_orders" | "email_missing" | "already_sent";
      dispatch_id?: string;
      provider_email?: string;
      order_ids?: string[];
      email_snapshot?: unknown;
    };

    if (claimResult.action === "already_sent") {
      console.log(
        `Automatic primary skipped — already sent: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date}`,
      );
      continue;
    }

    if (claimResult.action === "no_orders") {
      console.log(
        `Automatic primary processed with no orders: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date}`,
      );
      continue;
    }

    if (claimResult.action === "email_missing") {
      console.log(
        `Automatic primary skipped — provider email missing: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date}`,
      );
      continue;
    }

    const claim = {
      dispatch_id: claimResult.dispatch_id ?? "",
      provider_email: claimResult.provider_email ?? null,
      order_ids: claimResult.order_ids ?? [],
      email_snapshot: claimResult.email_snapshot,
    };

    const result = await executePrimary(supabase, claim, {
      providerId: batch.provider_id,
      deliveryDate: batch.scheduled_delivery_date,
      finalizeRpc: "worker_finalize_provider_primary_order",
      persistSnapshotRpc: "worker_persist_provider_primary_order_email_snapshot",
      dryRun,
    });

    if (result.success) {
      console.log(
        `Automatic primary sent: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date} orders=${result.orderCount}`,
      );
      continue;
    }

    failures += 1;

    if (result.attentionRequired) {
      console.error(
        `Automatic primary requires review: provider=${batch.provider_id} dispatch=${result.dispatchId ?? "unknown"}`,
      );
    } else {
      console.error(
        `Automatic primary failed: provider=${batch.provider_id} dispatch=${result.dispatchId ?? "unknown"} error=${result.error}`,
      );
    }
  }

  return failures;
}

export async function runAutomaticDispatch(
  supabase: SupabaseClient,
  dryRun: boolean,
  executors: AutomaticDispatchExecutors = {},
): Promise<number> {
  const executePrimary = executors.executePrimary ?? executePrimaryProviderDispatch;
  const executeSupplement = executors.executeSupplement ?? executeSupplementalDispatch;

  let totalFailures = 0;

  const { data: sweptCount, error: sweepError } = await supabase.rpc(
    "worker_sweep_stale_pending_dispatches",
  );

  if (sweepError) {
    console.error(`Stale dispatch sweep failed: ${sweepError.message}`);
    return Math.max(totalFailures, 1);
  }

  if ((sweptCount ?? 0) > 0) {
    console.log(`Marked stale pending dispatches for review: count=${sweptCount}`);
  }

  totalFailures += await runAutomaticPrimaryDispatch(supabase, dryRun, executePrimary);

  const { data: dueBatches, error: listError } = await supabase.rpc(
    "worker_list_due_automatic_supplement_batches",
  );

  if (listError) {
    console.error(`Automatic supplement listing failed: ${listError.message}`);
    return totalFailures > 0 ? totalFailures : 1;
  }

  const batches = (dueBatches ?? []) as Array<{
    provider_id: string;
    scheduled_delivery_date: string;
  }>;

  if (batches.length === 0) {
    console.log("No automatic supplements due");
    return totalFailures;
  }

  let failures = 0;

  for (const batch of batches) {
    const { data: claimData, error: claimError } = await supabase.rpc(
      "worker_claim_automatic_provider_late_order_supplement",
      {
        p_provider_id: batch.provider_id,
        p_scheduled_delivery_date: batch.scheduled_delivery_date,
      },
    );

    if (claimError) {
      console.error(
        `Automatic supplement claim failed: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date} error=${claimError.message}`,
      );
      failures += 1;
      continue;
    }

    const claimResult = claimData as {
      action: "send" | "no_orders";
      dispatch_id?: string;
      provider_email?: string;
      order_ids?: string[];
    };

    if (claimResult.action === "no_orders") {
      console.log(
        `Automatic supplement processed with no orders: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date}`,
      );
      continue;
    }

    const claim = {
      dispatch_id: claimResult.dispatch_id ?? "",
      provider_email: claimResult.provider_email ?? "",
      order_ids: claimResult.order_ids ?? [],
    };

    const result = await executeSupplement(supabase, claim, {
      providerId: batch.provider_id,
      deliveryDate: batch.scheduled_delivery_date,
      finalizeRpc: "worker_finalize_provider_late_order_supplement",
      dryRun,
    });

    if (result.success) {
      console.log(
        `Automatic supplement sent: provider=${batch.provider_id} delivery_date=${batch.scheduled_delivery_date} orders=${result.orderCount}`,
      );
      continue;
    }

    failures += 1;

    if (result.attentionRequired) {
      console.error(
        `Automatic supplement requires review: provider=${batch.provider_id} dispatch=${result.dispatchId ?? "unknown"}`,
      );
    } else {
      console.error(
        `Automatic supplement failed: provider=${batch.provider_id} dispatch=${result.dispatchId ?? "unknown"} error=${result.error}`,
      );
    }
  }

  totalFailures += failures;

  return totalFailures;
}

/** Maps aggregate automatic-dispatch failures to a non-zero Node exit code. */
export function applyAutomaticDispatchExitCode(failures: number): number {
  if (failures > 0) {
    process.exitCode = 1;
  }
  return failures;
}

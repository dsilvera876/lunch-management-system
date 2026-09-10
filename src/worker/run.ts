import { createServiceClient } from "@/lib/supabase/service";
import { executeSupplementalDispatch } from "@/lib/late-order-supplement-dispatch";

type WorkerTask = "snapshots" | "automatic-dispatch" | "all";

type WorkerOptions = {
  task: WorkerTask;
  dryRun: boolean;
};

function parseArgs(argv: string[]): WorkerOptions {
  let task: WorkerTask = "all";

  for (const arg of argv) {
    if (arg === "--dry-run") {
      continue;
    }

    if (arg.startsWith("--task=")) {
      const value = arg.slice("--task=".length) as WorkerTask;
      if (value === "snapshots" || value === "automatic-dispatch" || value === "all") {
        task = value;
      } else {
        throw new Error(`Unknown worker task: ${value}`);
      }
    }
  }

  return {
    task,
    dryRun: argv.includes("--dry-run"),
  };
}

async function runSnapshotMaterialization(
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    console.log("Dry run: snapshot materialization skipped");
    return 0;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("worker_materialize_current_order_snapshots");

  if (error) {
    console.error(`Snapshot materialization failed: ${error.message}`);
    process.exitCode = 1;
    return 1;
  }

  const result = data as {
    order_date?: string;
    materialized?: number;
    failures?: Array<{ provider_id: string; provider_name: string; error: string }>;
    skipped?: string;
  };

  if (result.skipped === "weekend") {
    console.log(`Snapshot materialization skipped: weekend (${result.order_date ?? "unknown"})`);
    return 0;
  }

  const failures = result.failures ?? [];

  console.log(
    `Snapshot materialization complete: order_date=${result.order_date ?? "unknown"} providers=${result.materialized ?? 0}`,
  );

  for (const failure of failures) {
    console.error(
      `Snapshot materialization failed: provider=${failure.provider_id} name=${failure.provider_name} error=${failure.error}`,
    );
    process.exitCode = 1;
  }

  return failures.length;
}

async function runAutomaticDispatch(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();

  const { data: sweptCount, error: sweepError } = await supabase.rpc(
    "worker_sweep_stale_pending_dispatches",
  );

  if (sweepError) {
    console.error(`Stale dispatch sweep failed: ${sweepError.message}`);
    process.exitCode = 1;
    return 1;
  }

  if ((sweptCount ?? 0) > 0) {
    console.log(`Marked stale pending dispatches for review: count=${sweptCount}`);
  }

  const { data: dueBatches, error: listError } = await supabase.rpc(
    "worker_list_due_automatic_supplement_batches",
  );

  if (listError) {
    console.error(`Automatic supplement listing failed: ${listError.message}`);
    process.exitCode = 1;
    return 1;
  }

  const batches = (dueBatches ?? []) as Array<{
    provider_id: string;
    scheduled_delivery_date: string;
  }>;

  if (batches.length === 0) {
    console.log("No automatic supplements due");
    return 0;
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

    const result = await executeSupplementalDispatch(supabase, claim, {
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

  if (failures > 0) {
    process.exitCode = 1;
  }

  return failures;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.task === "snapshots" || options.task === "all") {
    await runSnapshotMaterialization(options.dryRun);
  }

  if (options.task === "automatic-dispatch" || options.task === "all") {
    await runAutomaticDispatch(options.dryRun);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown worker failure";
  console.error(`Worker failed: ${message}`);
  process.exitCode = 1;
});

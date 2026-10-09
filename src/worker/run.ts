import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/env/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  applyAutomaticDispatchExitCode,
  runAutomaticDispatch,
} from "@/worker/automatic-dispatch";
import { processEmailDeliveryQueue } from "@/lib/mail/process-email-delivery-queue";
import {
  formatTodayMenuWorkerLogLine,
  processTodayMenuNotifications,
} from "@/lib/process-today-menu-notifications";
import {
  formatDeadlineReminderWorkerLogLine,
  processDeadlineReminderNotifications,
} from "@/lib/process-deadline-reminder-notifications";
import { processAdminEmailDeliveryFailureNotifications } from "@/lib/process-admin-email-delivery-failure-notifications";
import { processHrEmailDeliveryFailureNotifications } from "@/lib/process-hr-email-delivery-failure-notifications";
import { processHrPendingSignupNotifications } from "@/lib/process-hr-pending-signup-notifications";
import { processStaffOrderNotifications } from "@/lib/process-staff-order-notifications";
import { processStaffLunchPeriodFinalizedNotifications } from "@/lib/process-staff-lunch-period-finalized-notifications";
import { processHrLateOrderSubmittedNotifications } from "@/lib/process-hr-late-order-submitted-notifications";
import { processStaffLateOrderRequestStatusNotifications } from "@/lib/process-staff-late-order-request-status-notifications";
import { processAuthUserDeletionCleanup } from "@/lib/process-auth-user-deletion-cleanup";
import { drainUserImportWork } from "@/lib/process-user-import-batch";

type WorkerTask =
  | "snapshots"
  | "automatic-dispatch"
  | "mail-queue"
  | "today-menu-notifications"
  | "deadline-reminder-notifications"
  | "hr-pending-signup-notifications"
  | "admin-email-delivery-failure-notifications"
  | "hr-email-delivery-failure-notifications"
  | "staff-order-notifications"
  | "staff-late-order-request-notifications"
  | "staff-late-order-request-expiry"
  | "staff-lunch-period-finalized-notifications"
  | "auth-deletion-cleanup"
  | "operational-attention-purge"
  | "user-import"
  | "all";

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
      if (
        value === "snapshots" ||
        value === "automatic-dispatch" ||
        value === "mail-queue" ||
        value === "today-menu-notifications" ||
        value === "deadline-reminder-notifications" ||
        value === "hr-pending-signup-notifications" ||
        value === "admin-email-delivery-failure-notifications" ||
        value === "hr-email-delivery-failure-notifications" ||
        value === "staff-order-notifications" ||
        value === "staff-late-order-request-notifications" ||
        value === "staff-late-order-request-expiry" ||
        value === "staff-lunch-period-finalized-notifications" ||
        value === "auth-deletion-cleanup" ||
        value === "operational-attention-purge" ||
        value === "user-import" ||
        value === "all"
      ) {
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

function assertWorkerEnvironment(): void {
  getSupabaseUrl();
  getSupabaseSecretKey();
}

async function runTodayMenuNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processTodayMenuNotifications(supabase, { dryRun });

  console.log(formatTodayMenuWorkerLogLine(result.diagnostics, result));

  return result.failures;
}

async function runDeadlineReminderNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processDeadlineReminderNotifications(supabase, { dryRun });

  console.log(formatDeadlineReminderWorkerLogLine(result.diagnostics, result));

  return result.failures;
}

async function runHrPendingSignupNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processHrPendingSignupNotifications(supabase, { dryRun });

  console.log(
    `HR pending signup notifications: queued=${result.queued} render_skipped=${result.skipped} render_failures=${result.renderFailures} queue_failures=${result.failures}`,
  );

  return result.failures;
}

async function runAdminEmailDeliveryFailureNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processAdminEmailDeliveryFailureNotifications(supabase, { dryRun });

  console.log(
    `Admin email delivery failure notifications: queued=${result.queued} render_skipped=${result.skipped} render_failures=${result.renderFailures} queue_failures=${result.failures}`,
  );

  return result.failures;
}

async function runHrEmailDeliveryFailureNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processHrEmailDeliveryFailureNotifications(supabase, { dryRun });

  console.log(
    `HR email delivery failure notifications: queued=${result.queued} render_skipped=${result.skipped} render_failures=${result.renderFailures} queue_failures=${result.failures}`,
  );

  return result.failures;
}

async function runStaffOrderNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processStaffOrderNotifications(supabase, { dryRun });

  console.log(
    `Staff order notifications: queued=${result.queued} render_skipped=${result.skipped} render_failures=${result.renderFailures} queue_failures=${result.failures}`,
  );

  return result.failures;
}

async function runStaffLateOrderRequestExpiry(dryRun: boolean): Promise<number> {
  if (dryRun) {
    console.log("Dry run: staff late order request expiry skipped");
    return 0;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("worker_expire_pending_staff_late_order_requests");

  if (error) {
    throw new Error(`Staff late order request expiry failed: ${error.message}`);
  }

  const expired = Number(data ?? 0);
  console.log(`Staff late order request expiry: expired=${expired}`);
  return 0;
}

async function runStaffLateOrderRequestNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const hrResult = await processHrLateOrderSubmittedNotifications(supabase, { dryRun });
  const staffResult = await processStaffLateOrderRequestStatusNotifications(supabase, { dryRun });

  console.log(
    `Staff late order request notifications: hr_queued=${hrResult.queued} staff_queued=${staffResult.queued} failures=${hrResult.failures + staffResult.failures}`,
  );

  return hrResult.failures + staffResult.failures;
}

async function runStaffLunchPeriodFinalizedNotifications(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processStaffLunchPeriodFinalizedNotifications(supabase, { dryRun });

  console.log(
    `Staff lunch period finalized notifications: queued=${result.queued} render_skipped=${result.skipped} render_failures=${result.renderFailures} queue_failures=${result.failures}`,
  );

  return result.failures;
}

async function runMailQueue(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  let result: Awaited<ReturnType<typeof processEmailDeliveryQueue>> | null = null;
  let stageError: unknown = null;

  try {
    result = await processEmailDeliveryQueue(supabase, { batchSize: 25, dryRun });
    return result.failed;
  } catch (error) {
    stageError = error;
    throw error;
  } finally {
    if (result) {
      console.log(
        `Email queue processed: claimed=${result.claimed} sent=${result.sent} retried=${result.retried} failed=${result.failed}`,
      );
    } else if (stageError) {
      console.error(
        `Email queue processed: aborted before completion (${stageError instanceof Error ? stageError.message : stageError})`,
      );
    } else {
      console.log("Email queue processed: claimed=0 sent=0 retried=0 failed=0");
    }
  }
}

async function runOperationalAttentionPurge(dryRun: boolean): Promise<number> {
  if (dryRun) {
    console.log("Dry run: operational attention purge skipped");
    return 0;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("worker_purge_expired_operational_attention_items");

  if (error) {
    throw new Error(`Operational attention purge failed: ${error.message}`);
  }

  const deleted = Number(data ?? 0);
  console.log(`Operational attention purge: deleted=${deleted}`);
  return 0;
}

async function runAuthDeletionCleanup(dryRun: boolean): Promise<number> {
  const supabase = createServiceClient();
  const result = await processAuthUserDeletionCleanup(supabase, { batchSize: 10, dryRun });

  console.log(
    `Auth deletion cleanup: claimed=${result.claimed} succeeded=${result.succeeded} retried=${result.retried} terminal_failed=${result.terminalFailed}`,
  );

  return result.terminalFailed;
}

async function runUserImport(dryRun: boolean): Promise<number> {
  if (dryRun) {
    console.log("Dry run: user import skipped");
    return 0;
  }

  const supabase = createServiceClient();
  const result = await drainUserImportWork(supabase, {
    logPass: (pass, claimed) => {
      console.log(`[bulk-user-import] pass=${pass} claimed=${claimed}`);
    },
  });

  console.log(
    [
      "User import:",
      `claims=${result.claimPasses}`,
      `claimed=${result.claimed}`,
      `succeeded=${result.succeeded}`,
      `skipped=${result.skipped}`,
      `failed=${result.failed}`,
      `elapsed_ms=${result.elapsedMs}`,
    ].join("\n"),
  );

  return result.failed;
}

async function main(): Promise<void> {
  assertWorkerEnvironment();
  const options = parseArgs(process.argv.slice(2));

  if (options.task === "snapshots" || options.task === "all") {
    await runSnapshotMaterialization(options.dryRun);
  }

  if (options.task === "automatic-dispatch" || options.task === "all") {
    const supabase = createServiceClient();
    const failures = await runAutomaticDispatch(supabase, options.dryRun);
    applyAutomaticDispatchExitCode(failures);
  }

  if (options.task === "today-menu-notifications" || options.task === "all") {
    const failures = await runTodayMenuNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "deadline-reminder-notifications" || options.task === "all") {
    const failures = await runDeadlineReminderNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "hr-pending-signup-notifications" || options.task === "all") {
    const failures = await runHrPendingSignupNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "admin-email-delivery-failure-notifications" || options.task === "all") {
    const failures = await runAdminEmailDeliveryFailureNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "hr-email-delivery-failure-notifications" || options.task === "all") {
    const failures = await runHrEmailDeliveryFailureNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "staff-order-notifications" || options.task === "all") {
    const failures = await runStaffOrderNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "staff-late-order-request-expiry" || options.task === "all") {
    try {
      await runStaffLateOrderRequestExpiry(options.dryRun);
    } catch (error) {
      console.error(
        `Staff late order request expiry worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }
  }

  if (
    options.task === "staff-late-order-request-notifications" ||
    options.task === "all"
  ) {
    const failures = await runStaffLateOrderRequestNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (
    options.task === "staff-lunch-period-finalized-notifications" ||
    options.task === "all"
  ) {
    const failures = await runStaffLunchPeriodFinalizedNotifications(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "mail-queue") {
    try {
      const deadlineFailures = await runDeadlineReminderNotifications(options.dryRun);
      if (deadlineFailures > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `Deadline reminder notifications worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }

    try {
      const hrSignupFailures = await runHrPendingSignupNotifications(options.dryRun);
      if (hrSignupFailures > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `HR pending signup notifications worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }

    try {
      const adminFailureAlerts = await runAdminEmailDeliveryFailureNotifications(options.dryRun);
      if (adminFailureAlerts > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `Admin email delivery failure notifications worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }

    try {
      const hrFailureAlerts = await runHrEmailDeliveryFailureNotifications(options.dryRun);
      if (hrFailureAlerts > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `HR email delivery failure notifications worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }

    try {
      const staffPeriodFailures = await runStaffLunchPeriodFinalizedNotifications(
        options.dryRun,
      );
      if (staffPeriodFailures > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `Staff lunch period finalized notifications worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }

    try {
      const staffFailures = await runStaffOrderNotifications(options.dryRun);
      if (staffFailures > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `Staff order notifications worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }

    try {
      const mailFailures = await runMailQueue(options.dryRun);
      if (mailFailures > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `Email queue worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }
  } else if (options.task === "all") {
    const failures = await runMailQueue(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "operational-attention-purge" || options.task === "all") {
    try {
      await runOperationalAttentionPurge(options.dryRun);
    } catch (error) {
      console.error(
        `Operational attention purge worker aborted: ${error instanceof Error ? error.message : error}`,
      );
      process.exitCode = 1;
    }
  }

  if (options.task === "auth-deletion-cleanup" || options.task === "all") {
    const failures = await runAuthDeletionCleanup(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }

  if (options.task === "user-import" || options.task === "all") {
    const failures = await runUserImport(options.dryRun);
    if (failures > 0) {
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown worker failure";
  console.error(`Worker failed: ${message}`);
  process.exitCode = 1;
});

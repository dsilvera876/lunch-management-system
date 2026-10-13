import { processAdminEmailDeliveryFailureNotifications } from "@/lib/process-admin-email-delivery-failure-notifications";
import { processDeadlineReminderNotifications } from "@/lib/process-deadline-reminder-notifications";
import { processHrEmailDeliveryFailureNotifications } from "@/lib/process-hr-email-delivery-failure-notifications";
import { processHrLateOrderSubmittedNotifications } from "@/lib/process-hr-late-order-submitted-notifications";
import { processHrPendingSignupNotifications } from "@/lib/process-hr-pending-signup-notifications";
import { processStaffLateOrderRequestStatusNotifications } from "@/lib/process-staff-late-order-request-status-notifications";
import { processStaffLunchPeriodFinalizedNotifications } from "@/lib/process-staff-lunch-period-finalized-notifications";
import { processStaffOrderNotifications } from "@/lib/process-staff-order-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MailQueueNotificationStageResult = {
  stage: string;
  failures: number;
  aborted: boolean;
};

export type MailQueueNotificationPipelineResult = {
  stages: MailQueueNotificationStageResult[];
  totalFailures: number;
};

type StageRunner = () => Promise<number>;

async function runNotificationStage(
  stage: string,
  runner: StageRunner,
): Promise<MailQueueNotificationStageResult> {
  try {
    const failures = await runner();
    return { stage, failures, aborted: false };
  } catch (error) {
    console.error(
      `${stage} worker aborted: ${error instanceof Error ? error.message : error}`,
    );
    return { stage, failures: 1, aborted: true };
  }
}

/**
 * Runs mail-timer notification processors sequentially. A failure in one stage does not
 * prevent later stages (including staff late-order status and SMTP drain) from running.
 */
export async function runMailQueueNotificationProcessors(
  supabase: SupabaseClient,
  dryRun: boolean,
): Promise<MailQueueNotificationPipelineResult> {
  const stages: MailQueueNotificationStageResult[] = [];

  stages.push(
    await runNotificationStage("Deadline reminder notifications", () =>
      processDeadlineReminderNotifications(supabase, { dryRun }).then((r) => r.failures),
    ),
  );

  stages.push(
    await runNotificationStage("HR pending signup notifications", () =>
      processHrPendingSignupNotifications(supabase, { dryRun }).then((r) => r.failures),
    ),
  );

  stages.push(
    await runNotificationStage("Admin email delivery failure notifications", () =>
      processAdminEmailDeliveryFailureNotifications(supabase, { dryRun }).then(
        (r) => r.failures,
      ),
    ),
  );

  stages.push(
    await runNotificationStage("HR email delivery failure notifications", () =>
      processHrEmailDeliveryFailureNotifications(supabase, { dryRun }).then((r) => r.failures),
    ),
  );

  stages.push(
    await runNotificationStage("Staff lunch period finalized notifications", () =>
      processStaffLunchPeriodFinalizedNotifications(supabase, { dryRun }).then(
        (r) => r.failures,
      ),
    ),
  );

  stages.push(
    await runNotificationStage("Staff order notifications", () =>
      processStaffOrderNotifications(supabase, { dryRun }).then((r) => r.failures),
    ),
  );

  stages.push(
    await runNotificationStage("HR late order submitted notifications", () =>
      processHrLateOrderSubmittedNotifications(supabase, { dryRun }).then((r) => {
        console.log(
          `HR late order submitted notifications: queued=${r.queued} failures=${r.failures}`,
        );
        return r.failures;
      }),
    ),
  );

  stages.push(
    await runNotificationStage("Staff late order request status notifications", () =>
      processStaffLateOrderRequestStatusNotifications(supabase, { dryRun }).then((r) => {
        console.log(
          `Staff late order request status notifications: queued=${r.queued} failures=${r.failures}`,
        );
        return r.failures;
      }),
    ),
  );

  const totalFailures = stages.reduce((sum, stage) => sum + stage.failures, 0);
  return { stages, totalFailures };
}

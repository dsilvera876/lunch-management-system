import { runLocalDbExec } from "./e2e-local-db";

/** Development seed profile ids (see supabase/seeds/development.sql). */
export const E2E_SEED_PROFILES = {
  owner: "10000001-0001-4001-8001-000000000001",
  hr: "10000002-0002-4002-8002-000000000002",
  accounts: "10000003-0003-4003-8003-000000000003",
  staff1: "10000004-0004-4004-8004-000000000004",
} as const;

export const E2E_OA_SIGNUP_REQUEST_IDS = {
  hrUnreadOne: "00000001-e2e0-4001-8001-000000000001",
  hrUnreadTwo: "00000002-e2e0-4002-8002-000000000002",
} as const;

export const E2E_OA_QUEUE_ID = "00000003-e2e0-4003-8003-000000000003";

const IDEMPOTENCY_PREFIX = "e2e:oa:";

/** Local Supabase only — inserts traceable operational attention rows for bell E2E. */
export function seedE2eOperationalAttentionFixture(): void {
  runLocalDbExec(`
    do $$
    begin
      delete from private.operational_attention_items
      where idempotency_key like '${IDEMPOTENCY_PREFIX}%';

      delete from private.signup_requests
      where id in (
        '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadOne}',
        '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadTwo}'
      );

      insert into private.signup_requests (
        id, email, normalized_email, full_name, status
      ) values
        (
          '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadOne}',
          'e2e-oa-one@example.test',
          'e2e-oa-one@example.test',
          'E2E OA One',
          'pending'
        ),
        (
          '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadTwo}',
          'e2e-oa-two@example.test',
          'e2e-oa-two@example.test',
          'E2E OA Two',
          'pending'
        );

      perform private.create_operational_attention_item(
        '${E2E_SEED_PROFILES.hr}'::uuid,
        'hr.pending_signup_approval',
        'Pending user approval',
        'E2E operational notification one.',
        '/admin/users?view=approvals',
        '${IDEMPOTENCY_PREFIX}hr-signup-one:${E2E_SEED_PROFILES.hr}',
        p_signup_request_id => '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadOne}'::uuid
      );

      perform private.create_operational_attention_item(
        '${E2E_SEED_PROFILES.hr}'::uuid,
        'hr.pending_signup_approval',
        'Pending user approval',
        'E2E operational notification two.',
        '/admin/users?view=approvals',
        '${IDEMPOTENCY_PREFIX}hr-signup-two:${E2E_SEED_PROFILES.hr}',
        p_signup_request_id => '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadTwo}'::uuid
      );

      delete from private.email_delivery_queue
      where id = '${E2E_OA_QUEUE_ID}'::uuid;

      insert into private.email_delivery_queue (
        id, message_type, recipient_email, subject, text_body, html_body,
        status, attempts, available_at, last_error
      ) values (
        '${E2E_OA_QUEUE_ID}',
        'auth_hook',
        'e2e-admin-fail@example.test',
        'E2E',
        't',
        '<p>t</p>',
        'failed',
        5,
        now(),
        'E2E terminal failure'
      );

      perform private.create_operational_attention_item(
        '${E2E_SEED_PROFILES.owner}'::uuid,
        'admin.email_delivery_failure',
        'Email delivery failure',
        'E2E admin operational notification.',
        '/admin/settings/email/delivery/history',
        '${IDEMPOTENCY_PREFIX}admin-queue:${E2E_SEED_PROFILES.owner}',
        p_failed_email_queue_id => '${E2E_OA_QUEUE_ID}'::uuid
      );
    end;
    $$;
  `);
}

export function cleanupE2eOperationalAttentionFixture(): void {
  runLocalDbExec(`
    do $$
    begin
      delete from private.operational_attention_items
      where idempotency_key like '${IDEMPOTENCY_PREFIX}%';

      delete from private.signup_requests
      where id in (
        '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadOne}',
        '${E2E_OA_SIGNUP_REQUEST_IDS.hrUnreadTwo}'
      );

      delete from private.email_delivery_queue
      where id = '${E2E_OA_QUEUE_ID}'::uuid;
    end;
    $$;
  `);
}

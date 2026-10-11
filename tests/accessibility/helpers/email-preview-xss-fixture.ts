import { runLocalDbExec } from "./e2e-local-db";

export const E2E_EMAIL_PREVIEW_BATCH_ID = "00000001-e2e5-4001-8001-0000000000a1";
const E2E_EMAIL_PREVIEW_DELIVERY_ID = "00000002-e2e5-4002-8002-0000000000a2";
const E2E_EMAIL_PREVIEW_IDEMPOTENCY_KEY = "e2e:email-preview-xss";

export const LEGITIMATE_EMAIL_TEXT = "Your lunch order is confirmed.";
export const LEGITIMATE_EMAIL_ITEM = "Jerk Chicken";

/**
 * Stored email HTML that would execute script, fire event handlers, submit
 * forms, open popups, or navigate the parent if rendered unsandboxed.
 * Attribute values are unquoted because the local DB helper shells out via cmd.exe.
 */
export const STORED_XSS_EMAIL_HTML = [
  `<p id=legit>Hello <strong>Alex</strong>. ${LEGITIMATE_EMAIL_TEXT}</p>`,
  `<ul><li>${LEGITIMATE_EMAIL_ITEM}</li></ul>`,
  "<script>document.body.dataset.xssScript=1;parent.__emailXss=1;top.location.hash=1</script>",
  "<img id=xss-img src=x onerror=this.dataset.xssImg=1;parent.__emailXss=1>",
  "<svg id=xss-svg onload=document.body.dataset.xssSvg=1;parent.__emailXss=1></svg>",
  "<meta http-equiv=refresh content=0;url=/auth/signout>",
  "<a id=xss-top href=/admin/settings target=_top>Open admin</a>",
  "<a id=xss-js href=javascript:parent.__emailXss=1>Run</a>",
  "<a id=xss-popup href=https://example.com/ target=_blank>Popup</a>",
  "<form action=/auth/signout method=post target=_top><button id=xss-form type=submit>Sign out</button></form>",
].join("");

/** Local Supabase only — stores a delivery snapshot containing malicious HTML. */
export function seedE2eEmailPreviewXssFixture(): void {
  const html = STORED_XSS_EMAIL_HTML.replaceAll("'", "''");
  runLocalDbExec(`
    do $$
    begin
      delete from private.notification_delivery_log
      where idempotency_key = '${E2E_EMAIL_PREVIEW_IDEMPOTENCY_KEY}';
      delete from private.notification_delivery_batch
      where id = '${E2E_EMAIL_PREVIEW_BATCH_ID}'::uuid;

      insert into private.notification_delivery_batch (id, event_key, operational_date)
      values ('${E2E_EMAIL_PREVIEW_BATCH_ID}', 'staff.order_submitted', current_date);

      insert into private.notification_delivery_log (
        id, event_key, idempotency_key, operational_date, batch_id, status,
        recipient_email, recipient_name,
        rendered_subject, rendered_text_body, rendered_html_body
      ) values (
        '${E2E_EMAIL_PREVIEW_DELIVERY_ID}',
        'staff.order_submitted',
        '${E2E_EMAIL_PREVIEW_IDEMPOTENCY_KEY}',
        current_date,
        '${E2E_EMAIL_PREVIEW_BATCH_ID}',
        'sent',
        'e2e-email-preview@example.test',
        '<img src=x onerror=parent.__emailXss=1>',
        'E2E stored XSS preview',
        'Hello Alex. ${LEGITIMATE_EMAIL_TEXT}',
        '${html}'
      );
    end;
    $$;
  `);
}

export function cleanupE2eEmailPreviewXssFixture(): void {
  runLocalDbExec(`
    do $$
    begin
      delete from private.notification_delivery_log
      where idempotency_key = '${E2E_EMAIL_PREVIEW_IDEMPOTENCY_KEY}';
      delete from private.notification_delivery_batch
      where id = '${E2E_EMAIL_PREVIEW_BATCH_ID}'::uuid;
    end;
    $$;
  `);
}

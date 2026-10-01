"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  saveNotificationTemplateAction,
  sendNotificationTemplateTestEmailAction,
} from "@/app/admin/settings/email/actions";
import { Card } from "@/components/ui/card";
import { Button, linkButtonClass } from "@/components/ui/button";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { EMAIL_TEMPLATES_PATH } from "@/lib/notification-presentation";
import {
  renderNotificationTemplate,
  TODAY_MENU_SAMPLE_VARIABLES,
} from "@/lib/notification-template";

type Props = {
  eventKey: string;
  displayName: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate: string | null;
  allowedVariables: string[];
};

export function NotificationTemplateEditor({
  eventKey,
  displayName,
  subjectTemplate,
  bodyHtmlTemplate,
  bodyTextTemplate,
  allowedVariables,
}: Props) {
  const [subject, setSubject] = useState(subjectTemplate);
  const [bodyHtml, setBodyHtml] = useState(bodyHtmlTemplate);
  const [bodyText, setBodyText] = useState(bodyTextTemplate ?? "");
  const [testEmail, setTestEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const previewSubject = useMemo(
    () => renderNotificationTemplate(subject, TODAY_MENU_SAMPLE_VARIABLES),
    [subject],
  );

  const previewHtml = useMemo(
    () => renderNotificationTemplate(bodyHtml, TODAY_MENU_SAMPLE_VARIABLES),
    [bodyHtml],
  );

  function saveTemplate() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await saveNotificationTemplateAction({
        eventKey,
        subjectTemplate: subject,
        bodyHtmlTemplate: bodyHtml,
        bodyTextTemplate: bodyText,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Template saved.");
    });
  }

  function sendTest() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await sendNotificationTemplateTestEmailAction({
        eventKey,
        recipientEmail: testEmail,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage("Test email sent.");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <Card padding="md" className="shadow-sm space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Event</p>
          <p className="font-semibold text-foreground">{displayName}</p>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="subjectTemplate">
            Subject
          </label>
          <input
            id="subjectTemplate"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="bodyHtmlTemplate">
            Body (HTML)
          </label>
          <textarea
            id="bodyHtmlTemplate"
            rows={12}
            value={bodyHtml}
            onChange={(event) => setBodyHtml(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="bodyTextTemplate">
            Body (plain text, optional)
          </label>
          <textarea
            id="bodyTextTemplate"
            rows={6}
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
        </div>

        {error ? <FormActionStatus variant="error">{error}</FormActionStatus> : null}
        {message ? <FormActionStatus variant="success">{message}</FormActionStatus> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" onClick={saveTemplate}>
            Save template
          </Button>
          <Link href={EMAIL_TEMPLATES_PATH} className={linkButtonClass("ghost")}>
            Back to templates
          </Link>
        </div>
      </Card>

      <div className="space-y-4">
        <Card padding="md" className="shadow-sm">
          <h3 className="text-sm font-semibold">Available variables</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {allowedVariables.length === 0 ? (
              <li>No variables for this event.</li>
            ) : (
              allowedVariables.map((variable) => (
                <li key={variable}>
                  <code>{`{{${variable}}}`}</code>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card padding="md" className="shadow-sm">
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="mt-2 text-sm font-medium">{previewSubject}</p>
          <div
            className="prose prose-sm mt-3 max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </Card>

        <Card padding="md" className="shadow-sm space-y-3">
          <h3 className="text-sm font-semibold">Send test email</h3>
          <input
            type="email"
            placeholder="recipient@example.com"
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          <Button type="button" variant="secondary" onClick={sendTest} disabled={!testEmail.trim()}>
            Send Test Email
          </Button>
        </Card>
      </div>
    </div>
  );
}

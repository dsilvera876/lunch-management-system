"use client";

import { useState, useTransition } from "react";

import {
  saveEmailDeliverySettings,
  sendEmailDeliveryTest,
  type EmailDeliverySettingsView,
} from "@/app/admin/settings/auth-settings-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActionStatus } from "@/components/ui/form-action-status";
import { FormField, inputClassName } from "@/components/ui/form-field";

type Props = {
  settings: EmailDeliverySettingsView;
};

export function EmailDeliverySettingsForm({ settings }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <Card padding="md" className="shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Email delivery</h2>
        <p className="mt-1 text-sm text-muted">
          Provider-neutral SMTP settings used for authentication emails, invitations, password
          recovery, and application mail.
        </p>

        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setMessage(null);
            setError(null);
            startTransition(async () => {
              const result = await saveEmailDeliverySettings({
                providerName: String(formData.get("providerName") ?? ""),
                smtpHost: String(formData.get("smtpHost") ?? ""),
                smtpPort: Number(formData.get("smtpPort") ?? 587),
                smtpSecurity: String(formData.get("smtpSecurity") ?? "starttls") as
                  | "tls"
                  | "starttls"
                  | "none",
                smtpUsername: String(formData.get("smtpUsername") ?? ""),
                smtpPassword: String(formData.get("smtpPassword") ?? ""),
                fromEmail: String(formData.get("fromEmail") ?? ""),
                fromName: String(formData.get("fromName") ?? ""),
                replyToEmail: String(formData.get("replyToEmail") ?? ""),
                enabled: formData.get("enabled") === "on",
              });

              if (result.success) {
                setMessage("Email delivery settings saved.");
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <FormField label="Provider type" htmlFor="providerType">
            <input id="providerType" value="SMTP" readOnly className={inputClassName} />
          </FormField>
          <FormField label="Provider name" htmlFor="providerName">
            <input
              id="providerName"
              name="providerName"
              defaultValue={settings.provider_name}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <FormField label="SMTP host" htmlFor="smtpHost">
            <input
              id="smtpHost"
              name="smtpHost"
              defaultValue={settings.smtp_host}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <FormField label="SMTP port" htmlFor="smtpPort">
            <input
              id="smtpPort"
              name="smtpPort"
              type="number"
              defaultValue={settings.smtp_port}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <FormField label="Security" htmlFor="smtpSecurity">
            <select
              id="smtpSecurity"
              name="smtpSecurity"
              defaultValue={settings.smtp_security}
              className={inputClassName}
              disabled={pending}
            >
              <option value="starttls">STARTTLS</option>
              <option value="tls">TLS</option>
              <option value="none">None</option>
            </select>
          </FormField>
          <FormField label="Username" htmlFor="smtpUsername">
            <input
              id="smtpUsername"
              name="smtpUsername"
              defaultValue={settings.smtp_username}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <FormField
            label={
              settings.smtp_password_configured
                ? "Password (configured — leave blank to keep)"
                : "Password"
            }
            htmlFor="smtpPassword"
          >
            <input
              id="smtpPassword"
              name="smtpPassword"
              type="password"
              autoComplete="new-password"
              placeholder={settings.smtp_password_configured ? "••••••••" : ""}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <FormField label="From email" htmlFor="fromEmail">
            <input
              id="fromEmail"
              name="fromEmail"
              defaultValue={settings.from_email}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <FormField label="From name" htmlFor="fromName">
            <input
              id="fromName"
              name="fromName"
              defaultValue={settings.from_name}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <FormField label="Reply-To (optional)" htmlFor="replyToEmail">
            <input
              id="replyToEmail"
              name="replyToEmail"
              defaultValue={settings.reply_to_email ?? ""}
              className={inputClassName}
              disabled={pending}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-foreground md:col-span-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={settings.enabled}
              disabled={pending}
            />
            Enabled
          </label>
          <div className="md:col-span-2">
            <Button type="submit" variant="primary" disabled={pending}>
              Save settings
            </Button>
          </div>
        </form>

        {message ? (
          <FormActionStatus variant="success" className="mt-4">
            {message}
          </FormActionStatus>
        ) : null}
        {error ? (
          <FormActionStatus variant="error" className="mt-4">
            {error}
          </FormActionStatus>
        ) : null}
      </Card>

      <Card padding="md" className="shadow-sm">
        <h3 className="text-base font-semibold text-foreground">Send test email</h3>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const recipient = new FormData(event.currentTarget).get("testRecipient");
            if (typeof recipient !== "string" || !recipient.trim()) {
              setError("Enter a test recipient email.");
              return;
            }
            setMessage(null);
            setError(null);
            startTransition(async () => {
              const result = await sendEmailDeliveryTest(recipient);
              if (result.success) {
                setMessage("Test email submitted successfully.");
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <div className="min-w-[14rem] flex-1 sm:max-w-md">
            <FormField label="Test recipient" htmlFor="testRecipient">
              <input
                id="testRecipient"
                name="testRecipient"
                type="email"
                className={inputClassName}
                disabled={pending}
              />
            </FormField>
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            Send test email
          </Button>
        </form>
        {settings.last_test_at ? (
          <p className="mt-3 text-sm text-muted">
            Last test: {new Date(settings.last_test_at).toLocaleString()} —{" "}
            {settings.last_test_status}
            {settings.last_test_error ? ` (${settings.last_test_error})` : ""}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

export type SmtpSecurityMode = "tls" | "starttls" | "none";

export type EmailDeliveryRuntimeConfig = {
  providerType: "smtp";
  providerName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurityMode;
  smtpUsername: string;
  smtpPassword: string | null;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  enabled: boolean;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
};

export type SendEmailResult =
  | { success: true; metadata?: Record<string, unknown> }
  | { success: false; error: string; ambiguous?: boolean };

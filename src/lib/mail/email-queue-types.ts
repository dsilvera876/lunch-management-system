export type EmailQueueMessageType = "auth_hook" | "account_setup_invite" | "test";

export type EmailQueueRow = {
  id: string;
  message_type: string;
  recipient_email: string;
  subject: string;
  text_body: string;
  html_body: string;
  status: "pending" | "processing" | "sent" | "failed";
  attempts: number;
  correlation_type: string | null;
  correlation_id: string | null;
};

export type EnqueueEmailDeliveryInput = {
  messageType: EmailQueueMessageType;
  recipientEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  correlationType?: string | null;
  correlationId?: string | null;
  supersedeActive?: boolean;
};

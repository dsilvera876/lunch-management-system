type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export type SendEmailResult =
  | { success: true; metadata?: Record<string, unknown> }
  | { success: false; error: string; ambiguous?: boolean };

const EMAIL_TIMEOUT_MS = 30_000;

function getSmtp2GoConfig(): { apiKey: string; sender: string } | null {
  const apiKey = process.env.SMTP2GO_API_KEY?.trim();
  const sender = process.env.SMTP2GO_SENDER?.trim();

  if (!apiKey || !sender) {
    return null;
  }

  return { apiKey, sender };
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const config = getSmtp2GoConfig();

  if (!config) {
    return { success: false, error: "Email transport is not configured." };
  }

  if (!input.to.trim() || !input.subject.trim()) {
    return { success: false, error: "Invalid email recipient or subject." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Smtp2go-Api-Key": config.apiKey,
      },
      body: JSON.stringify({
        sender: config.sender,
        to: [input.to.trim()],
        subject: input.subject.trim(),
        text_body: input.text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { success: false, error: `Email provider returned ${response.status}.` };
    }

    const payload = (await response.json()) as {
      data?: {
        succeeded?: number;
        failed?: number;
        error?: string;
        email_id?: string;
        request_id?: string;
      };
    };

    if ((payload.data?.failed ?? 0) > 0 || (payload.data?.succeeded ?? 0) < 1) {
      return {
        success: false,
        error: payload.data?.error ?? "Email provider rejected the message.",
      };
    }

    const metadata: Record<string, unknown> = {};

    if (payload.data?.email_id) {
      metadata.email_id = payload.data.email_id;
    }

    if (payload.data?.request_id) {
      metadata.request_id = payload.data.request_id;
    }

    return {
      success: true,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: "Email provider request timed out.",
        ambiguous: true,
      };
    }

    return {
      success: false,
      error: "Unable to reach email provider.",
      ambiguous: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

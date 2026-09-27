import { sendEmail } from "@/lib/mail/mail-service";

export type SendAccountSetupEmailInput = {
  to: string;
  fullName: string;
  setupUrl: string;
};

export type SendAccountSetupEmailResult =
  | { success: true }
  | { success: false; error: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendAccountSetupEmail(
  input: SendAccountSetupEmailInput,
): Promise<SendAccountSetupEmailResult> {
  const recipient = input.to.trim();
  const displayName = input.fullName.trim() || "there";
  const setupUrl = input.setupUrl.trim();

  if (!recipient || !setupUrl) {
    return { success: false, error: "Invalid account setup email payload." };
  }

  const subject = "Complete your Lunch Management System account setup";
  const text = [
    `Hello ${displayName},`,
    "",
    "Your signup request was approved. Use the link below to finish setting up your account:",
    setupUrl,
    "",
    "If you did not request access, you can ignore this email.",
  ].join("\n");

  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(setupUrl);
  const html = [
    `<p>Hello ${safeName},</p>`,
    "<p>Your signup request was approved. Use the link below to finish setting up your account:</p>",
    `<p><a href="${safeUrl}">Complete account setup</a></p>`,
    "<p>If you did not request access, you can ignore this email.</p>",
  ].join("");

  const result = await sendEmail({
    to: recipient,
    subject,
    text,
    html,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordValidationCode = "missing" | "policy" | "mismatch";

export function validatePasswordUpdate(
  password: string,
  confirmPassword: string,
): { ok: true } | { ok: false; code: PasswordValidationCode } {
  if (!password || !confirmPassword) {
    return { ok: false, code: "missing" };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, code: "policy" };
  }

  if (password !== confirmPassword) {
    return { ok: false, code: "mismatch" };
  }

  return { ok: true };
}

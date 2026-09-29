import type { PostgrestError } from "@supabase/supabase-js";

import { USER_IMPORT_HEADERS, USER_IMPORT_MAX_BYTES } from "@/lib/user-import-csv";

const MAX_FILE_LABEL = `${Math.round(USER_IMPORT_MAX_BYTES / 1024)} KB`;

export function userImportFileTooLargeMessage(): string {
  return `This file exceeds the ${MAX_FILE_LABEL} limit.`;
}

export function mapUserImportParseError(raw: string): string {
  const normalized = raw.trim();

  if (normalized === "CSV file is empty.") {
    return "This CSV file is empty.";
  }

  if (normalized === "CSV contains no data rows.") {
    return "This CSV does not contain any employee rows.";
  }

  if (normalized.startsWith("Missing required columns:")) {
    const columns = normalized
      .replace("Missing required columns:", "")
      .trim()
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    const friendly = columns
      .map((column) => mapRequiredColumnLabel(column))
      .filter((label): label is string => label !== null);
    if (friendly.length > 0) {
      return `This CSV is missing required columns: ${friendly.join(" and ")}.`;
    }
    return "This CSV is missing required columns.";
  }

  if (normalized.startsWith("Missing required column:")) {
    const column = normalized.replace("Missing required column:", "").trim();
    const friendly = mapRequiredColumnLabel(column);
    if (friendly) {
      return `This CSV is missing required columns: ${friendly}.`;
    }
    return "This CSV is missing required columns.";
  }

  if (normalized.startsWith("CSV exceeds the maximum of")) {
    return userImportFileTooLargeMessage();
  }

  return "We couldn't read this CSV. Check the file format and try again.";
}

function mapRequiredColumnLabel(column: string): string | null {
  switch (column) {
    case "full_name":
      return "Name";
    case "email":
      return "Email";
    case "employee_id":
      return "Employee ID";
    default:
      return null;
  }
}

export function mapUserImportRpcError(error: PostgrestError): string {
  const message = error.message ?? "";
  const details = `${message} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  if (message.includes("Bulk user import access required")) {
    return "Bulk import is available to HR only.";
  }

  if (message.includes("Authentication required for bulk user import")) {
    return "Your session expired. Sign in again and retry.";
  }

  if (message.includes("CSV contains no data rows")) {
    return "This CSV does not contain any employee rows.";
  }

  if (message.includes("Invalid import rows payload")) {
    return "We couldn't read this CSV. Check the file format and try again.";
  }

  if (details.includes("user_import_rows_employee_id_format_check")) {
    return "Employee ID must contain exactly 4 digits.";
  }

  return "Unable to validate this CSV right now. Please try again.";
}

export function unexpectedUserImportValidationMessage(): string {
  return "Unable to validate this CSV right now. Please try again.";
}

export function assertUserImportTemplateHeaders(content: string): boolean {
  const headerLine = content.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim());
  if (!headerLine) return false;

  const fields = headerLine.split(",").map((field) => field.trim().toLowerCase());
  return USER_IMPORT_HEADERS.every((required) => fields.includes(required));
}

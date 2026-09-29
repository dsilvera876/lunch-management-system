"use server";

import { revalidatePath } from "next/cache";
import { requireManageStaffAccounts } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  USER_IMPORT_MAX_BYTES,
  applyCrossRowImportValidation,
  parseUserImportCsv,
} from "@/lib/user-import-csv";
import {
  mapUserImportParseError,
  mapUserImportRpcError,
  unexpectedUserImportValidationMessage,
  userImportFileTooLargeMessage,
} from "@/lib/user-import-messages";

export type UserImportPreviewResult =
  | {
      success: true;
      batchId: string;
      validation: Record<string, unknown>;
    }
  | { success: false; error: string };

export type UserImportConfirmResult =
  | { success: true; batchId: string }
  | { success: false; error: string };

export async function previewUserImportCsv(formData: FormData): Promise<UserImportPreviewResult> {
  const profile = await requireManageStaffAccounts();
  if (profile.role !== "hr") {
    return { success: false, error: "Bulk import is available to HR only." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "Choose a CSV file to upload." };
  }

  if (file.size > USER_IMPORT_MAX_BYTES) {
    return { success: false, error: userImportFileTooLargeMessage() };
  }

  const content = await file.text();
  const parsed = parseUserImportCsv(content);
  if (!parsed.ok) {
    return { success: false, error: mapUserImportParseError(parsed.error) };
  }

  const crossRowErrors = applyCrossRowImportValidation(parsed.rows);
  const payload = parsed.rows.map((row) => ({
    row_number: row.rowNumber,
    full_name: row.full_name,
    email: row.email,
    employee_id: row.employee_id,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_user_import_batch", {
    p_rows: payload,
  });

  if (error) {
    console.error("[bulk-user-import] create_user_import_batch failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { success: false, error: mapUserImportRpcError(error) };
  }

  if (!data) {
    console.error("[bulk-user-import] create_user_import_batch returned no data");
    return { success: false, error: unexpectedUserImportValidationMessage() };
  }

  const result = data as Record<string, unknown>;
  const validation = (result.validation ?? {}) as Record<string, unknown>;

  const normalizedFromByRow = new Map<number, string>();
  for (const row of parsed.rows) {
    if (row.employee_id_normalized_from) {
      normalizedFromByRow.set(row.rowNumber, row.employee_id_normalized_from);
    }
  }

  if (Array.isArray(validation.rows)) {
    validation.rows = (validation.rows as Record<string, unknown>[]).map((row) => {
      const rowNumber = Number(row.row_number);
      const normalizedFrom = normalizedFromByRow.get(rowNumber);
      if (!normalizedFrom) return row;
      return {
        ...row,
        employee_id_import_note: `Normalized from ${normalizedFrom}`,
      };
    });
  }

  if (crossRowErrors.size > 0) {
    const rows = Array.isArray(validation.rows)
      ? (validation.rows as Record<string, unknown>[])
      : [];
    let errorCount = 0;
    validation.rows = rows.map((row) => {
      const rowNumber = Number(row.row_number);
      const crossError = crossRowErrors.get(rowNumber);
      if (!crossError) return row;
      errorCount += 1;
      return {
        ...row,
        classification: "error",
        action_code: "error",
        preview_message: crossError,
        blocking: true,
      };
    });
    const summary = (validation.summary ?? {}) as Record<string, unknown>;
    summary.blocking_errors = true;
    summary.can_confirm = false;
    summary.errors = Number(summary.errors ?? 0) + errorCount;
    validation.summary = summary;
    validation.can_confirm = false;
  }

  return {
    success: true,
    batchId: String(result.batch_id),
    validation,
  };
}

export async function confirmUserImportBatch(batchId: string): Promise<UserImportConfirmResult> {
  const profile = await requireManageStaffAccounts();
  if (profile.role !== "hr") {
    return { success: false, error: "Bulk import is available to HR only." };
  }

  if (!batchId) {
    return { success: false, error: "Import batch not found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_user_import_batch", {
    p_batch_id: batchId,
  });

  if (error || !data) {
    return { success: false, error: "Unable to confirm import." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/users/import");

  return { success: true, batchId };
}

export async function getUserImportBatch(batchId: string) {
  const profile = await requireManageStaffAccounts();
  if (profile.role !== "hr") {
    return null;
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_user_import_batch", { p_batch_id: batchId });
  return data as Record<string, unknown> | null;
}

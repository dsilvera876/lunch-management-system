export const USER_IMPORT_MAX_ROWS = 2000;
export const USER_IMPORT_MAX_BYTES = 512 * 1024;

export const USER_IMPORT_HEADERS = ["full_name", "email", "employee_id"] as const;

/** Downloadable template: headers only so HR fills in real employee rows. */
export const USER_IMPORT_CSV_TEMPLATE = `full_name,email,employee_id
`;

export type ParsedUserImportRow = {
  rowNumber: number;
  full_name: string;
  email: string;
  /** Canonical four-digit Employee ID, or empty string when omitted. */
  employee_id: string;
  /** Set when Excel/CSV short form was padded (for example, 54 → 0054). */
  employee_id_normalized_from?: string;
};

export type BulkImportEmployeeIdNormalization =
  | { ok: true; value: null }
  | { ok: true; value: string; normalizedFrom?: string }
  | { ok: false; message: string };

/** Matches bulk-import email validation in `classify_user_import_row`. */
export function validateBulkImportEmail(raw: string): { ok: true } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Email address is required." };
  }

  const normalized = trimmed.toLowerCase();
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(normalized)) {
    return { ok: false, message: "Email address is invalid." };
  }

  return { ok: true };
}

/** Bulk import only — manual Employee ID entry remains strictly four digits. */
export function normalizeBulkImportEmployeeId(raw: string): BulkImportEmployeeIdNormalization {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: true, value: null };
  }

  if (!/^[0-9]{1,4}$/.test(trimmed)) {
    return {
      ok: false,
      message: "Employee ID must contain only digits (up to four).",
    };
  }

  const canonical = trimmed.padStart(4, "0");
  if (canonical === trimmed) {
    return { ok: true, value: canonical };
  }

  return { ok: true, value: canonical, normalizedFrom: trimmed };
}

export type ParseUserImportCsvResult =
  | { ok: true; rows: ParsedUserImportRow[] }
  | { ok: false; error: string };

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

export function parseUserImportCsv(content: string): ParseUserImportCsvResult {
  const normalized = stripBom(content).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { ok: false, error: "CSV file is empty." };
  }

  const headerFields = parseCsvLine(lines[0] ?? "").map((field) => field.toLowerCase());

  const missingHeaders = USER_IMPORT_HEADERS.filter((required) => !headerFields.includes(required));
  if (missingHeaders.length > 0) {
    return { ok: false, error: `Missing required columns: ${missingHeaders.join(",")}` };
  }

  const headerIndex = Object.fromEntries(headerFields.map((name, index) => [name, index])) as Record<
    string,
    number
  >;

  const rows: ParsedUserImportRow[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const fields = parseCsvLine(lines[lineIndex] ?? "");
    const fullName = fields[headerIndex.full_name ?? -1] ?? "";
    const email = fields[headerIndex.email ?? -1] ?? "";
    const employeeId = fields[headerIndex.employee_id ?? -1] ?? "";

    if (!fullName && !email && !employeeId.trim()) {
      continue;
    }

    const validatedEmail = validateBulkImportEmail(email);
    if (!validatedEmail.ok) {
      return {
        ok: false,
        error: `Row ${lineIndex + 1}: ${validatedEmail.message}`,
      };
    }

    const normalizedEmployeeId = normalizeBulkImportEmployeeId(employeeId);
    if (!normalizedEmployeeId.ok) {
      return {
        ok: false,
        error: `Row ${lineIndex + 1}: ${normalizedEmployeeId.message}`,
      };
    }

    const parsedRow: ParsedUserImportRow = {
      rowNumber: lineIndex + 1,
      full_name: fullName,
      email,
      employee_id: normalizedEmployeeId.value ?? "",
    };
    if (
      normalizedEmployeeId.value !== null &&
      "normalizedFrom" in normalizedEmployeeId &&
      normalizedEmployeeId.normalizedFrom
    ) {
      parsedRow.employee_id_normalized_from = normalizedEmployeeId.normalizedFrom;
    }
    rows.push(parsedRow);
  }

  if (rows.length === 0) {
    return { ok: false, error: "CSV contains no data rows." };
  }

  if (rows.length > USER_IMPORT_MAX_ROWS) {
    return { ok: false, error: `CSV exceeds the maximum of ${USER_IMPORT_MAX_ROWS} rows.` };
  }

  return { ok: true, rows };
}

export function applyCrossRowImportValidation(
  rows: ParsedUserImportRow[],
): Map<number, string> {
  const errors = new Map<number, string>();
  const emailCounts = new Map<string, number[]>();
  const employeeCounts = new Map<string, number[]>();

  for (const row of rows) {
    const normalized = row.email.trim().toLowerCase();
    if (normalized) {
      const list = emailCounts.get(normalized) ?? [];
      list.push(row.rowNumber);
      emailCounts.set(normalized, list);
    }

    const employeeKey = (() => {
      const normalized = normalizeBulkImportEmployeeId(row.employee_id);
      if (normalized.ok && normalized.value) {
        return normalized.value;
      }
      const trimmed = row.employee_id.trim();
      return trimmed || null;
    })();
    if (employeeKey) {
      const list = employeeCounts.get(employeeKey) ?? [];
      list.push(row.rowNumber);
      employeeCounts.set(employeeKey, list);
    }
  }

  for (const rowNumbers of emailCounts.values()) {
    if (rowNumbers.length > 1) {
      for (const rowNumber of rowNumbers) {
        errors.set(rowNumber, "Duplicate email address in CSV.");
      }
    }
  }

  for (const [employeeId, rowNumbers] of employeeCounts.entries()) {
    if (rowNumbers.length > 1) {
      for (const rowNumber of rowNumbers) {
        errors.set(rowNumber, `Duplicate Employee ID ${employeeId} in CSV.`);
      }
    }
  }

  return errors;
}

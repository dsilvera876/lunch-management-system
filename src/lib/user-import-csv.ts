export const USER_IMPORT_MAX_ROWS = 2000;
export const USER_IMPORT_MAX_BYTES = 512 * 1024;

export const USER_IMPORT_HEADERS = ["full_name", "email", "employee_id"] as const;

export type ParsedUserImportRow = {
  rowNumber: number;
  full_name: string;
  email: string;
  employee_id: string;
};

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

  for (const required of USER_IMPORT_HEADERS) {
    if (!headerFields.includes(required)) {
      return { ok: false, error: `Missing required column: ${required}` };
    }
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

    if (!fullName && !email && !employeeId) {
      continue;
    }

    rows.push({
      rowNumber: lineIndex + 1,
      full_name: fullName,
      email,
      employee_id: employeeId,
    });
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

    const employeeId = row.employee_id.trim();
    if (employeeId) {
      const list = employeeCounts.get(employeeId) ?? [];
      list.push(row.rowNumber);
      employeeCounts.set(employeeId, list);
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

export const USER_IMPORT_CSV_TEMPLATE = `full_name,email,employee_id
Jane Brown,jane@company.com,0054
Michael Green,michael@gmail.com,1123
`;

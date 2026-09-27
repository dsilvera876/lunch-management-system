const EMPLOYEE_ID_PATTERN = /^[0-9]{4}$/;

export type EmployeeIdValidation =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

export function formatEmployeeIdDisplay(employeeId: string | null | undefined): string {
  if (!employeeId) {
    return "—";
  }

  return employeeId;
}

export function validateEmployeeIdField(raw: string): EmployeeIdValidation {
  if (raw.length === 0) {
    return { ok: true, value: null };
  }

  if (raw !== raw.trim()) {
    return { ok: false, message: "Employee ID must be exactly four digits with no spaces." };
  }

  if (!EMPLOYEE_ID_PATTERN.test(raw)) {
    return { ok: false, message: "Employee ID must be exactly four digits (for example, 0054)." };
  }

  return { ok: true, value: raw };
}

export function mapSetEmployeeIdError(message: string): string {
  const duplicate = message.match(
    /^Employee ID ([0-9]{4}) is already assigned to another user$/,
  );

  if (duplicate) {
    return `Employee ID ${duplicate[1]} is already assigned to another user.`;
  }

  if (message.includes("Invalid employee ID format")) {
    return "Employee ID must be exactly four digits (for example, 0054).";
  }

  if (message.includes("Employee ID management access required")) {
    return "You do not have permission to manage Employee IDs.";
  }

  return "Unable to save Employee ID. Please try again.";
}

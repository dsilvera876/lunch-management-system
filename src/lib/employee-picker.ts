export type EmployeePickerOption = {
  id: string;
  name: string;
  email: string;
};

export const EMPLOYEE_PICKER_EMPTY_MESSAGE = "No employees found.";

export const EMPLOYEE_PICKER_DEFAULT_PLACEHOLDER = "Select employee";

export function sortEmployeesForPicker(
  employees: EmployeePickerOption[],
): EmployeePickerOption[] {
  return [...employees].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function filterEmployeesForPicker(
  employees: EmployeePickerOption[],
  query: string,
): EmployeePickerOption[] {
  const sorted = sortEmployeesForPicker(employees);
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return sorted;
  }

  return sorted.filter(
    (employee) =>
      employee.name.toLowerCase().includes(normalized) ||
      employee.email.toLowerCase().includes(normalized),
  );
}

export function findEmployeePickerOption(
  employees: EmployeePickerOption[],
  id: string,
): EmployeePickerOption | undefined {
  return employees.find((employee) => employee.id === id);
}

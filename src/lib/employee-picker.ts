export type EmployeePickerOption = {
  id: string;
  name: string;
  email: string;
};

export const EMPLOYEE_PICKER_EMPTY_MESSAGE = "No employees found.";

export const EMPLOYEE_PICKER_DEFAULT_PLACEHOLDER = "Select employee";

const COMBINING_DIACRITICS =
  /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/gu;

export function normalizeEmployeeNameSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase();
}

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
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return sorted;
  }

  const normalizedNameQuery = normalizeEmployeeNameSearch(trimmedQuery);
  const normalizedEmailQuery = trimmedQuery.toLowerCase();

  return sorted.filter(
    (employee) =>
      (normalizedNameQuery.length > 0 &&
        normalizeEmployeeNameSearch(employee.name).includes(
          normalizedNameQuery,
        )) ||
      employee.email.toLowerCase().includes(normalizedEmailQuery),
  );
}

export function findEmployeePickerOption(
  employees: EmployeePickerOption[],
  id: string,
): EmployeePickerOption | undefined {
  return employees.find((employee) => employee.id === id);
}

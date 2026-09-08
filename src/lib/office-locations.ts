export type OfficeLocation = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  is_active: boolean;
};

export type OfficeLocationOption = Pick<
  OfficeLocation,
  "id" | "name" | "address" | "description"
>;

export function formatOfficeLocationLabel(
  name: string,
  address?: string | null,
): string {
  const trimmedAddress = address?.trim();
  if (trimmedAddress) {
    return `${name} — ${trimmedAddress}`;
  }

  return name;
}

export function normalizeOfficeLocationName(name: string): string {
  return name.trim();
}

export function isValidOfficeLocationName(name: string): boolean {
  return normalizeOfficeLocationName(name).length > 0;
}

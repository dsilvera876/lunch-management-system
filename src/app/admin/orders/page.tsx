import { requireViewAllOrders, canFulfillOrders } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefaultOperationalDeliveryDate } from "@/lib/operational-delivery-date";
import {
  failOperationalOrdersQuery,
  OPERATIONAL_ORDERS_SELECT,
  parseOperationalOrderRow,
  type OperationalOrderRow,
} from "@/lib/operational-orders-data";
import {
  buildOrderHistoryReport,
  buildOrderHistoryUrl,
  filterOrdersForHistoryView,
  ORDER_HISTORY_ALL_DATES,
  parseOrderHistoryFilters,
} from "@/lib/order-history";
import type { EmployeePickerOption } from "@/lib/employee-picker";
import { OrderHistoryPageHeader } from "@/components/admin/order-history-page-header";
import { OrderHistoryWorkspace } from "@/components/admin/order-history-workspace";

type Props = {
  searchParams: Promise<{
    deliveryDate?: string;
    provider?: string;
    reconciliation?: string;
    location?: string;
    employee?: string;
  }>;
};

const ORDER_HISTORY_QUERY_LIMIT = 500;

export default async function AdminOrdersPage({ searchParams }: Props) {
  const profile = await requireViewAllOrders();
  const canReconcile = canFulfillOrders(profile.role);
  const params = await searchParams;
  const supabase = await createClient();

  const defaultDeliveryDate = getDefaultOperationalDeliveryDate();
  const filters = parseOrderHistoryFilters({
    deliveryDate: params.deliveryDate,
    provider: params.provider,
    location: params.location,
    reconciliation: params.reconciliation,
    employee: params.employee,
    defaultDeliveryDate,
  });

  const [
    { data: providers },
    { data: locationRows },
    { data: deliveryDates },
    { data: employeeRows, error: employeesError },
  ] = await Promise.all([
    supabase
      .from("lunch_providers")
      .select("id, name")
      .eq("active", true)
      .order("name", { ascending: true }),

    supabase
      .from("office_locations")
      .select("name")
      .order("name", { ascending: true }),

    supabase
      .from("lunch_days")
      .select("lunch_date")
      .order("lunch_date", { ascending: false })
      .limit(90),

    supabase.rpc("list_late_order_employee_profiles"),
  ]);

  if (employeesError) {
    throw new Error("Unable to load employees for order history.");
  }

  const employees: EmployeePickerOption[] = (employeeRows ?? []).map(
    (row: { id: string; full_name: string | null; email: string }) => ({
      id: row.id,
      name: row.full_name?.trim() || "Unnamed employee",
      email: row.email,
    }),
  );

  let ordersQuery = supabase
    .from("orders")
    .select(OPERATIONAL_ORDERS_SELECT)
    .limit(ORDER_HISTORY_QUERY_LIMIT);

  if (filters.deliveryDate !== ORDER_HISTORY_ALL_DATES) {
    ordersQuery = ordersQuery.eq("lunch_days.lunch_date", filters.deliveryDate);
  }

  if (filters.providerId) {
    ordersQuery = ordersQuery.eq("lunch_days.provider_id", filters.providerId);
  }

  if (filters.officeLocation) {
    ordersQuery = ordersQuery.eq("office_location_name", filters.officeLocation);
  }

  if (filters.employeeId) {
    ordersQuery = ordersQuery.eq("profile_id", filters.employeeId);
  }

  if (filters.deliveryDate === ORDER_HISTORY_ALL_DATES) {
    ordersQuery = ordersQuery.order("lunch_date", {
      referencedTable: "lunch_days",
      ascending: false,
    });
  } else {
    ordersQuery = ordersQuery.order("created_at", { ascending: true });
  }

  const { data, error } = await ordersQuery;

  if (error) {
    failOperationalOrdersQuery("admin/orders", error, "Unable to load orders.");
  }

  const parsedOrders = (data ?? [])
    .map((row) => parseOperationalOrderRow(row as unknown as OperationalOrderRow))
    .filter((order): order is NonNullable<typeof order> => order !== null);

  const orders = filterOrdersForHistoryView(
    parsedOrders,
    filters.reconciliationStatus,
  );

  const report = buildOrderHistoryReport(
    orders,
    filters.deliveryDate === ORDER_HISTORY_ALL_DATES
      ? ORDER_HISTORY_ALL_DATES
      : filters.deliveryDate,
  );

  const locationNames = Array.from(
    new Set(
      (locationRows ?? [])
        .map((row) => row.name)
        .concat(parsedOrders.map((order) => order.officeLocationName)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const availableDeliveryDates = Array.from(
    new Set((deliveryDates ?? []).map((row) => row.lunch_date)),
  );

  if (
    filters.deliveryDate !== ORDER_HISTORY_ALL_DATES &&
    !availableDeliveryDates.includes(filters.deliveryDate)
  ) {
    availableDeliveryDates.unshift(filters.deliveryDate);
  }

  const selectedEmployeeName =
    employees.find((employee) => employee.id === filters.employeeId)?.name ?? null;

  return (
    <>
      <OrderHistoryPageHeader />

      <OrderHistoryWorkspace
        key={buildOrderHistoryUrl(filters)}
        initialOrders={orders}
        unfilteredOrders={parsedOrders}
        filters={filters}
        defaultDeliveryDate={defaultDeliveryDate}
        providers={providers ?? []}
        locationNames={locationNames}
        deliveryDates={availableDeliveryDates}
        employees={employees}
        canReconcile={canReconcile}
        providerGroups={report.providers}
        selectedEmployeeName={selectedEmployeeName}
      />
    </>
  );
}

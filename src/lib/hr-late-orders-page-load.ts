import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingStaffLateOrderRequest } from "@/components/admin/late-orders/pending-staff-late-order-requests";
import { getRelated } from "@/lib/format";
import {
  listHrLateOrderCreationCycles,
  type HrLateOrderCreationCycle,
} from "@/lib/hr-late-order-create";
import {
  classifyLateOrderSnapshotWarning,
  resolvePrimaryLateOrderDeliveryDate,
  shouldShowLateOrderProviderSummary,
} from "@/lib/late-order-cycle";
import {
  formatAutomaticSupplementScheduleLabel,
  formatLateOrderTimeLabel,
  formatSupplementDispatchStatusLabel,
  isAutomaticSupplementDue,
  isProviderLateOrderingOpen,
  type LateOrderDeadlineDay,
  type SupplementalDispatchMode,
  type SupplementDispatchRecord,
} from "@/lib/late-orders";
import {
  buildSentLateOrderDispatchMap,
  countEligibleLateOrdersForSupplementSend,
  resolveLateOrderRowDispatchDisplay,
  type LateOrderDispatchMembershipRow,
  type LateOrderRowDispatchDisplay,
} from "@/lib/late-order-per-order-status";
import { formatProviderLateOrderCutoffLabel } from "@/lib/late-orders-presentation";
import {
  loadOperationalOrderDisplayNames,
  OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE,
  type OperationalOrderDisplayNames,
} from "@/lib/operational-orders-data";
import type { OfficeLocationOption } from "@/lib/office-locations";

export const HR_LATE_ORDERS_PAGE_SIZE = 500;

type QueryError = { message: string } | null;
type QueryResult = PromiseLike<{ data?: unknown; error?: QueryError }>;
type CursorQuery = QueryResult & {
  gt(column: string, value: string): CursorQuery;
};

type ProviderRow = {
  id: string;
  name: string;
  active: boolean;
  accepts_late_orders: boolean;
  late_order_deadline_day: LateOrderDeadlineDay | null;
  late_order_deadline_time: string | null;
  supplemental_dispatch_mode: SupplementalDispatchMode;
  automatic_supplement_send_day: LateOrderDeadlineDay | null;
  automatic_supplement_send_time: string | null;
  primary_order_email: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  email: string;
};

type LocationRow = {
  id: string;
  name: string;
};

type PendingRequestRow = {
  id: string;
  requester_profile_id: string;
  requester_name: string | null;
  requester_email: string;
  provider_id: string;
  provider_name: string;
  order_date: string;
  scheduled_delivery_date: string;
  requested_summary: string;
  quantity: number;
  special_instructions: string | null;
  office_location_id: string;
  created_at: string;
  updated_at: string;
  fulfillment_window_open: boolean;
};

type LunchDayRow = {
  id: string;
  provider_id: string;
  order_date: string | null;
  lunch_date: string;
};

type LateOrderRow = {
  id: string;
  created_at: string;
  lunch_days:
    | { lunch_date: string; order_date: string | null; provider_id: string }
    | Array<{ lunch_date: string; order_date: string | null; provider_id: string }>
    | null;
};

type DispatchMembershipQueryRow = {
  order_id: string;
  provider_late_order_dispatches:
    | {
        provider_id: string;
        scheduled_delivery_date: string;
        status: string;
        sent_at: string | null;
      }
    | Array<{
        provider_id: string;
        scheduled_delivery_date: string;
        status: string;
        sent_at: string | null;
      }>
    | null;
};

type DispatchRow = {
  id: string;
  provider_id: string;
  scheduled_delivery_date: string;
  status: string;
  dispatch_type: string;
  sent_at: string | null;
  error_summary: string | null;
  created_at: string;
  message_metadata: unknown;
};

type OpportunityRow = {
  id: string;
  provider_id: string;
  scheduled_delivery_date: string;
  outcome: string;
  processed_at: string;
  late_order_count: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimestampString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestampString(value);
}

function isDeadlineDay(value: unknown): value is LateOrderDeadlineDay | null {
  return value === null || value === "order_day" || value === "delivery_day";
}

function isProviderRow(value: unknown): value is ProviderRow {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    typeof value.active === "boolean" &&
    typeof value.accepts_late_orders === "boolean" &&
    isDeadlineDay(value.late_order_deadline_day) &&
    isNullableString(value.late_order_deadline_time) &&
    (value.supplemental_dispatch_mode === "manual" ||
      value.supplemental_dispatch_mode === "automatic") &&
    isDeadlineDay(value.automatic_supplement_send_day) &&
    isNullableString(value.automatic_supplement_send_time) &&
    isNullableString(value.primary_order_email)
  );
}

function isEmployeeRow(value: unknown): value is EmployeeRow {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isNullableString(value.full_name) &&
    typeof value.email === "string"
  );
}

function isLocationRow(value: unknown): value is LocationRow {
  return isRecord(value) && isString(value.id) && isString(value.name);
}

function isPendingRequestRow(value: unknown): value is PendingRequestRow {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.requester_profile_id) &&
    isNullableString(value.requester_name) &&
    typeof value.requester_email === "string" &&
    isString(value.provider_id) &&
    isString(value.provider_name) &&
    isDateString(value.order_date) &&
    isDateString(value.scheduled_delivery_date) &&
    isString(value.requested_summary) &&
    Number.isInteger(value.quantity) &&
    isNullableString(value.special_instructions) &&
    isString(value.office_location_id) &&
    isTimestampString(value.created_at) &&
    isTimestampString(value.updated_at) &&
    typeof value.fulfillment_window_open === "boolean"
  );
}

function isLunchDayRow(value: unknown): value is LunchDayRow {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.provider_id) &&
    (value.order_date === null || isDateString(value.order_date)) &&
    isDateString(value.lunch_date)
  );
}

function isLateOrderRelation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isDateString(value.lunch_date) &&
    (value.order_date === null || isDateString(value.order_date)) &&
    isString(value.provider_id)
  );
}

function isLateOrderRow(value: unknown): value is LateOrderRow {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isTimestampString(value.created_at) &&
    (isLateOrderRelation(value.lunch_days) ||
      (Array.isArray(value.lunch_days) &&
        value.lunch_days.length === 1 &&
        isLateOrderRelation(value.lunch_days[0])))
  );
}

function isDispatchMembershipRelation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.provider_id) &&
    isDateString(value.scheduled_delivery_date) &&
    isString(value.status) &&
    isNullableTimestamp(value.sent_at)
  );
}

function isDispatchMembershipRow(value: unknown): value is DispatchMembershipQueryRow {
  return (
    isRecord(value) &&
    isString(value.order_id) &&
    (isDispatchMembershipRelation(value.provider_late_order_dispatches) ||
      (Array.isArray(value.provider_late_order_dispatches) &&
        value.provider_late_order_dispatches.length === 1 &&
        isDispatchMembershipRelation(value.provider_late_order_dispatches[0])))
  );
}

function isDispatchRow(value: unknown): value is DispatchRow {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.provider_id) &&
    isDateString(value.scheduled_delivery_date) &&
    isString(value.status) &&
    isString(value.dispatch_type) &&
    isNullableTimestamp(value.sent_at) &&
    isNullableString(value.error_summary) &&
    isTimestampString(value.created_at) &&
    Object.hasOwn(value, "message_metadata")
  );
}

function isOpportunityRow(value: unknown): value is OpportunityRow {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.provider_id) &&
    isDateString(value.scheduled_delivery_date) &&
    isString(value.outcome) &&
    isTimestampString(value.processed_at) &&
    Number.isInteger(value.late_order_count)
  );
}

export type HrLateOrderProviderSummary = {
  providerId: string;
  providerName: string;
  deliveryDate: string;
  orderDate: string;
  acceptsLateOrders: boolean;
  deadlineSummary: string;
  lateOrderingOpen: boolean;
  approvedUnsentCount: number;
  dispatchMode: string;
  automaticScheduleLabel: string | null;
  supplementStatusLabel: string;
  snapshotMissing: boolean;
  snapshotWarningMessage: string | null;
  hasBlockingDispatch: boolean;
  attentionDispatchId: string | null;
  primaryOrderEmail: string | null;
  cutoffTimeLabel: string;
  lateOrders: Array<{
    id: string;
    employeeName: string;
    createdAt: string;
    dispatchDisplay: LateOrderRowDispatchDisplay;
  }>;
  lateOrderCount: number;
};

export type HrLateOrdersPageData = {
  providerSummaries: HrLateOrderProviderSummary[];
  lateOrderProviders: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; email: string }>;
  locations: OfficeLocationOption[];
  primaryDeliveryDate: string;
  providerCreationCycles: Record<string, HrLateOrderCreationCycle[]>;
  pendingStaffRequests: PendingStaffLateOrderRequest[];
};

export type HrLateOrdersLoaderMetrics = {
  outcome: "success" | "error";
  totalDurationMs: number;
  phaseDurationMs: {
    bootstrap: number;
    calendar: number;
    operational: number;
    hydration: number;
  };
  databaseRequestCount: number;
  providerCount: number;
  deliveryDateCount: number;
};

export type HrLateOrdersDataSource = {
  getRequestCount(): number;
  fetchNextDeliveryDate(today: string): Promise<string | null>;
  fetchProviders(): Promise<ProviderRow[]>;
  fetchPendingStaffRequests(): Promise<PendingRequestRow[]>;
  fetchOrderDate(deliveryDate: string): Promise<string | null>;
  fetchDeadline(orderDate: string): Promise<string | null>;
  fetchLunchDays(deliveryDates: string[]): Promise<LunchDayRow[]>;
  fetchLateOrders(deliveryDates: string[]): Promise<LateOrderRow[]>;
  fetchDispatchMemberships(deliveryDates: string[]): Promise<DispatchMembershipQueryRow[]>;
  fetchDispatches(deliveryDates: string[]): Promise<DispatchRow[]>;
  fetchOpportunities(deliveryDates: string[]): Promise<OpportunityRow[]>;
  fetchDisplayNames(orderIds: string[]): ReturnType<typeof loadOperationalOrderDisplayNames>;
  fetchEmployees(): Promise<EmployeeRow[]>;
  fetchLocations(): Promise<LocationRow[]>;
};

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function pairKey(providerId: string, deliveryDate: string): string {
  return `${providerId}:${deliveryDate}`;
}

function formatLateOrderDeadlineSummary(
  deadlineDay: string | null,
  deadlineTime: string | null,
): string {
  if (!deadlineDay || !deadlineTime) {
    return "Late deadline not configured";
  }

  const dayLabel = deadlineDay === "delivery_day" ? "delivery day" : "order day";
  return `Late orders accepted until ${formatLateOrderTimeLabel(deadlineTime)} on ${dayLabel}`;
}

function compareDispatchRows(a: DispatchRow, b: DispatchRow): number {
  const createdComparison = b.created_at.localeCompare(a.created_at);
  return createdComparison !== 0 ? createdComparison : a.id.localeCompare(b.id);
}

function defaultMetricsLogger(metrics: HrLateOrdersLoaderMetrics): void {
  console.info("[admin-late-orders] loader performance", metrics);
}

export function createSupabaseHrLateOrdersDataSource(
  supabase: SupabaseClient,
): HrLateOrdersDataSource {
  let requestCount = 0;

  async function requestData(query: QueryResult, errorMessage: string): Promise<unknown> {
    requestCount += 1;
    const result = await query;

    if (result.error) {
      throw new Error(errorMessage);
    }

    if (!Object.prototype.hasOwnProperty.call(result, "data")) {
      throw new Error(`${errorMessage} The database response was incomplete.`);
    }

    return result.data;
  }

  async function requestScalar<T>(
    query: QueryResult,
    errorMessage: string,
    validate: (value: unknown) => value is T,
  ): Promise<T> {
    const data = await requestData(query, errorMessage);
    if (!validate(data)) {
      throw new Error(`${errorMessage} The database response was invalid.`);
    }
    return data;
  }

  async function readAllPages<T>(
    errorMessage: string,
    buildQuery: (cursor: string | null) => QueryResult,
    getCursor: (row: T) => string,
    validateRow: (value: unknown) => value is T,
  ): Promise<T[]> {
    // Each PostgREST page is a separate transaction. The immutable cursor prevents
    // offset shifts from skipping existing rows, but this is not an MVCC snapshot:
    // rows inserted at or before an already-read cursor appear on the next refresh,
    // and concurrent status changes may be observed on a later page.
    const rows: T[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    for (;;) {
      const data = await requestData(buildQuery(cursor), errorMessage);
      if (!Array.isArray(data)) {
        throw new Error(`${errorMessage} The database response was not a row array.`);
      }
      if (data.length > HR_LATE_ORDERS_PAGE_SIZE) {
        throw new Error(`${errorMessage} The database returned an oversized page.`);
      }

      const page: T[] = [];
      for (const value of data) {
        if (!validateRow(value)) {
          throw new Error(`${errorMessage} The database returned a malformed row.`);
        }
        const rowCursor = getCursor(value);
        if (!isString(rowCursor) || seenCursors.has(rowCursor)) {
          throw new Error(`${errorMessage} The database returned duplicate row identifiers.`);
        }
        seenCursors.add(rowCursor);
        page.push(value);
      }
      rows.push(...page);

      if (page.length < HR_LATE_ORDERS_PAGE_SIZE) {
        return rows;
      }

      const nextCursor = getCursor(page[page.length - 1]!);
      if (nextCursor === cursor) {
        throw new Error(`${errorMessage} Database pagination did not advance.`);
      }
      cursor = nextCursor;
    }
  }

  function applyCursor(query: CursorQuery, column: string, cursor: string | null): QueryResult {
    return cursor ? query.gt(column, cursor) : query;
  }

  return {
    getRequestCount: () => requestCount,
    fetchNextDeliveryDate: (today) =>
      requestScalar<string | null>(
        supabase.rpc("delivery_date_for_order_date", {
          p_order_date: today,
          p_office_location_id: null,
        }),
        "Unable to resolve the next late-order delivery date.",
        (value): value is string | null => value === null || isDateString(value),
      ),
    fetchProviders: () =>
      readAllPages<ProviderRow>(
        "Unable to load lunch providers.",
        (cursor) =>
          applyCursor(
            supabase
              .from("lunch_providers")
              .select(
                "id, name, active, accepts_late_orders, late_order_deadline_day, late_order_deadline_time, supplemental_dispatch_mode, automatic_supplement_send_day, automatic_supplement_send_time, primary_order_email",
              )
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isProviderRow,
      ).then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))),
    fetchPendingStaffRequests: () =>
      readAllPages<PendingRequestRow>(
        "Unable to load pending late-order requests.",
        (cursor) =>
          applyCursor(
            supabase
              .rpc("list_pending_staff_late_order_requests_for_hr")
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isPendingRequestRow,
      ).then((rows) =>
        rows.sort(
          (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
        ),
      ),
    fetchOrderDate: (deliveryDate) =>
      requestScalar<string | null>(
        supabase.rpc("order_date_for_delivery_date", {
          p_delivery_date: deliveryDate,
          p_office_location_id: null,
        }),
        "Unable to resolve a late-order cycle date.",
        (value): value is string | null => value === null || isDateString(value),
      ),
    fetchDeadline: (orderDate) =>
      requestScalar<string | null>(
        supabase.rpc("order_deadline_for_order_date", { p_order_date: orderDate }),
        "Unable to load the ordering deadline.",
        (value): value is string | null => value === null || isTimestampString(value),
      ),
    fetchLunchDays: (deliveryDates) =>
      readAllPages<LunchDayRow>(
        "Unable to load saved lunch days.",
        (cursor) =>
          applyCursor(
            supabase
              .from("lunch_days")
              .select("id, provider_id, order_date, lunch_date")
              .in("lunch_date", deliveryDates)
              .not("provider_id", "is", null)
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isLunchDayRow,
      ),
    fetchLateOrders: (deliveryDates) =>
      readAllPages<LateOrderRow>(
        "Unable to load late orders.",
        (cursor) =>
          applyCursor(
            supabase
              .from("orders")
              .select("id, created_at, lunch_days!inner(lunch_date, order_date, provider_id)")
              .eq("is_late_order", true)
              .in("lunch_days.lunch_date", deliveryDates)
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isLateOrderRow,
      ),
    fetchDispatchMemberships: (deliveryDates) =>
      readAllPages<DispatchMembershipQueryRow>(
        "Unable to load late-order dispatch membership.",
        (cursor) =>
          applyCursor(
            supabase
              .from("provider_late_order_dispatch_orders")
              .select(
                "order_id, provider_late_order_dispatches!inner(provider_id, scheduled_delivery_date, status, sent_at)",
              )
              .in("provider_late_order_dispatches.scheduled_delivery_date", deliveryDates)
              .order("order_id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "order_id",
            cursor,
          ),
        (row) => row.order_id,
        isDispatchMembershipRow,
      ),
    fetchDispatches: (deliveryDates) =>
      readAllPages<DispatchRow>(
        "Unable to load late-order dispatches.",
        (cursor) =>
          applyCursor(
            supabase
              .from("provider_late_order_dispatches")
              .select(
                "id, provider_id, scheduled_delivery_date, status, dispatch_type, sent_at, error_summary, created_at, message_metadata",
              )
              .in("scheduled_delivery_date", deliveryDates)
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isDispatchRow,
      ),
    fetchOpportunities: (deliveryDates) =>
      readAllPages<OpportunityRow>(
        "Unable to load automatic late-order opportunities.",
        (cursor) =>
          applyCursor(
            supabase
              .from("provider_late_order_automatic_opportunities")
              .select(
                "id, provider_id, scheduled_delivery_date, outcome, processed_at, late_order_count",
              )
              .in("scheduled_delivery_date", deliveryDates)
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isOpportunityRow,
      ),
    fetchDisplayNames: async (orderIds) => {
      const uniqueOrderIds = [...new Set(orderIds)];
      const displayNames = new Map<string, OperationalOrderDisplayNames>();

      for (
        let offset = 0;
        offset < uniqueOrderIds.length;
        offset += OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE
      ) {
        const batch = uniqueOrderIds.slice(
          offset,
          offset + OPERATIONAL_ORDER_DISPLAY_NAME_BATCH_SIZE,
        );
        requestCount += 1;
        const batchDisplayNames = await loadOperationalOrderDisplayNames(
          supabase,
          batch,
          "admin-late-orders",
        );
        for (const [orderId, names] of batchDisplayNames) {
          displayNames.set(orderId, names);
        }
      }

      return displayNames;
    },
    fetchEmployees: () =>
      readAllPages<EmployeeRow>(
        "Unable to load employees for late orders.",
        (cursor) =>
          applyCursor(
            supabase
              .rpc("list_late_order_employee_profiles")
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isEmployeeRow,
      ).then((rows) =>
        rows.sort(
          (a, b) =>
            (a.full_name ?? "\uffff").localeCompare(b.full_name ?? "\uffff") ||
            a.email.localeCompare(b.email) ||
            a.id.localeCompare(b.id),
        ),
      ),
    fetchLocations: () =>
      readAllPages<LocationRow>(
        "Unable to load office locations.",
        (cursor) =>
          applyCursor(
            supabase
              .from("office_locations")
              .select("id, name")
              .eq("is_active", true)
              .order("id", { ascending: true })
              .limit(HR_LATE_ORDERS_PAGE_SIZE) as unknown as CursorQuery,
            "id",
            cursor,
          ),
        (row) => row.id,
        isLocationRow,
      ).then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))),
  };
}

export async function loadHrLateOrdersPageData(input: {
  source: HrLateOrdersDataSource;
  today: string;
  now: Date;
  canCreateLateOrders: boolean;
  canPreviewLateOrders?: boolean;
  onMetrics?: (metrics: HrLateOrdersLoaderMetrics) => void;
}): Promise<HrLateOrdersPageData> {
  const startedAt = performance.now();
  const phaseDurationMs = { bootstrap: 0, calendar: 0, operational: 0, hydration: 0 };
  let providerCount = 0;
  let deliveryDateCount = 0;
  let outcome: HrLateOrdersLoaderMetrics["outcome"] = "error";
  const onMetrics = input.onMetrics ?? defaultMetricsLogger;

  try {
    let phaseStartedAt = performance.now();
    const [nextDeliveryDate, providers, pendingRows] = await Promise.all([
      input.source.fetchNextDeliveryDate(input.today),
      input.source.fetchProviders(),
      input.source.fetchPendingStaffRequests(),
    ]);
    phaseDurationMs.bootstrap = elapsedMs(phaseStartedAt);
    providerCount = providers.length;

    const deliveryDates = [...new Set([input.today, nextDeliveryDate].filter(Boolean) as string[])].sort();
    deliveryDateCount = deliveryDates.length;

    const calendarStartedAt = performance.now();
    const calendarContextPromise = (async () => {
      const orderDateEntries = await Promise.all(
        deliveryDates.map(
          async (deliveryDate) =>
            [deliveryDate, await input.source.fetchOrderDate(deliveryDate)] as const,
        ),
      );
      const orderDateByDeliveryDate = Object.fromEntries(orderDateEntries) as Record<
        string,
        string | null
      >;
      const orderDates = [
        ...new Set(
          orderDateEntries.map(([, orderDate]) => orderDate).filter(Boolean) as string[],
        ),
      ];
      const needsDeadlineContext = providers.some(
        (provider) => provider.active && provider.accepts_late_orders,
      );
      const deadlineEntries = needsDeadlineContext
        ? await Promise.all(
            orderDates.map(
              async (orderDate) =>
                [orderDate, await input.source.fetchDeadline(orderDate)] as const,
            ),
          )
        : [];
      const cutoffByOrderDate = Object.fromEntries(
        deadlineEntries.map(([orderDate, deadline]) => [
          orderDate,
          deadline ? input.now.getTime() > new Date(deadline).getTime() : false,
        ]),
      ) as Record<string, boolean>;

      return { orderDateByDeliveryDate, cutoffByOrderDate };
    })().finally(() => {
      phaseDurationMs.calendar = elapsedMs(calendarStartedAt);
    });
    const operationalStartedAt = performance.now();
    const operationalRowsPromise = Promise.all([
      input.source.fetchLunchDays(deliveryDates),
      input.source.fetchLateOrders(deliveryDates),
      input.source.fetchDispatchMemberships(deliveryDates),
      input.source.fetchDispatches(deliveryDates),
      input.source.fetchOpportunities(deliveryDates),
    ]).finally(() => {
      phaseDurationMs.operational = elapsedMs(operationalStartedAt);
    });
    const [calendarContext, operationalRows] = await Promise.all([
      calendarContextPromise,
      operationalRowsPromise,
    ]);
    const { orderDateByDeliveryDate, cutoffByOrderDate } = calendarContext;

    const providerCreationCycles: Record<string, HrLateOrderCreationCycle[]> = {};
    for (const provider of providers) {
      providerCreationCycles[provider.id] = provider.active
        ? listHrLateOrderCreationCycles({
            today: input.today,
            now: input.now,
            deliveryDates,
            orderDateByDeliveryDate,
            provider: {
              acceptsLateOrders: provider.accepts_late_orders,
              lateOrderDeadlineDay: provider.late_order_deadline_day,
              lateOrderDeadlineTime: provider.late_order_deadline_time,
            },
            isCompanyCutoffPassed: (orderDate) => cutoffByOrderDate[orderDate] ?? false,
          })
        : [];
    }

    const lateOrderProviders = providers
      .filter((provider) => provider.active && provider.accepts_late_orders)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((provider) => ({ id: provider.id, name: provider.name }));
    const hasActionableCreationCycle = lateOrderProviders.some(
      (provider) => (providerCreationCycles[provider.id]?.length ?? 0) > 0,
    );

    phaseStartedAt = performance.now();
    const creationContextPromise = hasActionableCreationCycle
      ? Promise.all([
          input.canCreateLateOrders
            ? input.source.fetchEmployees()
            : Promise.resolve<EmployeeRow[]>([]),
          input.canCreateLateOrders || input.canPreviewLateOrders
            ? input.source.fetchLocations()
            : Promise.resolve<LocationRow[]>([]),
        ])
      : Promise.resolve<[EmployeeRow[], LocationRow[]]>([[], []]);
    const [lunchDays, lateOrders, membershipRows, dispatchRows, opportunityRows] = operationalRows;
    const lateOrderIds = lateOrders.map((order) => order.id);
    const [creationContext, lateOrderNames] = await Promise.all([
      creationContextPromise,
      input.source.fetchDisplayNames(lateOrderIds),
    ]);
    const [employeeRows, locationRows] = creationContext;

    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const lunchDayByPair = new Map<string, LunchDayRow>();
    for (const lunchDay of lunchDays) {
      const key = pairKey(lunchDay.provider_id, lunchDay.lunch_date);
      if (lunchDayByPair.has(key)) {
        throw new Error("Late-order lunch-day data was inconsistent.");
      }
      lunchDayByPair.set(key, lunchDay);
    }

    const lateOrdersByPair = new Map<string, LateOrderRow[]>();
    for (const order of lateOrders) {
      const lunchDay = getRelated(order.lunch_days);
      if (!lunchDay?.provider_id || !lunchDay.lunch_date) {
        throw new Error("Late-order data was incomplete.");
      }
      const key = pairKey(lunchDay.provider_id, lunchDay.lunch_date);
      lateOrdersByPair.set(key, [...(lateOrdersByPair.get(key) ?? []), order]);
    }

    const membershipsByPair = new Map<string, LateOrderDispatchMembershipRow[]>();
    for (const row of membershipRows) {
      const dispatch = getRelated(row.provider_late_order_dispatches);
      if (!dispatch?.provider_id || !dispatch.scheduled_delivery_date) {
        throw new Error("Late-order dispatch membership was incomplete.");
      }
      const key = pairKey(dispatch.provider_id, dispatch.scheduled_delivery_date);
      const mapped = {
        orderId: row.order_id,
        dispatchStatus: dispatch.status,
        sentAt: dispatch.sent_at,
      } satisfies LateOrderDispatchMembershipRow;
      membershipsByPair.set(key, [...(membershipsByPair.get(key) ?? []), mapped]);
    }

    const dispatchesByPair = new Map<string, DispatchRow[]>();
    for (const dispatch of dispatchRows) {
      const key = pairKey(dispatch.provider_id, dispatch.scheduled_delivery_date);
      dispatchesByPair.set(key, [...(dispatchesByPair.get(key) ?? []), dispatch]);
    }
    for (const rows of dispatchesByPair.values()) {
      rows.sort(compareDispatchRows);
    }

    const opportunityByPair = new Map<string, OpportunityRow>();
    for (const opportunity of opportunityRows) {
      const key = pairKey(opportunity.provider_id, opportunity.scheduled_delivery_date);
      if (opportunityByPair.has(key)) {
        throw new Error("Automatic late-order opportunity data was inconsistent.");
      }
      opportunityByPair.set(key, opportunity);
    }

    const operationalPairs = new Set<string>([
      ...lateOrdersByPair.keys(),
      ...membershipsByPair.keys(),
      ...dispatchesByPair.keys(),
      ...opportunityByPair.keys(),
    ]);
    const summaryPairs = new Set<string>();
    for (const provider of providers) {
      if (provider.active) {
        for (const deliveryDate of deliveryDates) {
          summaryPairs.add(pairKey(provider.id, deliveryDate));
        }
      }
    }
    for (const key of operationalPairs) {
      summaryPairs.add(key);
    }

    const providerSummaries: HrLateOrderProviderSummary[] = [];
    for (const key of summaryPairs) {
      const separator = key.lastIndexOf(":");
      const providerId = key.slice(0, separator);
      const deliveryDate = key.slice(separator + 1);
      const provider = providerById.get(providerId);
      const orderDate = orderDateByDeliveryDate[deliveryDate];
      if (!provider || !orderDate) {
        continue;
      }

      const deadline = cutoffByOrderDate[orderDate] ?? false;
      const lateOpen =
        provider.active &&
        isProviderLateOrderingOpen(
          {
            acceptsLateOrders: provider.accepts_late_orders,
            lateOrderDeadlineDay: provider.late_order_deadline_day,
            lateOrderDeadlineTime: provider.late_order_deadline_time,
          },
          orderDate,
          deliveryDate,
          input.now,
          deadline,
        );
      const lunchDay = lunchDayByPair.get(key);
      const snapshotMissing = !lunchDay || lunchDay.order_date !== orderDate;
      const snapshotWarning = classifyLateOrderSnapshotWarning({
        snapshotMissing,
        orderDate,
        jamaicaToday: input.today,
        deliveryDate,
      });
      const orders = [...(lateOrdersByPair.get(key) ?? [])].sort((a, b) => {
        const createdComparison = b.created_at.localeCompare(a.created_at);
        return createdComparison !== 0 ? createdComparison : a.id.localeCompare(b.id);
      });
      const ids = orders.map((order) => order.id);
      const sentByOrderId = buildSentLateOrderDispatchMap(membershipsByPair.get(key) ?? []);
      const groupDispatches = (dispatchesByPair.get(key) ?? []).slice(0, 5);
      const dispatchSummariesForOrders = groupDispatches.map((row) => ({
        status: row.status,
        messageMetadata: row.message_metadata,
      }));
      const approvedUnsent = countEligibleLateOrdersForSupplementSend(
        ids,
        sentByOrderId,
        dispatchSummariesForOrders,
      );
      const latestDispatch: SupplementDispatchRecord | null = groupDispatches[0]
        ? {
            status: groupDispatches[0].status,
            dispatchType: groupDispatches[0].dispatch_type,
            sentAt: groupDispatches[0].sent_at,
            errorSummary: groupDispatches[0].error_summary,
            createdAt: groupDispatches[0].created_at,
          }
        : null;
      const hasBlockingDispatch = groupDispatches.some(
        (row) => row.status === "pending" || row.status === "attention_required",
      );
      const automaticDue = isAutomaticSupplementDue(
        {
          supplementalDispatchMode: provider.supplemental_dispatch_mode,
          automaticSupplementSendDay: provider.automatic_supplement_send_day,
          automaticSupplementSendTime: provider.automatic_supplement_send_time,
          lateOrderDeadlineDay: provider.late_order_deadline_day,
          lateOrderDeadlineTime: provider.late_order_deadline_time,
        },
        orderDate,
        deliveryDate,
        input.now,
      );
      const opportunity = opportunityByPair.get(key);
      const automaticOpportunity = opportunity
        ? {
            outcome: opportunity.outcome,
            processedAt: opportunity.processed_at,
            lateOrderCount: opportunity.late_order_count,
          }
        : null;
      const supplementStatusLabel = formatSupplementDispatchStatusLabel({
        dispatchMode: provider.supplemental_dispatch_mode,
        approvedUnsentCount: approvedUnsent,
        lateOrderingOpen: lateOpen,
        automaticDue,
        snapshotMissing,
        latestDispatch,
        automaticOpportunity,
        now: input.now,
      });
      const attentionDispatchId =
        groupDispatches.find((row) => row.status === "attention_required")?.id ?? null;
      const summary: HrLateOrderProviderSummary = {
        providerId,
        providerName: provider.name,
        deliveryDate,
        orderDate,
        acceptsLateOrders: provider.accepts_late_orders,
        deadlineSummary: formatLateOrderDeadlineSummary(
          provider.late_order_deadline_day,
          provider.late_order_deadline_time,
        ),
        lateOrderingOpen: lateOpen,
        approvedUnsentCount: approvedUnsent,
        dispatchMode: provider.supplemental_dispatch_mode,
        automaticScheduleLabel: formatAutomaticSupplementScheduleLabel({
          supplementalDispatchMode: provider.supplemental_dispatch_mode,
          automaticSupplementSendDay: provider.automatic_supplement_send_day,
          automaticSupplementSendTime: provider.automatic_supplement_send_time,
        }),
        supplementStatusLabel,
        snapshotMissing,
        snapshotWarningMessage: snapshotWarning.message,
        hasBlockingDispatch,
        attentionDispatchId,
        primaryOrderEmail: provider.primary_order_email,
        cutoffTimeLabel: formatProviderLateOrderCutoffLabel(provider.late_order_deadline_time),
        lateOrders: orders.map((order) => ({
          id: order.id,
          employeeName: lateOrderNames.get(order.id)!.employeeName?.trim() || "Employee",
          createdAt: order.created_at,
          dispatchDisplay: resolveLateOrderRowDispatchDisplay(
            order.id,
            sentByOrderId,
            dispatchSummariesForOrders,
          ),
        })),
        lateOrderCount: orders.length,
      };

      if (
        shouldShowLateOrderProviderSummary({
          lateOrderingOpen: summary.lateOrderingOpen,
          approvedUnsentCount: summary.approvedUnsentCount,
          hasBlockingDispatch: summary.hasBlockingDispatch,
          attentionDispatchId: summary.attentionDispatchId,
          lateOrderCount: summary.lateOrderCount,
        })
      ) {
        providerSummaries.push(summary);
      }
    }

    providerSummaries.sort((a, b) => {
      if (a.deliveryDate !== b.deliveryDate) {
        return a.deliveryDate.localeCompare(b.deliveryDate);
      }
      return a.providerName.localeCompare(b.providerName);
    });

    const openDeliveryDates = [
      ...new Set(
        providerSummaries
          .filter((summary) => summary.lateOrderingOpen)
          .map((summary) => summary.deliveryDate),
      ),
    ];
    const pendingStaffRequests = pendingRows.map((row) => ({
      id: row.id,
      requesterProfileId: row.requester_profile_id,
      requesterName: row.requester_name?.trim() || "Employee",
      requesterEmail: row.requester_email.trim(),
      providerId: row.provider_id,
      providerName: row.provider_name,
      scheduledDeliveryDate: row.scheduled_delivery_date,
      requestedSummary: row.requested_summary,
      quantity: row.quantity,
      specialInstructions: row.special_instructions,
      officeLocationId: row.office_location_id,
      createdAt: row.created_at,
      fulfillmentWindowOpen: row.fulfillment_window_open,
    }));
    phaseDurationMs.hydration = elapsedMs(phaseStartedAt);
    outcome = "success";

    return {
      providerSummaries,
      lateOrderProviders,
      employees: employeeRows.map((employee) => ({
        id: employee.id,
        name: employee.full_name?.trim() || "Unnamed employee",
        email: employee.email?.trim() ?? "",
      })),
      locations: locationRows.map((location) => ({
        id: location.id,
        name: location.name,
        address: null,
        description: null,
      })),
      primaryDeliveryDate: resolvePrimaryLateOrderDeliveryDate(openDeliveryDates, input.today),
      providerCreationCycles,
      pendingStaffRequests,
    };
  } finally {
    onMetrics({
      outcome,
      totalDurationMs: elapsedMs(startedAt),
      phaseDurationMs,
      databaseRequestCount: input.source.getRequestCount(),
      providerCount,
      deliveryDateCount,
    });
  }
}

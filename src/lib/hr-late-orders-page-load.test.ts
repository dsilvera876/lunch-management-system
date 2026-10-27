import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseHrLateOrdersDataSource,
  HR_LATE_ORDERS_PAGE_SIZE,
  loadHrLateOrdersPageData,
  type HrLateOrdersDataSource,
  type HrLateOrdersLoaderMetrics,
} from "./hr-late-orders-page-load";

const TODAY = "2026-10-26";
const NEXT_DELIVERY_DATE = "2026-10-27";
const NOW = new Date("2026-10-26T18:00:00-05:00");

type FakeResponse = {
  data?: unknown;
  error?: { message: string } | null;
};

type FakeQueryState = {
  cursorColumn: string | null;
  cursor: string | null;
  orderColumn: string | null;
  limit: number | null;
};

type FakeResponseFactory = (state: FakeQueryState, readNumber: number) => FakeResponse;

class FakePostgrestQuery implements PromiseLike<FakeResponse> {
  private cursorColumn: string | null = null;
  private cursor: string | null = null;
  private orderColumn: string | null = null;
  private limitValue: number | null = null;

  constructor(
    private readonly execute: FakeResponseFactory,
    private readonly nextReadNumber: () => number,
  ) {}

  eq(): this {
    return this;
  }

  in(): this {
    return this;
  }

  not(): this {
    return this;
  }

  order(column: string): this {
    this.orderColumn = column;
    return this;
  }

  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  gt(column: string, value: string): this {
    this.cursorColumn = column;
    this.cursor = value;
    return this;
  }

  then<TResult1 = FakeResponse, TResult2 = never>(
    onfulfilled?: ((value: FakeResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const response = this.execute(
      {
        cursorColumn: this.cursorColumn,
        cursor: this.cursor,
        orderColumn: this.orderColumn,
        limit: this.limitValue,
      },
      this.nextReadNumber(),
    );
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }
}

function createFakeSupabase(factories: Record<string, FakeResponseFactory>) {
  const reads = new Map<string, number>();
  const states = new Map<string, FakeQueryState[]>();
  const buildQuery = (key: string) => {
    const factory = factories[key];
    if (!factory) {
      throw new Error(`Missing fake response factory for ${key}`);
    }
    return new FakePostgrestQuery(
      (state, readNumber) => {
        states.set(key, [...(states.get(key) ?? []), state]);
        return factory(state, readNumber);
      },
      () => {
        const next = (reads.get(key) ?? 0) + 1;
        reads.set(key, next);
        return next;
      },
    );
  };

  const client = {
    from(table: string) {
      return {
        select() {
          return buildQuery(`table:${table}`);
        },
      };
    },
    rpc(name: string) {
      return buildQuery(`rpc:${name}`);
    },
  } as unknown as SupabaseClient;

  return { client, reads, states };
}

function pageRows(
  rows: Array<Record<string, unknown>>,
  state: FakeQueryState,
): Array<Record<string, unknown>> {
  assert.ok(state.orderColumn);
  assert.equal(state.limit, HR_LATE_ORDERS_PAGE_SIZE);
  return rows
    .filter((row) =>
      state.cursor === null ? true : String(row[state.cursorColumn!]) > state.cursor,
    )
    .sort((a, b) => String(a[state.orderColumn!]).localeCompare(String(b[state.orderColumn!])))
    .slice(0, state.limit ?? undefined);
}

function pagedProvider(index: number) {
  const id = `provider-${String(index).padStart(4, "0")}`;
  return provider(id, `Provider ${String(index).padStart(4, "0")}`, false);
}

function pendingRequest(index: number) {
  const suffix = String(index).padStart(4, "0");
  return {
    id: `request-${suffix}`,
    requester_profile_id: `profile-${suffix}`,
    requester_name: `Employee ${suffix}`,
    requester_email: `employee-${suffix}@example.test`,
    provider_id: "provider-0001",
    provider_name: "Provider 0001",
    order_date: TODAY,
    scheduled_delivery_date: NEXT_DELIVERY_DATE,
    requested_summary: `Request ${suffix}`,
    quantity: 1,
    special_instructions: null,
    office_location_id: "location-0001",
    created_at: `2026-10-26T12:${String(index % 60).padStart(2, "0")}:00-05:00`,
    updated_at: `2026-10-26T12:${String(index % 60).padStart(2, "0")}:00-05:00`,
    fulfillment_window_open: true,
  };
}

type SourceOverrides = Partial<{
  providers: Awaited<ReturnType<HrLateOrdersDataSource["fetchProviders"]>>;
  pending: Awaited<ReturnType<HrLateOrdersDataSource["fetchPendingStaffRequests"]>>;
  lunchDays: Awaited<ReturnType<HrLateOrdersDataSource["fetchLunchDays"]>>;
  lateOrders: Awaited<ReturnType<HrLateOrdersDataSource["fetchLateOrders"]>>;
  memberships: Awaited<ReturnType<HrLateOrdersDataSource["fetchDispatchMemberships"]>>;
  dispatches: Awaited<ReturnType<HrLateOrdersDataSource["fetchDispatches"]>>;
  opportunities: Awaited<ReturnType<HrLateOrdersDataSource["fetchOpportunities"]>>;
  employees: Awaited<ReturnType<HrLateOrdersDataSource["fetchEmployees"]>>;
  locations: Awaited<ReturnType<HrLateOrdersDataSource["fetchLocations"]>>;
  displayNames: Awaited<ReturnType<HrLateOrdersDataSource["fetchDisplayNames"]>>;
}>;

function provider(id: string, name: string, active = true, acceptsLateOrders = false) {
  return {
    id,
    name,
    active,
    accepts_late_orders: acceptsLateOrders,
    late_order_deadline_day: acceptsLateOrders ? ("delivery_day" as const) : null,
    late_order_deadline_time: acceptsLateOrders ? "12:00:00" : null,
    supplemental_dispatch_mode: "manual" as const,
    automatic_supplement_send_day: null,
    automatic_supplement_send_time: null,
    primary_order_email: `${id}@provider.test`,
  };
}

function createSource(overrides: SourceOverrides = {}) {
  let requestCount = 0;
  let employeeCalls = 0;
  let locationCalls = 0;
  let activeOperationalReads = 0;
  let maxConcurrentOperationalReads = 0;

  const read = async <T>(value: T): Promise<T> => {
    requestCount += 1;
    return value;
  };
  const operationalRead = async <T>(value: T): Promise<T> => {
    requestCount += 1;
    activeOperationalReads += 1;
    maxConcurrentOperationalReads = Math.max(
      maxConcurrentOperationalReads,
      activeOperationalReads,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    activeOperationalReads -= 1;
    return value;
  };

  const source: HrLateOrdersDataSource = {
    getRequestCount: () => requestCount,
    fetchNextDeliveryDate: () => read(NEXT_DELIVERY_DATE),
    fetchProviders: () => read(overrides.providers ?? []),
    fetchPendingStaffRequests: () => read(overrides.pending ?? []),
    fetchOrderDate: (deliveryDate) =>
      read(deliveryDate === TODAY ? "2026-10-23" : "2026-10-26"),
    fetchDeadline: (orderDate) => read(`${orderDate}T15:00:00-05:00`),
    fetchLunchDays: () => operationalRead(overrides.lunchDays ?? []),
    fetchLateOrders: () => operationalRead(overrides.lateOrders ?? []),
    fetchDispatchMemberships: () => operationalRead(overrides.memberships ?? []),
    fetchDispatches: () => operationalRead(overrides.dispatches ?? []),
    fetchOpportunities: () => operationalRead(overrides.opportunities ?? []),
    fetchDisplayNames: (orderIds) => {
      if (orderIds.length > 0) {
        requestCount += 1;
      }
      return Promise.resolve(overrides.displayNames ?? new Map());
    },
    fetchEmployees: () => {
      employeeCalls += 1;
      return read(overrides.employees ?? []);
    },
    fetchLocations: () => {
      locationCalls += 1;
      return read(overrides.locations ?? []);
    },
  };

  return {
    source,
    employeeCalls: () => employeeCalls,
    locationCalls: () => locationCalls,
    maxConcurrentOperationalReads: () => maxConcurrentOperationalReads,
  };
}

async function load(
  source: HrLateOrdersDataSource,
  canCreateLateOrders = false,
  canPreviewLateOrders = false,
): Promise<{ data: Awaited<ReturnType<typeof loadHrLateOrdersPageData>>; metrics: HrLateOrdersLoaderMetrics }> {
  let metrics: HrLateOrdersLoaderMetrics | null = null;
  const data = await loadHrLateOrdersPageData({
    source,
    today: TODAY,
    now: NOW,
    canCreateLateOrders,
    canPreviewLateOrders,
    onMetrics: (value) => {
      metrics = value;
    },
  });

  assert.ok(metrics);
  return { data, metrics };
}

describe("HR Late Orders Supabase adapter", () => {
  it("retrieves exact and multi-page result sets with immutable cursors", async () => {
    for (const count of [HR_LATE_ORDERS_PAGE_SIZE, HR_LATE_ORDERS_PAGE_SIZE + 1, 1_001]) {
      const rows = Array.from({ length: count }, (_, index) => pagedProvider(index));
      const fake = createFakeSupabase({
        "table:lunch_providers": (state) => ({ data: pageRows(rows, state), error: null }),
      });
      const source = createSupabaseHrLateOrdersDataSource(fake.client);

      const result = await source.fetchProviders();

      assert.equal(result.length, count);
      assert.equal(new Set(result.map((row) => row.id)).size, count);
      assert.equal(fake.reads.get("table:lunch_providers"), Math.floor(count / 500) + 1);
      for (const state of fake.states.get("table:lunch_providers") ?? []) {
        assert.equal(state.orderColumn, "id");
        assert.equal(state.limit, HR_LATE_ORDERS_PAGE_SIZE);
      }
    }
  });

  it("does not shift past records when earlier rows are removed between pages", async () => {
    const rows = Array.from({ length: 502 }, (_, index) => pagedProvider(index));
    const fake = createFakeSupabase({
      "table:lunch_providers": (state, readNumber) => {
        const page = pageRows(rows, state);
        if (readNumber === 1) {
          rows.splice(
            rows.findIndex((row) => row.id === "provider-0001"),
            1,
          );
          rows.splice(
            rows.findIndex((row) => row.id === "provider-0500"),
            1,
          );
        }
        return { data: page, error: null };
      },
    });

    const result = await createSupabaseHrLateOrdersDataSource(fake.client).fetchProviders();

    assert.equal(result.length, 501);
    assert.ok(result.some((row) => row.id === "provider-0501"));
    assert.equal(new Set(result.map((row) => row.id)).size, result.length);
  });

  it("reflects a pending-row status change without offset-shifting the following row", async () => {
    const rows = Array.from({ length: 502 }, (_, index) => pendingRequest(index));
    const fake = createFakeSupabase({
      "rpc:list_pending_staff_late_order_requests_for_hr": (state, readNumber) => {
        const page = pageRows(rows, state);
        if (readNumber === 1) {
          rows.splice(
            rows.findIndex((row) => row.id === "request-0001"),
            1,
          );
          rows.splice(
            rows.findIndex((row) => row.id === "request-0500"),
            1,
          );
        }
        return { data: page, error: null };
      },
    });

    const result = await createSupabaseHrLateOrdersDataSource(
      fake.client,
    ).fetchPendingStaffRequests();

    assert.equal(result.length, 501);
    assert.ok(result.some((row) => row.id === "request-0501"));
    assert.ok(!result.some((row) => row.id === "request-0500"));
  });

  it("includes a concurrent insertion beyond the cursor without duplicating earlier rows", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => pagedProvider(index));
    const insertedAfterCursor = {
      ...pagedProvider(9_999),
      id: "provider-0499a",
      name: "Inserted after cursor",
    };
    const insertedBeforeCursor = {
      ...pagedProvider(9_998),
      id: "provider-0001a",
      name: "Inserted before cursor",
    };
    const fake = createFakeSupabase({
      "table:lunch_providers": (state, readNumber) => {
        const page = pageRows(rows, state);
        if (readNumber === 1) {
          rows.push(insertedAfterCursor, insertedBeforeCursor);
        }
        return { data: page, error: null };
      },
    });

    const result = await createSupabaseHrLateOrdersDataSource(fake.client).fetchProviders();

    assert.ok(result.some((row) => row.id === insertedAfterCursor.id));
    assert.ok(!result.some((row) => row.id === insertedBeforeCursor.id));
    assert.equal(new Set(result.map((row) => row.id)).size, result.length);
  });

  it("rejects missing, null, malformed, and duplicate paginated responses", async () => {
    const cases: Array<{ name: string; response: FakeResponse }> = [
      { name: "missing", response: { error: null } },
      { name: "null", response: { data: null, error: null } },
      { name: "non-array", response: { data: {}, error: null } },
      { name: "malformed row", response: { data: [{ id: "provider-only" }], error: null } },
      {
        name: "duplicate identifier",
        response: { data: [pagedProvider(1), pagedProvider(1)], error: null },
      },
    ];

    for (const testCase of cases) {
      const fake = createFakeSupabase({
        "table:lunch_providers": () => testCase.response,
      });
      await assert.rejects(
        createSupabaseHrLateOrdersDataSource(fake.client).fetchProviders(),
        /database response|malformed row|duplicate row identifiers/i,
        testCase.name,
      );
    }
  });

  it("rejects malformed scalar calendar results and preserves explicit query failures", async () => {
    const malformed = createFakeSupabase({
      "rpc:delivery_date_for_order_date": () => ({ data: 20261027, error: null }),
    });
    await assert.rejects(
      createSupabaseHrLateOrdersDataSource(malformed.client).fetchNextDeliveryDate(TODAY),
      /database response was invalid/i,
    );

    const failed = createFakeSupabase({
      "rpc:delivery_date_for_order_date": () => ({
        data: null,
        error: { message: "sanitized fake database error" },
      }),
    });
    await assert.rejects(
      createSupabaseHrLateOrdersDataSource(failed.client).fetchNextDeliveryDate(TODAY),
      /Unable to resolve the next late-order delivery date/,
    );
  });
});

describe("HR Late Orders request-scoped page loader", () => {
  it("keeps an empty page request count bounded as provider count grows", async () => {
    const small = createSource({
      providers: [provider("provider-1", "Provider 1"), provider("provider-2", "Provider 2")],
    });
    const large = createSource({
      providers: Array.from({ length: 30 }, (_, index) =>
        provider(`provider-${index + 1}`, `Provider ${index + 1}`),
      ),
    });

    const smallResult = await load(small.source);
    const largeResult = await load(large.source);

    assert.deepEqual(smallResult.data.providerSummaries, []);
    assert.deepEqual(largeResult.data.providerSummaries, []);
    assert.equal(smallResult.metrics.databaseRequestCount, 10);
    assert.equal(largeResult.metrics.databaseRequestCount, 10);
    assert.equal(largeResult.metrics.providerCount, 30);
    assert.equal(largeResult.metrics.deliveryDateCount, 2);
    assert.equal(large.maxConcurrentOperationalReads(), 5);
  });

  it("measures calendar and operational work independently while both run concurrently", async () => {
    const fixture = createSource();
    const originalFetchLunchDays = fixture.source.fetchLunchDays;
    fixture.source.fetchLunchDays = async (deliveryDates) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      return originalFetchLunchDays(deliveryDates);
    };

    const { metrics } = await load(fixture.source);

    assert.ok(metrics.phaseDurationMs.operational >= 40);
    assert.ok(
      metrics.phaseDurationMs.calendar < metrics.phaseDurationMs.operational,
      `calendar ${metrics.phaseDurationMs.calendar}ms should exclude operational ${metrics.phaseDurationMs.operational}ms`,
    );
  });

  it("groups operational records in memory and retains history for disabled providers", async () => {
    const activeProvider = provider("provider-active", "Active Provider");
    const disabledProvider = provider("provider-disabled", "Disabled Provider", false);
    const activeOrderId = "00000000-0000-4000-8000-000000000001";
    const disabledOrderId = "00000000-0000-4000-8000-000000000002";
    const dispatches = Array.from({ length: 6 }, (_, index) => ({
      id: `dispatch-${index}`,
      provider_id: activeProvider.id,
      scheduled_delivery_date: NEXT_DELIVERY_DATE,
      status: index === 5 ? "attention_required" : "sent",
      dispatch_type: "supplemental",
      sent_at: `2026-10-26T${17 - index}:00:00-05:00`,
      error_summary: null,
      created_at: `2026-10-26T${17 - index}:00:00-05:00`,
      message_metadata: { order_ids: [activeOrderId] },
    }));
    const fixture = createSource({
      providers: [activeProvider, disabledProvider],
      lunchDays: [
        {
          id: "day-active",
          provider_id: activeProvider.id,
          order_date: "2026-10-26",
          lunch_date: NEXT_DELIVERY_DATE,
        },
        {
          id: "day-disabled",
          provider_id: disabledProvider.id,
          order_date: "2026-10-26",
          lunch_date: NEXT_DELIVERY_DATE,
        },
      ],
      lateOrders: [
        {
          id: activeOrderId,
          created_at: "2026-10-26T16:00:00-05:00",
          lunch_days: {
            lunch_date: NEXT_DELIVERY_DATE,
            order_date: "2026-10-26",
            provider_id: activeProvider.id,
          },
        },
        {
          id: disabledOrderId,
          created_at: "2026-10-26T15:00:00-05:00",
          lunch_days: {
            lunch_date: NEXT_DELIVERY_DATE,
            order_date: "2026-10-26",
            provider_id: disabledProvider.id,
          },
        },
      ],
      memberships: [
        {
          order_id: activeOrderId,
          provider_late_order_dispatches: {
            provider_id: activeProvider.id,
            scheduled_delivery_date: NEXT_DELIVERY_DATE,
            status: "sent",
            sent_at: "2026-10-26T17:00:00-05:00",
          },
        },
      ],
      dispatches,
      opportunities: [
        {
          id: "opportunity-disabled",
          provider_id: disabledProvider.id,
          scheduled_delivery_date: NEXT_DELIVERY_DATE,
          outcome: "no_orders",
          processed_at: "2026-10-26T17:00:00-05:00",
          late_order_count: 0,
        },
      ],
      displayNames: new Map([
        [activeOrderId, { employeeName: "Renée O'Connor", lateOrderCreatedByName: null }],
        [disabledOrderId, { employeeName: "José Álvarez", lateOrderCreatedByName: null }],
      ]),
    });

    const { data } = await load(fixture.source);

    assert.deepEqual(
      data.providerSummaries.map((summary) => summary.providerName),
      ["Active Provider", "Disabled Provider"],
    );
    const activeSummary = data.providerSummaries[0]!;
    assert.equal(activeSummary.lateOrders[0]?.employeeName, "Renée O'Connor");
    assert.equal(activeSummary.lateOrders[0]?.dispatchDisplay.kind, "sent");
    assert.equal(activeSummary.attentionDispatchId, null, "only the newest five dispatches are presented");
    assert.equal(data.providerSummaries[1]?.lateOrderingOpen, false);
    assert.equal(data.providerSummaries[1]?.lateOrders[0]?.employeeName, "José Álvarez");
  });

  it("keeps blocking dispatch operations visible when no late orders exist", async () => {
    const disabledProvider = provider("provider-disabled", "Disabled Provider", false);
    const fixture = createSource({
      providers: [disabledProvider],
      dispatches: [
        {
          id: "dispatch-review",
          provider_id: disabledProvider.id,
          scheduled_delivery_date: NEXT_DELIVERY_DATE,
          status: "attention_required",
          dispatch_type: "supplemental",
          sent_at: null,
          error_summary: "Delivery outcome requires review",
          created_at: "2026-10-26T17:00:00-05:00",
          message_metadata: { order_ids: [] },
        },
      ],
    });

    const { data } = await load(fixture.source);

    assert.equal(data.providerSummaries.length, 1);
    assert.equal(data.providerSummaries[0]?.providerName, "Disabled Provider");
    assert.equal(data.providerSummaries[0]?.lateOrderCount, 0);
    assert.equal(data.providerSummaries[0]?.hasBlockingDispatch, true);
    assert.equal(data.providerSummaries[0]?.attentionDispatchId, "dispatch-review");
  });

  it("loads creation-only employee and location data for permanent HR with an actionable cycle", async () => {
    const creationProvider = provider("provider-create", "Creation Provider", true, true);
    const permanentHr = createSource({
      providers: [creationProvider],
      employees: [{ id: "employee-1", full_name: "Anne-Marie François", email: "staff@example.test" }],
      locations: [{ id: "location-1", name: "Main Office" }],
    });
    const supportMode = createSource({
      providers: [creationProvider],
      employees: [{ id: "employee-1", full_name: "Hidden Employee", email: "hidden@example.test" }],
      locations: [{ id: "location-1", name: "Hidden Location" }],
    });

    const hrResult = await load(permanentHr.source, true);
    const supportResult = await load(supportMode.source, false, true);

    assert.deepEqual(hrResult.data.employees, [
      { id: "employee-1", name: "Anne-Marie François", email: "staff@example.test" },
    ]);
    assert.equal(permanentHr.employeeCalls(), 1);
    assert.equal(permanentHr.locationCalls(), 1);
    assert.equal(hrResult.metrics.databaseRequestCount, 14);
    assert.deepEqual(supportResult.data.employees, []);
    assert.deepEqual(supportResult.data.locations, [
      {
        id: "location-1",
        name: "Hidden Location",
        address: null,
        description: null,
      },
    ]);
    assert.equal(supportMode.employeeCalls(), 0);
    assert.equal(supportMode.locationCalls(), 1);
    assert.equal(supportResult.metrics.databaseRequestCount, 13);
  });

  it("does not load creation-only data when HR has no actionable cycle", async () => {
    const fixture = createSource({
      providers: [provider("provider-closed", "Closed Provider", true, false)],
      employees: [{ id: "employee-1", full_name: "Should Not Load", email: "hidden@example.test" }],
      locations: [{ id: "location-1", name: "Should Not Load" }],
    });

    const { data } = await load(fixture.source, true);

    assert.deepEqual(data.employees, []);
    assert.deepEqual(data.locations, []);
    assert.equal(fixture.employeeCalls(), 0);
    assert.equal(fixture.locationCalls(), 0);
  });

  it("keeps the page loader read-only and makes creation depend on the permanent HR role", () => {
    const loaderSource = readFileSync(
      new URL("./hr-late-orders-page-load.ts", import.meta.url),
      "utf8",
    );
    const pageSource = readFileSync(
      new URL("../app/admin/late-orders/page.tsx", import.meta.url),
      "utf8",
    );

    assert.doesNotMatch(loaderSource, /\.(insert|update|upsert|delete)\s*\(/);
    assert.doesNotMatch(loaderSource, /\.rpc\("(?:worker_|send_|create_late_order)/);
    assert.match(pageSource, /requireViewAllOrders\(\)/);
    assert.match(pageSource, /canCreateLateOrders:\s*profile\.role === "hr"/);
    assert.match(pageSource, /canPreviewLateOrders:\s*profile\.role !== "hr"/);
  });

  it("provides an accessible immediate loading boundary", () => {
    const source = readFileSync(
      new URL("../app/admin/late-orders/loading.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /aria-busy="true"/);
    assert.match(source, /role="status"/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /Loading late-order workspace/);
    assert.match(source, /motion-safe:animate-pulse/);
  });
});

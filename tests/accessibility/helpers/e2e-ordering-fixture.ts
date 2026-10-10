import fs from "node:fs";
import path from "node:path";
import { STAFF_SEED } from "./seed-fixtures";
import { runLocalDbExec, runLocalDbQuery } from "./e2e-local-db";

/** Extended cutoff for deterministic Staff E2E (local only). */
export const E2E_ORDER_CUTOFF = "23:59:00";

/** Legacy label — late-order fixture sets cutoff to one minute before Jamaica now (local E2E only). */
export const E2E_LATE_ORDER_ELIGIBILITY_CUTOFF = "10:00:00";

/** Provider late cutoff within delivery-day noon cap (local E2E only). */
export const E2E_LATE_ORDER_PROVIDER_DEADLINE_TIME = "12:00:00";

/** Traceable manual calendar rows created by the fixture (local DB only). */
export const E2E_CALENDAR_ENTRY_IDS = {
  globalOverrideOpen: "00000001-e2e0-4001-8001-000000000001",
  staff1LocationOverrideOpen: "00000002-e2e0-4002-8002-000000000002",
} as const;

/** Development seed: staff1 default office location. */
export const E2E_STAFF1_OFFICE_LOCATION_ID = "20000001-0001-4001-8001-000000000001";

/** Development seed: staff1 profile id (staff1@lunch.test). */
export const E2E_STAFF1_PROFILE_ID = "10000004-0004-4004-8004-000000000004";

/** Development seed: HR profile used for calendar created_by when required. */
export const E2E_HR_PROFILE_ID = "10000003-0003-4003-8003-000000000003";

const SNAPSHOT_FILE = path.join(__dirname, "..", ".auth", "e2e-ordering-fixture-snapshot.json");

/** Set during Playwright global setup; integration tests must not tear down the shared snapshot. */
const PLAYWRIGHT_ORDERING_LOCK_FILE = path.join(
  __dirname,
  "..",
  ".auth",
  "playwright-ordering-lock",
);

/** Isolated restore payload for late-order drawer tests (survives ordering snapshot teardown). */
const LATE_ORDER_DRAWER_RESTORE_FILE = path.join(
  __dirname,
  "..",
  ".auth",
  "late-order-drawer-restore.json",
);

export type LateOrderDrawerRestorePayload = {
  version: 1;
  orderCutoffTime: string;
  provider: LunchProviderLateOrderSnapshot;
};

export const FIXTURE_SNAPSHOT_PATH = SNAPSHOT_FILE;

export type CalendarEntrySnapshot = {
  id: string;
  calendar_date: string;
  entry_type: string;
  scope: string;
  office_location_id: string | null;
  name: string;
  notes: string | null;
  source: string;
  archived_at: string | null;
};

export type LunchPeriodSnapshot = {
  id: string;
  status: string;
  is_current: boolean;
};

export type LunchProviderLateOrderSnapshot = {
  id: string;
  accepts_late_orders: boolean;
  late_order_deadline_day: string | null;
  late_order_deadline_time: string | null;
};

export type E2eOrderingFixtureSnapshot = {
  version: 1;
  supabaseApiUrl: string;
  orderDate: string;
  isoWeekday: number | null;
  appSettings: {
    order_cutoff_time: string;
  };
  /** Active global override row replaced by fixture, if any. */
  replacedGlobalOverride: CalendarEntrySnapshot | null;
  /** Active location override row replaced for staff1 location, if any. */
  replacedLocationOverride: CalendarEntrySnapshot | null;
  /** Fixture inserted calendar row ids (removed on teardown). */
  insertedCalendarEntryIds: string[];
  /** Period rows whose status was changed from finalized → open. */
  lunchPeriodRestores: LunchPeriodSnapshot[];
  /** Provider late-order settings restored on teardown when late-order drawer fixture runs. */
  lateOrderProviderRestores?: LunchProviderLateOrderSnapshot[];
  /** When set, fixture applied E2E_LATE_ORDER_ELIGIBILITY_CUTOFF after ordering-open setup. */
  lateOrderEligibilityCutoffApplied?: string | null;
  /** Exact app_settings.order_cutoff_time before late-order drawer fixture (restored after late-order tests). */
  lateOrderCutoffRestore?: string | null;
};

export function loadLocalEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    loadEnvFile(path.join(process.cwd(), name));
  }
}

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** Fail closed: only explicit loopback Supabase API hosts. */
export function isLocalSupabaseApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function readFixtureSnapshot(): E2eOrderingFixtureSnapshot | null {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) as E2eOrderingFixtureSnapshot;
  } catch {
    return null;
  }
}

export function writeFixtureSnapshot(snapshot: E2eOrderingFixtureSnapshot) {
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), "utf8");
}

export function clearFixtureSnapshotFile() {
  if (fs.existsSync(SNAPSHOT_FILE)) {
    fs.unlinkSync(SNAPSHOT_FILE);
  }
}

export function markPlaywrightOrderingFixtureActive() {
  fs.mkdirSync(path.dirname(PLAYWRIGHT_ORDERING_LOCK_FILE), { recursive: true });
  fs.writeFileSync(PLAYWRIGHT_ORDERING_LOCK_FILE, "1", "utf8");
}

export function clearPlaywrightOrderingFixtureLock() {
  if (fs.existsSync(PLAYWRIGHT_ORDERING_LOCK_FILE)) {
    fs.unlinkSync(PLAYWRIGHT_ORDERING_LOCK_FILE);
  }
}

/** True while `test:a11y` global setup owns the ordering snapshot (local E2E only). */
export function isPlaywrightOrderingFixtureActive(): boolean {
  return fs.existsSync(PLAYWRIGHT_ORDERING_LOCK_FILE);
}

/**
 * Ensures open self-service ordering for Playwright after any harness restored seed cutoff.
 * No-op when ordering is already open with an active snapshot.
 */
export function ensureLocalStaffOrderingFixtureForPlaywright(): void {
  loadLocalEnvFiles();

  if (
    process.env.PLAYWRIGHT_MOST_POPULAR_ONLY === "1" ||
    process.env.PLAYWRIGHT_MENU_ITEM_RATINGS_ONLY === "1"
  ) {
    return;
  }

  const supabaseApiUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";

  if (!supabaseApiUrl || !isLocalSupabaseApiUrl(supabaseApiUrl)) {
    return;
  }

  const orderDate = normalizeDate(
    runLocalDbQuery("select public.jamaica_today_date() as d")[0]?.d,
  );
  const probe = probeSelfServiceOrderingState(orderDate, E2E_STAFF1_OFFICE_LOCATION_ID);
  const snapshot = readFixtureSnapshot();

  if (probe.isOpen && snapshot) {
    return;
  }

  if (snapshot) {
    restoreLocalStaffOrderingFixture(snapshot);
    clearFixtureSnapshotFile();
  } else if (probe.isOpen) {
    return;
  }

  applyLocalStaffOrderingFixture();
  markPlaywrightOrderingFixtureActive();
}

function sqlString(value: string | null): string {
  if (value === null) {
    return "null";
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeDate(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  throw new Error(`Unexpected date value: ${String(value)}`);
}

function fetchCalendarOverride(
  orderDate: string,
  scope: "global" | "location",
  officeLocationId: string | null,
): CalendarEntrySnapshot | null {
  const locationFilter =
    scope === "global"
      ? "and office_location_id is null"
      : `and office_location_id = '${officeLocationId}'::uuid`;

  const rows = runLocalDbQuery(`
    select id, calendar_date, entry_type, scope, office_location_id, name, notes, source, archived_at
    from private.business_calendar_entries
    where calendar_date = '${orderDate}'::date
      and scope = '${scope}'
      ${locationFilter}
      and archived_at is null
      and entry_type in ('override_open', 'override_closed')
    limit 1
  `);

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  return {
    id: String(row.id),
    calendar_date: normalizeDate(row.calendar_date),
    entry_type: String(row.entry_type),
    scope: String(row.scope),
    office_location_id: row.office_location_id ? String(row.office_location_id) : null,
    name: String(row.name),
    notes: row.notes ? String(row.notes) : null,
    source: String(row.source),
    archived_at: row.archived_at ? String(row.archived_at) : null,
  };
}

function fetchFinalizedPeriodsForDate(orderDate: string): LunchPeriodSnapshot[] {
  const rows = runLocalDbQuery(`
    select id, status, is_current
    from public.lunch_periods
    where '${orderDate}'::date between start_date and end_date
      and status = 'finalized'
  `);

  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    is_current: Boolean(row.is_current),
  }));
}

export type SelfServiceOrderingProbe = {
  orderDate: string;
  isoWeekday: number | null;
  isBusinessDay: boolean;
  isOpen: boolean;
  periodFinalized: boolean;
};

export function probeSelfServiceOrderingState(
  orderDate: string,
  officeLocationId: string | null,
): SelfServiceOrderingProbe {
  const locationArg = officeLocationId ? `'${officeLocationId}'::uuid` : "null";
  const rows = runLocalDbQuery(`
    select
      public.iso_weekday('${orderDate}'::date) as iso_weekday,
      public.is_business_day('${orderDate}'::date, ${locationArg}) as is_business_day,
      s.is_open,
      s.period_finalized
    from public.get_self_service_ordering_state('${orderDate}'::date, ${locationArg}) s
  `);

  const row = rows[0] ?? {};
  return {
    orderDate,
    isoWeekday: row.iso_weekday == null ? null : Number(row.iso_weekday),
    isBusinessDay: row.is_business_day === true || row.is_business_day === "t",
    isOpen: row.is_open === true || row.is_open === "t",
    periodFinalized: row.period_finalized === true || row.period_finalized === "t",
  };
}

/** Pure plan used by unit tests (no DB). */
export function planSelfServiceOrderingFix(input: {
  isoWeekday: number | null;
  isBusinessDayBeforeFixture: boolean;
  periodFinalizedBeforeFixture: boolean;
  cutoffBefore: string;
}): {
  needsGlobalOverrideOpen: boolean;
  needsCutoffExtension: boolean;
  needsPeriodUnfinalize: boolean;
  canBeOpenAfterFixture: boolean;
  blockReason?: "iso_weekday";
} {
  const needsCutoffExtension = input.cutoffBefore !== E2E_ORDER_CUTOFF;
  const needsGlobalOverrideOpen = !input.isBusinessDayBeforeFixture;
  const needsPeriodUnfinalize = input.periodFinalizedBeforeFixture;
  const canBeOpenAfterFixture = input.isoWeekday !== null;

  return {
    needsGlobalOverrideOpen,
    needsCutoffExtension,
    needsPeriodUnfinalize,
    canBeOpenAfterFixture,
    blockReason: canBeOpenAfterFixture ? undefined : "iso_weekday",
  };
}

function archiveCalendarEntry(id: string) {
  runLocalDbQuery(`
    update private.business_calendar_entries
    set archived_at = now(), archived_by = '${E2E_HR_PROFILE_ID}'::uuid
    where id = '${id}'::uuid and archived_at is null
    returning id
  `);
}

function insertOverrideOpen(params: {
  id: string;
  orderDate: string;
  scope: "global" | "location";
  officeLocationId: string | null;
  name: string;
}) {
  const locationSql =
    params.scope === "global" ? "null" : `'${params.officeLocationId}'::uuid`;

  runLocalDbQuery(`
    insert into private.business_calendar_entries (
      id, calendar_date, entry_type, scope, office_location_id, name, notes, source,
      created_by, updated_by
    )
    values (
      '${params.id}'::uuid,
      '${params.orderDate}'::date,
      'override_open',
      '${params.scope}',
      ${locationSql},
      ${sqlString(params.name)},
      'Staff accessibility E2E fixture (local only)',
      'manual',
      '${E2E_HR_PROFILE_ID}'::uuid,
      '${E2E_HR_PROFILE_ID}'::uuid
    )
    on conflict (id) do update set
      entry_type = 'override_open',
      archived_at = null,
      archived_by = null,
      name = excluded.name,
      notes = excluded.notes,
      updated_by = excluded.updated_by,
      updated_at = now()
    returning id
  `);
}

function ensureOverrideOpen(params: {
  orderDate: string;
  scope: "global" | "location";
  officeLocationId: string | null;
  fixtureEntryId: string;
  snapshot: E2eOrderingFixtureSnapshot;
}) {
  const existing = fetchCalendarOverride(params.orderDate, params.scope, params.officeLocationId);

  if (existing?.entry_type === "override_open") {
    return;
  }

  if (existing) {
    if (params.scope === "global") {
      params.snapshot.replacedGlobalOverride = existing;
    } else {
      params.snapshot.replacedLocationOverride = existing;
    }
    writeFixtureSnapshot(params.snapshot);
    archiveCalendarEntry(existing.id);
  }

  insertOverrideOpen({
    id: params.fixtureEntryId,
    orderDate: params.orderDate,
    scope: params.scope,
    officeLocationId: params.officeLocationId,
    name: "E2E ordering open override",
  });
  params.snapshot.insertedCalendarEntryIds.push(params.fixtureEntryId);
  writeFixtureSnapshot(params.snapshot);
}

function applyCalendarAndPeriodFixtures(orderDate: string, snapshot: E2eOrderingFixtureSnapshot) {
  const globalBusinessDay = runLocalDbQuery(`
    select public.is_business_day('${orderDate}'::date, null) as open
  `)[0];
  const locationBusinessDay = runLocalDbQuery(`
    select public.is_business_day('${orderDate}'::date, '${E2E_STAFF1_OFFICE_LOCATION_ID}'::uuid) as open
  `)[0];

  if (globalBusinessDay?.open !== true && globalBusinessDay?.open !== "t") {
    ensureOverrideOpen({
      orderDate,
      scope: "global",
      officeLocationId: null,
      fixtureEntryId: E2E_CALENDAR_ENTRY_IDS.globalOverrideOpen,
      snapshot,
    });
  }

  if (locationBusinessDay?.open !== true && locationBusinessDay?.open !== "t") {
    ensureOverrideOpen({
      orderDate,
      scope: "location",
      officeLocationId: E2E_STAFF1_OFFICE_LOCATION_ID,
      fixtureEntryId: E2E_CALENDAR_ENTRY_IDS.staff1LocationOverrideOpen,
      snapshot,
    });
  }

  const finalized = fetchFinalizedPeriodsForDate(orderDate);
  for (const period of finalized) {
    snapshot.lunchPeriodRestores.push(period);
    writeFixtureSnapshot(snapshot);
    runLocalDbExec(`
      select set_config('app.allow_lunch_period_write', 'true', true);
      update public.lunch_periods
      set status = 'open', updated_by = '${E2E_HR_PROFILE_ID}'::uuid
      where id = '${period.id}'::uuid;
      select set_config('app.allow_lunch_period_write', '', true);
    `);
  }
}

function normalizeCutoffTime(value: unknown): string {
  if (typeof value !== "string" || !value) {
    return "16:00:00";
  }
  return value.length >= 8 ? value.slice(0, 8) : value;
}

function readLateOrderDrawerRestorePayload(): LateOrderDrawerRestorePayload | null {
  if (!fs.existsSync(LATE_ORDER_DRAWER_RESTORE_FILE)) {
    return null;
  }
  try {
    return JSON.parse(
      fs.readFileSync(LATE_ORDER_DRAWER_RESTORE_FILE, "utf8"),
    ) as LateOrderDrawerRestorePayload;
  } catch {
    return null;
  }
}

function writeLateOrderDrawerRestorePayload(payload: LateOrderDrawerRestorePayload) {
  fs.mkdirSync(path.dirname(LATE_ORDER_DRAWER_RESTORE_FILE), { recursive: true });
  fs.writeFileSync(LATE_ORDER_DRAWER_RESTORE_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function clearLateOrderDrawerRestorePayload() {
  if (fs.existsSync(LATE_ORDER_DRAWER_RESTORE_FILE)) {
    fs.unlinkSync(LATE_ORDER_DRAWER_RESTORE_FILE);
  }
}

function captureLateOrderDrawerRestorePayload(): LateOrderDrawerRestorePayload {
  const providerId = STAFF_SEED.providerAlberries;
  const rows = runLocalDbQuery(`
    select
      accepts_late_orders,
      late_order_deadline_day::text as late_order_deadline_day,
      late_order_deadline_time::text as late_order_deadline_time
    from public.lunch_providers
    where id = '${providerId}'::uuid
  `);
  const row = rows[0];
  if (!row) {
    throw new Error(`[a11y fixture] Missing seed provider ${providerId} for late-order drawer setup.`);
  }

  const cutoffRow = runLocalDbQuery(
    "select order_cutoff_time::text as t from public.app_settings where id = 1",
  )[0];

  return {
    version: 1,
    orderCutoffTime: normalizeCutoffTime(cutoffRow?.t),
    provider: {
      id: providerId,
      accepts_late_orders: row.accepts_late_orders === true || row.accepts_late_orders === "t",
      late_order_deadline_day: row.late_order_deadline_day
        ? String(row.late_order_deadline_day)
        : null,
      late_order_deadline_time: row.late_order_deadline_time
        ? String(row.late_order_deadline_time).slice(0, 8)
        : null,
    },
  };
}

function applyLateOrderDrawerDbChanges() {
  const providerId = STAFF_SEED.providerAlberries;
  runLocalDbQuery(`
    update public.lunch_providers
    set
      accepts_late_orders = true,
      late_order_deadline_day = 'delivery_day',
      late_order_deadline_time = '${E2E_LATE_ORDER_PROVIDER_DEADLINE_TIME}'::time
    where id = '${providerId}'::uuid
    returning id
  `);
  runLocalDbQuery(`
    update public.app_settings
    set order_cutoff_time = (
      select ((timezone('America/Jamaica', now()))::time - interval '1 minute')::time
    )
    where id = 1
    returning id
  `);

  const orderDate = normalizeDate(
    runLocalDbQuery("select public.jamaica_today_date() as d")[0]?.d,
  );
  const orderingAfterCutoff = probeSelfServiceOrderingState(
    orderDate,
    E2E_STAFF1_OFFICE_LOCATION_ID,
  );
  if (orderingAfterCutoff.isOpen) {
    throw new Error(
      "[a11y fixture] Late-order drawer setup expected self-service ordering to be closed after moving cutoff into the past.",
    );
  }

  const availability = runLocalDbQuery(`
    select public.staff_late_order_new_request_available() as available
    from (
      select set_config(
        'request.jwt.claims',
        '{"sub":"${E2E_STAFF1_PROFILE_ID}","role":"authenticated"}',
        true
      )
    ) as _cfg
  `);
  const available =
    availability[0]?.available === true || availability[0]?.available === "t";
  if (!available) {
    throw new Error(
      "[a11y fixture] Late-order drawer setup did not produce a staff1 late-order opportunity.",
    );
  }
}

function restoreLateOrderDrawerFromPayload(payload: LateOrderDrawerRestorePayload) {
  const provider = payload.provider;
  runLocalDbQuery(`
    update public.lunch_providers
    set
      accepts_late_orders = ${provider.accepts_late_orders ? "true" : "false"},
      late_order_deadline_day = ${provider.late_order_deadline_day ? sqlString(provider.late_order_deadline_day) : "null"},
      late_order_deadline_time = ${
        provider.late_order_deadline_time
          ? `${sqlString(provider.late_order_deadline_time)}::time`
          : "null"
      }
    where id = '${provider.id}'::uuid
    returning id
  `);
  runLocalDbQuery(`
    update public.app_settings
    set order_cutoff_time = ${sqlString(payload.orderCutoffTime)}::time
    where id = 1
    returning id
  `);
}

function applyCutoffFixture(snapshot: E2eOrderingFixtureSnapshot) {
  if (snapshot.appSettings.order_cutoff_time === E2E_ORDER_CUTOFF) {
    return;
  }
  runLocalDbQuery(`
    update public.app_settings
    set order_cutoff_time = '${E2E_ORDER_CUTOFF}'::time
    where id = 1
    returning id
  `);
  writeFixtureSnapshot(snapshot);
}

/**
 * Prepare local Staff ordering for E2E. Mutates **local DB only**; snapshots all changes.
 * Throws when host is not loopback or ordering cannot open (Jamaica weekend).
 */
export function applyLocalStaffOrderingFixture(): E2eOrderingFixtureSnapshot {
  loadLocalEnvFiles();

  const supabaseApiUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";

  if (!supabaseApiUrl || !isLocalSupabaseApiUrl(supabaseApiUrl)) {
    throw new Error(
      "[a11y fixture] Refusing to prepare ordering fixture — NEXT_PUBLIC_SUPABASE_URL must be loopback (localhost, 127.0.0.1, or ::1).",
    );
  }

  if (readFixtureSnapshot()) {
    throw new Error(
      "[a11y fixture] Snapshot already exists — run global teardown first or delete tests/accessibility/.auth/e2e-ordering-fixture-snapshot.json",
    );
  }

  const orderDate = normalizeDate(
    runLocalDbQuery("select public.jamaica_today_date() as d")[0]?.d,
  );

  const cutoffRow = runLocalDbQuery(
    "select order_cutoff_time::text as t from public.app_settings where id = 1",
  )[0];
  const cutoff = String(cutoffRow?.t ?? "16:00:00");

  const before = probeSelfServiceOrderingState(orderDate, E2E_STAFF1_OFFICE_LOCATION_ID);

  const snapshot: E2eOrderingFixtureSnapshot = {
    version: 1,
    supabaseApiUrl,
    orderDate,
    isoWeekday: before.isoWeekday,
    appSettings: { order_cutoff_time: cutoff },
    replacedGlobalOverride: null,
    replacedLocationOverride: null,
    insertedCalendarEntryIds: [],
    lunchPeriodRestores: [],
  };

  if (before.isoWeekday === null) {
    throw new Error(
      `[a11y fixture] Jamaica today (${orderDate}) is Sat/Sun — self-service ordering cannot open (iso_weekday guard). Run test:a11y Mon–Fri or see tests/accessibility/README.md.`,
    );
  }

  writeFixtureSnapshot(snapshot);

  try {
    applyCutoffFixture(snapshot);
    applyCalendarAndPeriodFixtures(orderDate, snapshot);
    writeFixtureSnapshot(snapshot);

    const after = probeSelfServiceOrderingState(orderDate, E2E_STAFF1_OFFICE_LOCATION_ID);
    if (!after.isOpen) {
      throw new Error(
        `[a11y fixture] Ordering still closed after fixture (businessDay=${after.isBusinessDay}, periodFinalized=${after.periodFinalized}, isoWeekday=${after.isoWeekday}).`,
      );
    }

  } catch (error) {
    try {
      restoreLocalStaffOrderingFixture(snapshot);
    } catch (restoreError) {
      console.error(
        "[a11y fixture] Rollback failed after apply error — snapshot retained at",
        SNAPSHOT_FILE,
        restoreError,
      );
      throw error;
    }
    clearFixtureSnapshotFile();
    throw error;
  }

  return snapshot;
}

export function restoreLocalStaffOrderingFixture(snapshot: E2eOrderingFixtureSnapshot) {
  runLocalDbQuery(`
    update public.app_settings
    set order_cutoff_time = ${sqlString(snapshot.appSettings.order_cutoff_time)}::time
    where id = 1
    returning id
  `);

  for (const entryId of snapshot.insertedCalendarEntryIds) {
    runLocalDbQuery(`
      delete from private.business_calendar_entries where id = '${entryId}'::uuid returning id
    `);
  }

  const restoreOverride = (previous: CalendarEntrySnapshot | null) => {
    if (!previous) {
      return;
    }
    runLocalDbExec(`
      insert into private.business_calendar_entries (
        id, calendar_date, entry_type, scope, office_location_id, name, notes, source,
        created_by, updated_by, archived_at, archived_by
      )
      values (
        '${previous.id}'::uuid,
        '${previous.calendar_date}'::date,
        ${sqlString(previous.entry_type)},
        ${sqlString(previous.scope)},
        ${previous.office_location_id ? `'${previous.office_location_id}'::uuid` : "null"},
        ${sqlString(previous.name)},
        ${previous.notes ? sqlString(previous.notes) : "null"},
        ${sqlString(previous.source)},
        '${E2E_HR_PROFILE_ID}'::uuid,
        '${E2E_HR_PROFILE_ID}'::uuid,
        ${previous.archived_at ? sqlString(previous.archived_at) : "null"},
        null
      )
      on conflict (id) do update set
        entry_type = excluded.entry_type,
        name = excluded.name,
        notes = excluded.notes,
        archived_at = excluded.archived_at,
        updated_by = excluded.updated_by,
        updated_at = now()
    `);
  };

  restoreOverride(snapshot.replacedGlobalOverride);
  restoreOverride(snapshot.replacedLocationOverride);

  for (const period of snapshot.lunchPeriodRestores) {
    runLocalDbExec(`
      select set_config('app.allow_lunch_period_write', 'true', true);
      update public.lunch_periods
      set status = ${sqlString(period.status)}, updated_by = '${E2E_HR_PROFILE_ID}'::uuid
      where id = '${period.id}'::uuid;
      select set_config('app.allow_lunch_period_write', '', true);
    `);
  }
}

/** Applies late-order drawer setup after open-ordering tests (local E2E only). */
export function applyLateOrderDrawerToActiveSnapshot(): void {
  if (readLateOrderDrawerRestorePayload()) {
    return;
  }

  const restorePayload = captureLateOrderDrawerRestorePayload();
  writeLateOrderDrawerRestorePayload(restorePayload);
  try {
    applyLateOrderDrawerDbChanges();
  } catch (error) {
    restoreLateOrderDrawerFromPayload(restorePayload);
    clearLateOrderDrawerRestorePayload();
    throw error;
  }
}

/** Restores exact provider/cutoff values captured before the late-order drawer fixture. */
export function restoreLateOrderDrawerFromActiveSnapshot(): void {
  const payload = readLateOrderDrawerRestorePayload();
  if (!payload) {
    return;
  }

  restoreLateOrderDrawerFromPayload(payload);
  clearLateOrderDrawerRestorePayload();
}

export function teardownLocalStaffOrderingFixture() {
  restoreLateOrderSubmissionEditFixture();
  restoreLateOrderDrawerFromActiveSnapshot();

  const snapshot = readFixtureSnapshot();
  if (!snapshot) {
    return;
  }

  restoreLocalStaffOrderingFixture(snapshot);
  clearFixtureSnapshotFile();
  clearPlaywrightOrderingFixtureLock();
}

/** Traceable pending submission rows for My Orders edit-modal E2E (local DB only). */
export const E2E_LATE_ORDER_SUBMISSION_EDIT_FIXTURE_IDS = {
  requestA: "00000001-e2e0-4003-8003-000000000001",
  requestB: "00000002-e2e0-4004-8004-000000000002",
} as const;

export const E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES = {
  A: "E2E edit fixture A",
  B: "E2E edit fixture B",
} as const;

const LATE_ORDER_SUBMISSION_EDIT_CUTOFF_RESTORE_FILE = path.join(
  __dirname,
  "..",
  ".auth",
  "e2e-late-order-submission-edit-cutoff-restore.json",
);

type LateOrderSubmissionEditCutoffRestore = {
  orderCutoffTime: string;
};

function readLateOrderSubmissionEditCutoffRestore(): LateOrderSubmissionEditCutoffRestore | null {
  if (!fs.existsSync(LATE_ORDER_SUBMISSION_EDIT_CUTOFF_RESTORE_FILE)) {
    return null;
  }
  return JSON.parse(
    fs.readFileSync(LATE_ORDER_SUBMISSION_EDIT_CUTOFF_RESTORE_FILE, "utf8"),
  ) as LateOrderSubmissionEditCutoffRestore;
}

function writeLateOrderSubmissionEditCutoffRestore(payload: LateOrderSubmissionEditCutoffRestore) {
  fs.mkdirSync(path.dirname(LATE_ORDER_SUBMISSION_EDIT_CUTOFF_RESTORE_FILE), { recursive: true });
  fs.writeFileSync(
    LATE_ORDER_SUBMISSION_EDIT_CUTOFF_RESTORE_FILE,
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

function clearLateOrderSubmissionEditCutoffRestore() {
  if (fs.existsSync(LATE_ORDER_SUBMISSION_EDIT_CUTOFF_RESTORE_FILE)) {
    fs.unlinkSync(LATE_ORDER_SUBMISSION_EDIT_CUTOFF_RESTORE_FILE);
  }
}

function ensureLateOrderSubmissionEditWindowOpen(): void {
  if (readLateOrderSubmissionEditCutoffRestore()) {
    return;
  }

  const cutoffRow = runLocalDbQuery(
    "select order_cutoff_time::text as t from public.app_settings where id = 1",
  )[0];
  writeLateOrderSubmissionEditCutoffRestore({
    orderCutoffTime: normalizeCutoffTime(cutoffRow?.t),
  });

  runLocalDbQuery(`
    update public.app_settings
    set order_cutoff_time = (
      select ((timezone('America/Jamaica', now()))::time - interval '1 minute')::time
    )
    where id = 1
    returning id
  `);

  for (const providerId of [STAFF_SEED.providerAlberries, STAFF_SEED.providerDavis]) {
    runLocalDbQuery(`
      update public.lunch_providers
      set
        accepts_late_orders = true,
        late_order_deadline_day = 'delivery_day',
        late_order_deadline_time = '${E2E_LATE_ORDER_PROVIDER_DEADLINE_TIME}'::time
      where id = '${providerId}'::uuid
      returning id
    `);
  }
}

function restoreLateOrderSubmissionEditWindow(): void {
  const payload = readLateOrderSubmissionEditCutoffRestore();
  if (!payload) {
    return;
  }

  runLocalDbQuery(`
    update public.app_settings
    set order_cutoff_time = ${sqlString(payload.orderCutoffTime)}::time
    where id = 1
    returning id
  `);
  clearLateOrderSubmissionEditCutoffRestore();
}

export function restoreLateOrderSubmissionEditFixture(): void {
  const ids = Object.values(E2E_LATE_ORDER_SUBMISSION_EDIT_FIXTURE_IDS);
  runLocalDbQuery(`
    delete from private.staff_late_order_requests
    where id in (${ids.map((id) => `'${id}'::uuid`).join(", ")})
    returning id
  `);
  restoreLateOrderSubmissionEditWindow();
}

export function applyLateOrderSubmissionEditFixture(): void {
  const profileId = E2E_STAFF1_PROFILE_ID;
  const officeId = E2E_STAFF1_OFFICE_LOCATION_ID;

  restoreLateOrderSubmissionEditFixture();
  ensureLateOrderSubmissionEditWindowOpen();

  const cycleRows = runLocalDbQuery(`
    with _jwt as (
      select set_config(
        'request.jwt.claims',
        '{"sub":"${profileId}","role":"authenticated"}',
        true
      )
    )
    select
      c.provider_id::text as provider_id,
      c.order_date::text as order_date,
      c.scheduled_delivery_date::text as scheduled_delivery_date
    from _jwt,
    public.list_staff_late_order_eligible_cycles('${officeId}'::uuid) c
    where c.provider_id in (
      '${STAFF_SEED.providerAlberries}'::uuid,
      '${STAFF_SEED.providerDavis}'::uuid
    )
  `);

  const cycleByProvider = new Map(
    cycleRows.map((row) => [String(row.provider_id), row]),
  );

  const fixtures = [
    {
      id: E2E_LATE_ORDER_SUBMISSION_EDIT_FIXTURE_IDS.requestA,
      providerId: STAFF_SEED.providerAlberries,
      summary: E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES.A,
      createdAt: "2099-01-01T10:00:00Z",
    },
    {
      id: E2E_LATE_ORDER_SUBMISSION_EDIT_FIXTURE_IDS.requestB,
      providerId: STAFF_SEED.providerDavis,
      summary: E2E_LATE_ORDER_SUBMISSION_EDIT_SUMMARIES.B,
      createdAt: "2099-01-02T10:00:00Z",
    },
  ];

  for (const row of fixtures) {
    const cycle = cycleByProvider.get(row.providerId);
    if (!cycle) {
      throw new Error(
        `[a11y fixture] No eligible late-order cycle for provider ${row.providerId} during edit-modal setup.`,
      );
    }
    const orderDate = normalizeDate(cycle.order_date);
    const deliveryDate = normalizeDate(cycle.scheduled_delivery_date);

    runLocalDbExec(`
      insert into private.staff_late_order_requests (
        id,
        requester_profile_id,
        provider_id,
        office_location_id,
        order_date,
        scheduled_delivery_date,
        status,
        requested_summary,
        quantity,
        created_at,
        updated_at
      )
      values (
        '${row.id}'::uuid,
        '${profileId}'::uuid,
        '${row.providerId}'::uuid,
        '${officeId}'::uuid,
        '${orderDate}'::date,
        '${deliveryDate}'::date,
        'pending',
        ${sqlString(row.summary)},
        1,
        '${row.createdAt}'::timestamptz,
        '${row.createdAt}'::timestamptz
      )
    `);
  }
}

/** Deterministic normal order on Jamaica today for HR Today's Orders modal a11y (local DB only). */
export const E2E_HR_TODAYS_ORDERS_MODAL_ORDER_ID =
  "e0100001-0001-4001-8001-000000000001";

const E2E_HR_TODAYS_ORDERS_MODAL_ORDER_GROUP_ID =
  "e0100002-0002-4002-8002-000000000002";

/** Recurring Alberries menu item ids from development seed. */
const E2E_ALBERRIES_MAIN_PROVIDER_MENU_ITEM_ID = "31000002-0002-4002-8002-000000000002";
const E2E_ALBERRIES_SIDE_PROVIDER_MENU_ITEM_ID = "31000012-0012-4012-8012-000000000012";

export function restoreHrTodaysOrdersModalFixture(): void {
  runLocalDbQuery(`
    delete from public.orders
    where id = '${E2E_HR_TODAYS_ORDERS_MODAL_ORDER_ID}'::uuid
    returning id
  `);
}

/** Inserts a submitted, pending normal staff order for Jamaica today (requires weekday + dev seed). */
/** Past delivered staff1 order + BBQ Chicken catalog item (development seed). */
export const E2E_MENU_ITEM_RATINGS_DELIVERED_ORDER_ID =
  "60000003-0003-4003-8003-000000000003";

export const E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID =
  "31000001-0001-4001-8001-000000000001";

/** Restores staff upsert RPC after local failure-injection tests (loopback DB only). */
export function ensureMenuItemRatingRpcGrantedForLocalE2e(): void {
  runLocalDbExec(`
    do $grant$
    begin
      grant execute on function public.upsert_my_menu_item_rating(uuid, integer) to authenticated;
    end;
    $grant$;
  `);
}

export function restoreMenuItemRatingsStaffE2eFixture(): void {
  ensureMenuItemRatingRpcGrantedForLocalE2e();

  runLocalDbExec(`
    do $fixture$
    begin
      update public.lunch_providers
      set ratings_enabled = false
      where id = '${STAFF_SEED.providerAlberries}'::uuid;

      delete from private.menu_item_ratings mir
      using public.provider_menu_items pmi
      where mir.provider_menu_item_id = pmi.id
        and pmi.provider_id = '${STAFF_SEED.providerAlberries}'::uuid
        and mir.profile_id = '${E2E_STAFF1_PROFILE_ID}'::uuid;

      delete from public.order_delivery_events
      where order_id = '${E2E_MENU_ITEM_RATINGS_DELIVERED_ORDER_ID}'::uuid
        and event_type = 'marked_delivered';
    end;
    $fixture$
  `);
}

/** Enables Alberries ratings + verified delivery for seeded past order (local E2E only). */
export function applyMenuItemRatingsStaffE2eFixture(): void {
  restoreMenuItemRatingsStaffE2eFixture();

  runLocalDbExec(`
    do $fixture$
    begin
      update public.lunch_providers
      set ratings_enabled = true
      where id = '${STAFF_SEED.providerAlberries}'::uuid;

      perform private.append_order_delivery_event(
        '${E2E_MENU_ITEM_RATINGS_DELIVERED_ORDER_ID}'::uuid,
        'marked_delivered'
      );
    end;
    $fixture$
  `);

  ensureMenuItemRatingRpcGrantedForLocalE2e();
}

const E2E_STAFF2_PROFILE_ID = "10000005-0005-4005-8005-000000000005";
const E2E_STAFF3_PROFILE_ID = "10000006-0006-4006-8006-000000000006";
const E2E_MP_RATER_PROFILE_IDS = [
  E2E_STAFF1_PROFILE_ID,
  E2E_STAFF2_PROFILE_ID,
  E2E_STAFF3_PROFILE_ID,
  "10000002-0002-4002-8002-000000000002",
  "10000003-0003-4003-8003-000000000003",
] as const;

/** Five distinct high ratings on BBQ Chicken for Most Popular badge E2E (local DB only). */
export function applyMostPopularMenuItemE2eFixture(): void {
  applyMenuItemRatingsStaffE2eFixture();
  restoreMostPopularMenuItemE2eFixture();

  const raterValues = E2E_MP_RATER_PROFILE_IDS.map(
    (profileId) => `('${profileId}'::uuid, 5::smallint)`,
  ).join(",\n          ");

  runLocalDbExec(`
    do $fixture$
    declare
      v_rec record;
      v_order_id uuid := '${E2E_MENU_ITEM_RATINGS_DELIVERED_ORDER_ID}'::uuid;
      v_order_item_id uuid;
      v_gen integer;
      v_provider_gen integer;
    begin
      select oi.id
      into v_order_item_id
      from public.order_items oi
      join public.menu_items mi on mi.id = oi.menu_item_id
      where oi.order_id = v_order_id
        and mi.provider_menu_item_id = '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid
      limit 1;

      select pmi.current_rating_generation, lp.current_provider_rating_generation
      into v_gen, v_provider_gen
      from public.provider_menu_items pmi
      join public.lunch_providers lp on lp.id = pmi.provider_id
      where pmi.id = '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid;

      for v_rec in
        select profile_id, stars
        from (values
          ${raterValues}
        ) as t(profile_id, stars)
      loop
        insert into private.menu_item_ratings (
          profile_id,
          provider_menu_item_id,
          provider_id,
          menu_item_generation,
          provider_rating_generation,
          stars,
          source_order_id,
          source_order_item_id,
          last_qualifying_delivery_at
        )
        values (
          v_rec.profile_id,
          '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid,
          '${STAFF_SEED.providerAlberries}'::uuid,
          v_gen,
          v_provider_gen,
          v_rec.stars,
          v_order_id,
          v_order_item_id,
          now()
        )
        on conflict do nothing;
      end loop;
    end;
    $fixture$
  `);
}

const E2E_HR_PAGINATION_EMAIL_PREFIX = "e2e-hr-page-";

/** Seeds many distinct ratings on BBQ Chicken for HR pagination E2E (local DB only). */
export function applyHrRatingsPaginationE2eFixture(ratingCount = 105): void {
  applyMenuItemRatingsStaffE2eFixture();
  restoreHrRatingsPaginationE2eFixture();

  runLocalDbExec(`
    do $fixture$
    declare
      v_i integer;
      v_profile_id uuid;
      v_order_id uuid := '${E2E_MENU_ITEM_RATINGS_DELIVERED_ORDER_ID}'::uuid;
      v_order_item_id uuid;
      v_gen integer;
      v_provider_gen integer;
    begin
      select oi.id
      into v_order_item_id
      from public.order_items oi
      join public.menu_items mi on mi.id = oi.menu_item_id
      where oi.order_id = v_order_id
        and mi.provider_menu_item_id = '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid
      limit 1;

      select pmi.current_rating_generation, lp.current_provider_rating_generation
      into v_gen, v_provider_gen
      from public.provider_menu_items pmi
      join public.lunch_providers lp on lp.id = pmi.provider_id
      where pmi.id = '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid;

      delete from private.menu_item_ratings
      where provider_menu_item_id = '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid;

      for v_i in 1..${ratingCount} loop
        v_profile_id := ('bbbb0000-0000-4000-8000-' || lpad(to_hex(v_i), 12, '0'))::uuid;
        insert into auth.users (id, email, raw_user_meta_data)
        values (
          v_profile_id,
          '${E2E_HR_PAGINATION_EMAIL_PREFIX}' || v_i::text || '@test.local',
          jsonb_build_object('full_name', 'E2E Page Staff ' || v_i::text)
        )
        on conflict (id) do nothing;

        insert into private.menu_item_ratings (
          profile_id,
          provider_menu_item_id,
          provider_id,
          menu_item_generation,
          provider_rating_generation,
          stars,
          source_order_id,
          source_order_item_id,
          last_qualifying_delivery_at,
          created_at
        )
        values (
          v_profile_id,
          '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid,
          '${STAFF_SEED.providerAlberries}'::uuid,
          v_gen,
          v_provider_gen,
          (1 + (v_i % 5))::smallint,
          v_order_id,
          v_order_item_id,
          now() - (v_i || ' minutes')::interval,
          now() - (v_i || ' minutes')::interval
        );
      end loop;
    end;
    $fixture$
  `);
}

export function restoreHrRatingsPaginationE2eFixture(): void {
  runLocalDbExec(`
    do $fixture$
    begin
      delete from private.menu_item_ratings mir
      where mir.profile_id in (
        select id from auth.users where email like '${E2E_HR_PAGINATION_EMAIL_PREFIX}%@test.local'
      );

      delete from auth.users
      where email like '${E2E_HR_PAGINATION_EMAIL_PREFIX}%@test.local';
    end;
    $fixture$
  `);
}

export function restoreMostPopularMenuItemE2eFixture(): void {
  runLocalDbExec(`
    do $fixture$
    begin
      delete from private.menu_item_ratings mir
      where mir.provider_menu_item_id = '${E2E_MENU_ITEM_RATINGS_CATALOG_ITEM_ID}'::uuid
        and mir.profile_id = any(array[
          '${E2E_STAFF1_PROFILE_ID}'::uuid,
          '${E2E_STAFF2_PROFILE_ID}'::uuid,
          '${E2E_STAFF3_PROFILE_ID}'::uuid,
          '10000002-0002-4002-8002-000000000002'::uuid,
          '10000003-0003-4003-8003-000000000003'::uuid
        ]);

    end;
    $fixture$
  `);
}

export function applyHrTodaysOrdersModalFixture(): void {
  restoreHrTodaysOrdersModalFixture();

  runLocalDbQuery(`
    delete from public.orders o
    using public.lunch_days ld
    where o.lunch_day_id = ld.id
      and ld.order_date = private.jamaica_today_date()
      and ld.provider_id = '${STAFF_SEED.providerAlberries}'::uuid
      and o.profile_id = '${E2E_STAFF1_PROFILE_ID}'::uuid
    returning o.id
  `);

  runLocalDbExec(`
    do $fixture$
    declare
      v_today date := private.jamaica_today_date();
      v_lunch_day_id uuid;
      v_main_menu_id uuid;
      v_side_menu_id uuid;
      v_location public.office_locations%rowtype;
    begin
      if extract(isodow from v_today) >= 6 then
        raise exception 'HR Today''s Orders modal fixture requires a Jamaica weekday';
      end if;

      v_lunch_day_id := private.ensure_provider_lunch_day(
        '${STAFF_SEED.providerAlberries}'::uuid,
        v_today
      );

      select mi.id
      into v_main_menu_id
      from public.menu_items mi
      where mi.lunch_day_id = v_lunch_day_id
        and mi.provider_menu_item_id = '${E2E_ALBERRIES_MAIN_PROVIDER_MENU_ITEM_ID}'::uuid;

      select mi.id
      into v_side_menu_id
      from public.menu_items mi
      where mi.lunch_day_id = v_lunch_day_id
        and mi.provider_menu_item_id = '${E2E_ALBERRIES_SIDE_PROVIDER_MENU_ITEM_ID}'::uuid;

      if v_main_menu_id is null or v_side_menu_id is null then
        raise exception 'Alberries snapshot menu missing for Jamaica today';
      end if;

      select *
      into v_location
      from public.office_locations
      where id = '${E2E_STAFF1_OFFICE_LOCATION_ID}'::uuid;

      perform private.activate_bypass_order_deadline();

      insert into public.orders (
        id,
        profile_id,
        lunch_day_id,
        status,
        delivery_state,
        financial_disposition,
        is_late_order,
        special_instructions,
        meal_quantity,
        office_location_id,
        office_location_name,
        office_location_address,
        order_group_id,
        created_at,
        updated_at
      )
      values (
        '${E2E_HR_TODAYS_ORDERS_MODAL_ORDER_ID}'::uuid,
        '${E2E_STAFF1_PROFILE_ID}'::uuid,
        v_lunch_day_id,
        'submitted',
        'pending',
        'chargeable',
        false,
        'E2E HR Today''s Orders modal fixture',
        1,
        v_location.id,
        v_location.name,
        v_location.address,
        '${E2E_HR_TODAYS_ORDERS_MODAL_ORDER_GROUP_ID}'::uuid,
        now(),
        now()
      );

      insert into public.order_items (order_id, menu_item_id, lunch_day_id, quantity, unit_price)
      values
        (
          '${E2E_HR_TODAYS_ORDERS_MODAL_ORDER_ID}'::uuid,
          v_main_menu_id,
          v_lunch_day_id,
          1,
          (select price from public.menu_items where id = v_main_menu_id)
        ),
        (
          '${E2E_HR_TODAYS_ORDERS_MODAL_ORDER_ID}'::uuid,
          v_side_menu_id,
          v_lunch_day_id,
          1,
          (select price from public.menu_items where id = v_side_menu_id)
        );
    end;
    $fixture$
  `);
}

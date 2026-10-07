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
  restoreLateOrderDrawerFromActiveSnapshot();

  const snapshot = readFixtureSnapshot();
  if (!snapshot) {
    return;
  }

  restoreLocalStaffOrderingFixture(snapshot);
  clearFixtureSnapshotFile();
}

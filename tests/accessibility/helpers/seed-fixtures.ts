/**
 * Deterministic IDs from supabase/seeds/development.sql (local dev seed only).
 * Safe to commit — not secrets.
 */
export const STAFF_SEED = {
  providerAlberries: "30000001-0001-4001-8001-000000000001",
  providerDavis: "30000002-0002-4002-8002-000000000002",
  /** Staff1 upcoming meal order (editable when ordering rules allow). */
  upcomingOrderId: "60000001-0001-4001-8001-000000000001",
} as const;

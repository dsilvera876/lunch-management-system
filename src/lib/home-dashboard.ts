import { JAMAICA_TIME_ZONE } from "@/lib/datetime";
import type { StaffFinancialDashboard } from "@/lib/financial-summaries";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentOrdersState =
  | { status: "empty" }
  | { status: "ready"; count: number; total: number };

export function getCurrentOrdersState(
  count: number,
  total: number,
): CurrentOrdersState {
  return count === 0
    ? { status: "empty" }
    : { status: "ready", count, total };
}

export type CurrentSpendState =
  | { status: "no-period"; dailySubsidy: number }
  | { status: "ready"; netDeduction: number; dailySubsidy: number };

export function getCurrentSpendState(
  dashboard: StaffFinancialDashboard,
): CurrentSpendState {
  const dailySubsidy = Number(dashboard.daily_lunch_subsidy);

  if (!dashboard.current_period) {
    return { status: "no-period", dailySubsidy };
  }

  return {
    status: "ready",
    netDeduction: Number(dashboard.current_period.net_deduction),
    dailySubsidy,
  };
}

export function getProviderSetupMessage(providerCount: number): string | null {
  return providerCount === 0 ? "No providers available" : null;
}

export function getLocationDisplay(
  activeLocationCount: number,
  defaultLocationName: string | null,
): string {
  if (activeLocationCount === 0) {
    return "No office locations configured";
  }

  return defaultLocationName ?? "Select at checkout";
}

export function getTimeOfDayGreeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: JAMAICA_TIME_ZONE,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

export function formatTimeRemainingUntilDeadline(
  deadlineIso: string | null,
  now: Date = new Date(),
): string | null {
  if (!deadlineIso) {
    return null;
  }

  const remainingMs = new Date(deadlineIso).getTime() - now.getTime();

  if (remainingMs <= 0) {
    return "Orders are closed";
  }

  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m until orders close`;
  }

  return `${minutes}m until orders close`;
}

export type LunchPeriodSpendCard = {
  label: string;
  amount: number | null;
};

export async function getLastFinalizedLunchPeriodSpend(
  supabase: SupabaseClient,
  profileId: string,
  currentPeriodId: string | null,
): Promise<LunchPeriodSpendCard | null> {
  const { data: periods } = await supabase
    .from("lunch_periods")
    .select("id, label, start_date, end_date")
    .eq("status", "finalized")
    .order("end_date", { ascending: false })
    .limit(3);

  const lastPeriod =
    periods?.find((period) => period.id !== currentPeriodId) ?? periods?.[0];

  if (!lastPeriod) {
    return null;
  }

  const { data: total } = await supabase.rpc("financial_total_for_profile", {
    p_profile_id: profileId,
    p_start_date: lastPeriod.start_date,
    p_end_date: lastPeriod.end_date,
  });

  return {
    label: lastPeriod.label,
    amount: total != null ? Number(total) : null,
  };
}

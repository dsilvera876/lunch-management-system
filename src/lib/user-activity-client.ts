export const USER_ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
export const USER_ACTIVITY_FAILURE_BACKOFF_MS = 30 * 1000;

export type UserActivityRpcRow = {
  recorded: boolean;
  last_active_at: string;
};

export type UserActivityAttemptResult =
  | "attempted"
  | "throttled"
  | "in-flight"
  | "failed";

type UserActivityRecorderOptions = {
  record: () => Promise<UserActivityRpcRow>;
  readSharedLastActiveAt: () => number | null;
  writeSharedLastActiveAt: (value: number) => void;
  now?: () => number;
};

function validSharedTimestamp(value: number | null, now: number): number | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > now) {
    return null;
  }

  return value;
}

export function readUserActivityRpcRow(value: unknown): UserActivityRpcRow {
  const row = Array.isArray(value) ? value[0] : null;

  if (
    !row ||
    typeof row !== "object" ||
    typeof (row as Record<string, unknown>).recorded !== "boolean" ||
    typeof (row as Record<string, unknown>).last_active_at !== "string" ||
    Number.isNaN(
      Date.parse(String((row as Record<string, unknown>).last_active_at)),
    )
  ) {
    throw new Error("Activity response is invalid.");
  }

  return {
    recorded: (row as Record<string, unknown>).recorded as boolean,
    last_active_at: (row as Record<string, unknown>).last_active_at as string,
  };
}

export function createUserActivityRecorder({
  record,
  readSharedLastActiveAt,
  writeSharedLastActiveAt,
  now = Date.now,
}: UserActivityRecorderOptions) {
  let inFlight = false;
  let lastActiveAt: number | null = null;
  let retryAfter = 0;

  function synchronize(value: number | null) {
    const currentTime = now();
    const valid = validSharedTimestamp(value, currentTime);
    if (valid !== null && (lastActiveAt === null || valid > lastActiveAt)) {
      lastActiveAt = valid;
    }
  }

  async function recordIfEligible(): Promise<UserActivityAttemptResult> {
    const currentTime = now();
    synchronize(readSharedLastActiveAt());

    if (inFlight) {
      return "in-flight";
    }

    if (
      currentTime < retryAfter ||
      (lastActiveAt !== null && currentTime - lastActiveAt < USER_ACTIVITY_THROTTLE_MS)
    ) {
      return "throttled";
    }

    inFlight = true;
    try {
      const response = await record();
      const serverTimestamp = Date.parse(response.last_active_at);
      if (Number.isNaN(serverTimestamp)) {
        throw new Error("Activity response timestamp is invalid.");
      }

      lastActiveAt = serverTimestamp;
      retryAfter = 0;
      writeSharedLastActiveAt(serverTimestamp);
      return "attempted";
    } catch {
      retryAfter = now() + USER_ACTIVITY_FAILURE_BACKOFF_MS;
      return "failed";
    } finally {
      inFlight = false;
    }
  }

  return {
    recordIfEligible,
    synchronize,
  };
}

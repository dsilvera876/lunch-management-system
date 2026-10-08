import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";

export type LocalDbRow = Record<string, unknown>;

/** Minimum Supabase CLI with stable `--output-format json` for `db query`. */
export const SUPABASE_DB_QUERY_MIN_CLI_VERSION = "2.116.0";

const SUPABASE_DB_QUERY_ARGS = [
  "supabase",
  "db",
  "query",
  "--local",
  "--output-format",
  "json",
  "--agent",
  "no",
] as const;

type SupabaseQueryJson = {
  rows?: LocalDbRow[];
  error?: string;
};

function shellQuoteArg(value: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function runLocalDbCommand(sql: string): string {
  const flattened = sql.replace(/\s+/g, " ").trim();
  const command = ["npx", ...SUPABASE_DB_QUERY_ARGS, flattened]
    .map(shellQuoteArg)
    .join(" ");
  let stdout: string;
  let stderr: string;
  try {
    const execOptions: ExecSyncOptionsWithStringEncoding = {
      encoding: "utf8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      ...(process.platform === "win32"
        ? { shell: process.env.ComSpec ?? "cmd.exe" }
        : {}),
    };
    stdout = execSync(command, execOptions);
    stderr = "";
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    stdout = execError.stdout ?? "";
    stderr = execError.stderr ?? "";
    const detail = [stdout, stderr, execError.message].filter(Boolean).join("\n");
    throw new Error(`[a11y local-db] supabase db query failed:\n${detail}`);
  }

  if (stderr.trim()) {
    return `${stdout}\n${stderr}`;
  }
  return stdout;
}

function parseJsonSlice<T>(output: string, start: number, end: number, label: string): T {
  if (start < 0 || end <= start) {
    throw new Error(
      `[a11y local-db] Could not find ${label} JSON in supabase db query output:\n${output.slice(0, 500)}`,
    );
  }

  const slice = output.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    throw new Error(
      `[a11y local-db] Malformed ${label} JSON from supabase db query:\n${slice.slice(0, 500)}`,
    );
  }
}

/** Parse `supabase db query --output-format json` stdout (ignores harmless CLI prefix/suffix lines). */
export function parseSupabaseDbQueryOutput(output: string): LocalDbRow[] {
  if (looksLikePrettyTableOutput(output)) {
    throw new Error(
      "[a11y local-db] Supabase CLI returned pretty-table output. " +
        "Expected JSON from explicit --output-format json (not agent auto-detection).",
    );
  }

  const arrayStart = output.indexOf("[");
  const objectStart = output.indexOf("{");

  if (arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart)) {
    const rows = parseJsonSlice<LocalDbRow[]>(
      output,
      arrayStart,
      output.lastIndexOf("]"),
      "array",
    );
    if (!Array.isArray(rows)) {
      throw new Error("[a11y local-db] JSON array response is not an array.");
    }
    return rows;
  }

  const parsed = parseJsonSlice<SupabaseQueryJson>(
    output,
    objectStart,
    output.lastIndexOf("}"),
    "object",
  );

  if (parsed.error) {
    throw new Error(`[a11y local-db] Supabase db query error: ${parsed.error}`);
  }

  if (parsed.rows === undefined) {
    throw new Error(
      `[a11y local-db] JSON object response missing \"rows\" array:\n${JSON.stringify(parsed).slice(0, 500)}`,
    );
  }

  if (!Array.isArray(parsed.rows)) {
    throw new Error("[a11y local-db] JSON \"rows\" is not an array.");
  }

  return parsed.rows;
}

function looksLikePrettyTableOutput(output: string): boolean {
  return /[┌└├│]/.test(output) && !/"rows"\s*:/.test(output);
}

/** Run SQL that returns rows (SELECT or … RETURNING). */
export function runLocalDbQuery(sql: string): LocalDbRow[] {
  const output = runLocalDbCommand(sql);
  const rows = parseSupabaseDbQueryOutput(output);

  if (rows.length > 0) {
    return rows;
  }

  if (/^(INSERT|UPDATE|DELETE)\s/i.test(sql.trim()) && !/\breturning\b/i.test(sql)) {
    throw new Error(
      `[a11y local-db] Mutation must include RETURNING for JSON parsing:\n${sql.slice(0, 120)}`,
    );
  }

  return rows;
}

/** Run SQL that does not need a result (multi-statement or void). */
export function runLocalDbExec(sql: string): void {
  const output = runLocalDbCommand(sql);
  try {
    parseSupabaseDbQueryOutput(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("missing \"rows\"")) {
      return;
    }
    const trimmed = output.trim();
    if (/^(INSERT|UPDATE|DELETE)\s+\d+/i.test(trimmed) && !/"rows"\s*:/.test(output)) {
      return;
    }
    if (/error|fatal|failed/i.test(output)) {
      throw new Error(`[a11y local-db] SQL failed:\n${output}`);
    }
    throw error;
  }
}

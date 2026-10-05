import { execSync } from "node:child_process";

export type LocalDbRow = Record<string, unknown>;

type SupabaseQueryJson = {
  rows?: LocalDbRow[];
};

function runLocalDbCommand(sql: string): string {
  return execSync(`npx supabase db query --local ${escapeSqlArg(sql)}`, {
    encoding: "utf8",
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function escapeSqlArg(sql: string): string {
  const flattened = sql.replace(/\s+/g, " ").trim();
  return JSON.stringify(flattened);
}

function parseJsonRows(output: string): LocalDbRow[] {
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return [];
  }
  const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as SupabaseQueryJson;
  return parsed.rows ?? [];
}

/** Run SQL that returns rows (SELECT or … RETURNING). */
export function runLocalDbQuery(sql: string): LocalDbRow[] {
  const output = runLocalDbCommand(sql);
  const rows = parseJsonRows(output);
  if (rows.length > 0) {
    return rows;
  }
  if (output.includes("{") && output.includes("rows")) {
    return rows;
  }
  if (/^(INSERT|UPDATE|DELETE)\s/i.test(sql.trim()) && !/\breturning\b/i.test(sql)) {
    throw new Error(
      `[a11y local-db] Mutation must include RETURNING for JSON parsing:\n${sql.slice(0, 120)}`,
    );
  }
  if (!output.includes("{")) {
    throw new Error(`[a11y local-db] Could not parse supabase db query output:\n${output}`);
  }
  return rows;
}

/** Run SQL that does not need a result (multi-statement or void). */
export function runLocalDbExec(sql: string): void {
  const output = runLocalDbCommand(sql);
  if (/error|fatal|failed/i.test(output) && !output.includes("rows")) {
    throw new Error(`[a11y local-db] SQL failed:\n${output}`);
  }
}

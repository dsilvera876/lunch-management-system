import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseSupabaseDbQueryOutput } from "./e2e-local-db";

const SAMPLE_ENVELOPE_JSON_OUTPUT = `Connecting to local database...
{
  "boundary": "abc",
  "rows": [
    { "d": "2026-10-07" }
  ],
  "warning": "untrusted"
}
A new version of Supabase CLI is available`;

const SAMPLE_ARRAY_JSON_OUTPUT = `Connecting to local database...
[
  {
    "d": "2026-10-07T00:00:00Z"
  }
]
A new version of Supabase CLI is available`;

const PRETTY_TABLE_OUTPUT = `Connecting to local database...
┌───┐
│ n │
├───┤
│ 1 │
└───┘
`;

describe("e2e-local-db supabase CLI output", () => {
  it("invokes db query with explicit json output and without agent auto mode", () => {
    const source = readFileSync("tests/accessibility/helpers/e2e-local-db.ts", "utf8");
    assert.match(source, /--output-format/);
    assert.match(source, /"json"/);
    assert.match(source, /--agent/);
    assert.match(source, /"no"/);
    assert.doesNotMatch(source, /--agent\s+auto/);
    assert.match(source, /shell:\s*process\.env\.ComSpec|shell:\s*true/);
  });

  it("parses envelope JSON stdout with harmless CLI prefix lines", () => {
    const rows = parseSupabaseDbQueryOutput(SAMPLE_ENVELOPE_JSON_OUTPUT);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.d, "2026-10-07");
  });

  it("parses bare array JSON from --agent no human-terminal output", () => {
    const rows = parseSupabaseDbQueryOutput(SAMPLE_ARRAY_JSON_OUTPUT);
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0]?.d).slice(0, 10), "2026-10-07");
  });

  it("rejects pretty-table output instead of silently mis-parsing", () => {
    assert.throws(
      () => parseSupabaseDbQueryOutput(PRETTY_TABLE_OUTPUT),
      /pretty-table output/,
    );
  });

  it("fails clearly on malformed JSON", () => {
    assert.throws(
      () => parseSupabaseDbQueryOutput('Connecting...\n{"rows": [invalid json]}'),
      /Malformed (array|object) JSON/,
    );
  });

  it("requires a rows array in JSON responses", () => {
    assert.throws(
      () => parseSupabaseDbQueryOutput('{"boundary":"x"}'),
      /missing "rows"/,
    );
  });
});

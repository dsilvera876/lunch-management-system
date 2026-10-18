import { pathToFileURL } from "node:url";

const MIN_PURPOSE_SECRET_BYTES = 32;

const KNOWN_PURPOSE_SECRET_PLACEHOLDERS = new Set([
  "change_me",
  "changeme",
  "replace_me",
  "replace_with_at_least_32_random_bytes",
  "replace_with_a_cryptographically_random_secret",
]);

function requiredValue(environment, name) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`missing ${name}`);
  }

  return value;
}

export function validateWebPrivilegedEnv(environment = process.env) {
  const supabaseUrl = requiredValue(environment, "SUPABASE_URL");
  requiredValue(environment, "SUPABASE_SECRET_KEY");
  const purposeSecret = requiredValue(
    environment,
    "ACCOUNT_SETUP_RECOVERY_PURPOSE_SECRET",
  );
  const publicSupabaseUrl = requiredValue(
    environment,
    "NEXT_PUBLIC_SUPABASE_URL",
  );

  if (KNOWN_PURPOSE_SECRET_PLACEHOLDERS.has(purposeSecret.toLowerCase())) {
    throw new Error("account-setup purpose secret is an example placeholder");
  }

  if (Buffer.byteLength(purposeSecret, "utf8") < MIN_PURPOSE_SECRET_BYTES) {
    throw new Error("account-setup purpose secret is too short");
  }

  if (supabaseUrl !== publicSupabaseUrl) {
    throw new Error("Supabase URL mismatch");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    validateWebPrivilegedEnv();
    console.log("server-only web environment configured");
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid environment";
    console.error(`server-only web environment invalid: ${message}`);
    process.exitCode = 1;
  }
}

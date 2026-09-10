export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL?.trim();

  if (!url) {
    throw new Error("SUPABASE_URL is not configured.");
  }

  return url;
}

export function getSupabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not configured.");
  }

  return key;
}

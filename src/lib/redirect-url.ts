/**
 * Appends query parameters to an internal path, preserving any existing
 * search params and producing exactly one `?` delimiter.
 */
export function appendSearchParams(
  path: string,
  params: Record<string, string>,
): string {
  const questionMarkIndex = path.indexOf("?");
  const pathname =
    questionMarkIndex === -1 ? path : path.slice(0, questionMarkIndex);
  const existingQuery =
    questionMarkIndex === -1 ? "" : path.slice(questionMarkIndex + 1);

  const searchParams = new URLSearchParams(existingQuery);

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
